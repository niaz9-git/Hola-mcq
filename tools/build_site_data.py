#!/usr/bin/env python3
"""
Convert the downloaded data into static files a website can read.

  python build_site_data.py                           -> site_data/
  python build_site_data.py --image-map site_images/image_map.json     (images become {{IMG}}img/d/hash.png)
  python build_site_data.py --chunk 128 --in livemcq_out --out site_data

Output:
  tree.json         category tree: {"roots":[{"i":id,"n":name,"c":count,"t":subtopics,"k":[children]}]}
  t/<tag id>.json   {"n": count, "s": [question numbers in the APP's order]}
  q/<chunk>.json    128 questions each, compact keys: i id, q text, o options, a answer, e explanation
  meta.json         totals and settings

Each distinct question is stored ONCE. Questions are numbered in tree order (children first, then a
parent's own questions) so a topic's questions sit in the same few chunk files.
"""
import argparse
import json
import os
import re
import sys
import time

IMG_RE = re.compile(r'(<img[^>]+src=["\']?)([^"\' >]+)', re.I)


def make_rewriter(image_map, prefix, stats):
    if not image_map:
        return lambda s: s

    def sub(m):
        local = image_map.get(m.group(2))
        if local:
            stats["rewritten"] += 1
            return m.group(1) + prefix + local
        stats["remote"] += 1
        if len(stats["remote_samples"]) < 5:
            stats["remote_samples"].append(m.group(2))
        return m.group(0)

    return lambda s: IMG_RE.sub(sub, s) if "<" in s else s


def compact(q, rw):
    opts = [q.get("option%d" % i) or "" for i in range(1, 6)]
    while opts and not opts[-1]:
        opts.pop()
    d = {"i": q["id"], "q": rw(q.get("question") or ""), "o": [rw(x) for x in opts], "a": q.get("answer")}
    if q.get("explain"):
        d["e"] = rw(q["explain"])
    if q.get("syllabus"):
        d["s"] = q["syllabus"]
    return d


def dump(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="in_dir", default="livemcq_out")
    ap.add_argument("--out", default="site_data")
    ap.add_argument("--chunk", type=int, default=128)
    ap.add_argument("--image-map", default="")
    ap.add_argument("--img-base", default="{{IMG}}",
                    help='what goes in front of each image path. Default "{{IMG}}" is a placeholder the web page '
                         'replaces with your IMG_BASE setting; or give a real address such as https://images.example.pages.dev/')
    a = ap.parse_args()

    image_map = {}
    if a.image_map:
        with open(a.image_map, encoding="utf-8") as f:
            image_map = json.load(f)
        print("image map: %d images" % len(image_map))
    stats = {"rewritten": 0, "remote": 0, "remote_samples": []}
    rw = make_rewriter(image_map, a.img_base, stats)

    with open(os.path.join(a.in_dir, "tree_cache.json"), encoding="utf-8") as f:
        tc = json.load(f)

    def build(level, parent, anc):
        out = []
        for t in tc.get("%d:%d" % (level, parent), []):
            tid = t.get("id") or t.get("tag_id")
            if not tid or tid in anc:
                continue
            out.append({"id": tid, "name": t.get("name", ""), "qn": t.get("question_number"),
                        "nt": t.get("number_of_tags") or 0, "kids": build(level + 1, tid, anc | {tid})})
        return out

    roots = build(1, -1, frozenset())
    for d in ("q", "t"):
        os.makedirs(os.path.join(a.out, d), exist_ok=True)

    seq, buf, st = {}, [], {"chunk": 0}
    done, counts, warn = set(), {}, []

    def flush():
        if buf:
            with open(os.path.join(a.out, "q", "%d.json" % st["chunk"]), "w", encoding="utf-8") as f:
                f.write(dump(buf))
            st["chunk"] += 1
            buf.clear()

    def visit(node):
        for k in node["kids"]:
            visit(k)
        tid = node["id"]
        if tid in done:
            return
        done.add(tid)
        fp = os.path.join(a.in_dir, "tags", "%s.json" % tid)
        if not os.path.exists(fp):
            warn.append("no file for tag %s" % tid)
            lst = []
        else:
            with open(fp, encoding="utf-8") as f:
                qs = json.load(f)["questions"]
            lst = []
            for q in qs:
                s = seq.get(q["id"])
                if s is None:
                    s = len(seq)
                    seq[q["id"]] = s
                    buf.append(compact(q, rw))
                    if len(buf) == a.chunk:
                        flush()
                lst.append(s)
        counts[tid] = len(lst)
        with open(os.path.join(a.out, "t", "%s.json" % tid), "w", encoding="utf-8") as f:
            f.write(dump({"n": len(lst), "s": lst}))
        if isinstance(node["qn"], int) and node["qn"] != len(lst):
            warn.append("tag %s: tag list says %s, downloaded %d" % (tid, node["qn"], len(lst)))
        if len(done) % 200 == 0:
            print("   %d tags, %d distinct questions" % (len(done), len(seq)))

    for r in roots:
        visit(r)
    flush()

    def tj(n):
        return {"i": n["id"], "n": n["name"], "c": counts.get(n["id"], n["qn"] or 0), "t": n["nt"],
                "k": [tj(k) for k in n["kids"]]}

    with open(os.path.join(a.out, "tree.json"), "w", encoding="utf-8") as f:
        f.write(dump({"roots": [tj(r) for r in roots]}))
    meta = {"questions": len(seq), "chunk": a.chunk, "chunks": st["chunk"], "tags": len(done),
            "img_base": a.img_base, "built": time.strftime("%Y-%m-%d %H:%M")}
    with open(os.path.join(a.out, "meta.json"), "w", encoding="utf-8") as f:
        f.write(dump(meta))

    def size(sub):
        tot, n = 0, 0
        for fn in os.listdir(os.path.join(a.out, sub)):
            tot += os.path.getsize(os.path.join(a.out, sub, fn))
            n += 1
        return n, tot / 1e6

    print("\n===== BUILD REPORT =====")
    print("distinct questions: %d | tags: %d | chunk size: %d" % (len(seq), len(done), a.chunk))
    print("q/ files: %d, %.0f MB | t/ files: %d, %.1f MB" % (size("q")[0], size("q")[1], size("t")[0], size("t")[1]))
    if image_map:
        print("image links rewritten: %d | left as remote: %d %s" % (stats["rewritten"], stats["remote"], stats["remote_samples"]))
    print("warnings: %d" % len(warn))
    for w in warn[:15]:
        print("   ", w)
    print("output:", a.out)


if __name__ == "__main__":
    main()
