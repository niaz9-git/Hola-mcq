#!/usr/bin/env python3
"""
Download every image that appears inside questions / options / explanations.

  python download_images.py                    uses image_urls.json if present, else scans <in>/tags/*.json
  python download_images.py --rescan           rebuild the URL list from the tag files first
  python download_images.py --limit 200        trial run: only the first 200 images
  python download_images.py --workers 8        parallel downloads
  python download_images.py --allow amazonaws.com,assets.livemcq.com   only these hosts (default: all)
  python download_images.py --retry-failed     also retry images that failed permanently (404/403/not an image)

Output:  <out>/img/<first hex digit>/<hash>.<ext>      and      <out>/image_map.json
         image_map.json maps  original URL -> "img/<d>/<hash>.<ext>"
Rerun any time: finished files are skipped.
No login token is ever sent: images are fetched with plain, unauthenticated requests.
"""
import argparse
import concurrent.futures as cf
import glob
import hashlib
import json
import os
import re
import threading
import time
from urllib.parse import urlparse

import requests

EXTS = {"png", "jpg", "jpeg", "gif", "webp", "svg"}
CT_EXT = {"image/png": "png", "image/jpeg": "jpg", "image/gif": "gif",
          "image/webp": "webp", "image/svg+xml": "svg"}
PERMANENT = ("HTTP 400", "HTTP 401", "HTTP 403", "HTTP 404", "HTTP 410")
IMG_RE = re.compile(r'<img[^>]+src=["\']?([^"\' >]+)', re.I)
FIELDS = ("question", "option1", "option2", "option3", "option4", "option5", "explain")

local = threading.local()


def session():
    if not hasattr(local, "s"):
        local.s = requests.Session()        # deliberately no Authorization header
        local.s.headers["user-agent"] = "Mozilla/5.0 (offline reader image fetch)"
    return local.s


def scan_urls(tags_dir):
    urls = set()
    files = glob.glob(os.path.join(tags_dir, "*.json"))
    for i, fp in enumerate(files, 1):
        with open(fp, encoding="utf-8") as f:
            for q in json.load(f)["questions"]:
                for k in FIELDS:
                    urls.update(IMG_RE.findall(q.get(k) or ""))
        if i % 200 == 0:
            print("   scanned %d/%d tag files" % (i, len(files)))
    return sorted(urls)


def name_prefix(url):
    return hashlib.sha1(url.encode("utf-8")).hexdigest()[:20]


def pick_ext(url, content_type):
    ext = os.path.splitext(urlparse(url).path)[1].lower().lstrip(".")
    if ext in EXTS:
        return ext
    return CT_EXT.get((content_type or "").split(";")[0].strip().lower(), "bin")


def fetch(url, out_dir, retries=4):
    reason = "unknown"
    for attempt in range(retries):
        try:
            r = session().get(url, timeout=(10, 60))
        except requests.RequestException as e:
            reason = type(e).__name__
        else:
            if r.status_code == 200:
                ct = r.headers.get("Content-Type", "")
                if not ct.lower().startswith("image/"):
                    return None, "not an image (%s)" % ct[:30]
                p = name_prefix(url)
                rel = "img/%s/%s.%s" % (p[0], p, pick_ext(url, ct))
                fp = os.path.join(out_dir, rel)
                os.makedirs(os.path.dirname(fp), exist_ok=True)
                tmp = fp + ".tmp"
                with open(tmp, "wb") as f:
                    f.write(r.content)
                os.replace(tmp, fp)
                return rel, len(r.content)
            reason = "HTTP %d" % r.status_code
            if reason in PERMANENT:
                return None, reason
        time.sleep(2 ** (attempt + 1) * 0.5)
    return None, reason


def is_permanent(reason):
    return reason in PERMANENT or reason.startswith("not an image")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="in_dir", default="livemcq_out")
    ap.add_argument("--out", default="site_images")
    ap.add_argument("--urls", default="image_urls.json")
    ap.add_argument("--rescan", action="store_true")
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--allow", default="all", help='"all" or a comma list of host fragments')
    ap.add_argument("--retry-failed", action="store_true")
    a = ap.parse_args()

    os.makedirs(os.path.join(a.out, "img"), exist_ok=True)
    map_fp = os.path.join(a.out, "image_map.json")
    fail_fp = os.path.join(a.out, "image_failed.json")

    if a.rescan or not os.path.exists(a.urls):
        print("Scanning tag files for image links ...")
        urls = scan_urls(os.path.join(a.in_dir, "tags"))
        with open(a.urls, "w", encoding="utf-8") as f:
            json.dump(urls, f)
    else:
        with open(a.urls, encoding="utf-8") as f:
            urls = json.load(f)

    if a.allow.strip().lower() == "all":
        mine = [u for u in urls if u.startswith("http")]
    else:
        allow = [x.strip() for x in a.allow.split(",") if x.strip()]
        mine = [u for u in urls if u.startswith("http") and any(h in urlparse(u).netloc for h in allow)]
    mine_set = set(mine)
    print("image links: %d | to download: %d | not downloaded (filtered): %d" % (len(urls), len(mine), len(urls) - len(mine)))

    have = {}
    if os.path.exists(map_fp):
        with open(map_fp, encoding="utf-8") as f:
            have = json.load(f)
    failed = {}
    if os.path.exists(fail_fp):
        with open(fail_fp, encoding="utf-8") as f:
            failed = json.load(f)

    on_disk = {}
    for root, _dirs, files in os.walk(os.path.join(a.out, "img")):
        for fn in files:
            if not fn.endswith(".tmp"):
                rel = os.path.relpath(os.path.join(root, fn), a.out).replace(os.sep, "/")
                on_disk[fn.split(".")[0]] = rel

    todo, skipped_perm = [], 0
    for u in mine:
        if u in have and os.path.exists(os.path.join(a.out, have[u])):
            continue
        p = name_prefix(u)
        if p in on_disk:
            have[u] = on_disk[p]
            continue
        if u in failed and is_permanent(failed[u]) and not a.retry_failed:
            skipped_perm += 1
            continue
        todo.append(u)
    if a.limit:
        todo = todo[:a.limit]
    msg = "already have: %d | permanently failed earlier (skipped): %d | downloading now: %d (workers=%d)"
    print(msg % (len(have), skipped_perm, len(todo), a.workers))

    t0, done, nbytes = time.time(), 0, 0

    def save():
        with open(map_fp, "w", encoding="utf-8") as f:
            json.dump(have, f)
        with open(fail_fp, "w", encoding="utf-8") as f:
            json.dump(failed, f)

    ex = cf.ThreadPoolExecutor(max_workers=a.workers)
    futs = {ex.submit(fetch, u, a.out): u for u in todo}
    try:
        for fut in cf.as_completed(futs):
            u = futs[fut]
            rel, info = fut.result()
            done += 1
            if rel:
                have[u] = rel
                failed.pop(u, None)
                nbytes += info
            else:
                failed[u] = info
            if done % 250 == 0 or done == len(todo):
                el = time.time() - t0
                print("   %d/%d | %.0f MB | %d failed | %.1f img/s" % (done, len(todo), nbytes / 1e6, len(failed), done / max(el, 1)))
                save()
    except KeyboardInterrupt:
        print("\nInterrupted: progress saved; rerun to continue.")
        ex.shutdown(wait=False, cancel_futures=True)
    finally:
        save()
    reasons = {}
    for u, r in failed.items():
        if u in mine_set:
            reasons[r] = reasons.get(r, 0) + 1
    print("\nDONE. images on disk: %d | failed: %d %s" % (len(have), sum(reasons.values()), reasons))
    print("map:", map_fp)


if __name__ == "__main__":
    main()
