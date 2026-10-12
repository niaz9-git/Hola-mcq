#!/usr/bin/env python3
"""
Point the images at the address you want, without rebuilding anything.

  python set_image_base.py --dir site_data --base https://my-images.pages.dev/
  python set_image_base.py --dir site_data --from https://old.example/ --base https://new.example/

Rewrites the placeholder {{IMG}} (or the --from address) inside site_data/q/*.json.
Alternatively leave the placeholder and set IMG_BASE in the web page's config.js instead.
"""
import argparse
import glob
import os


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default="site_data")
    ap.add_argument("--base", required=True, help="new address, e.g. https://my-images.pages.dev/ (use '' for same site)")
    ap.add_argument("--from", dest="old", default="{{IMG}}")
    a = ap.parse_args()
    base = a.base
    if base and not base.endswith("/"):
        base += "/"
    files = sorted(glob.glob(os.path.join(a.dir, "q", "*.json")))
    changed = hits = 0
    for fp in files:
        with open(fp, encoding="utf-8") as f:
            text = f.read()
        n = text.count(a.old)
        if n:
            with open(fp + ".tmp", "w", encoding="utf-8") as f:
                f.write(text.replace(a.old, base))
            os.replace(fp + ".tmp", fp)
            changed += 1
            hits += n
    print("%d chunk files changed, %d image links now start with %r" % (changed, hits, base))


if __name__ == "__main__":
    main()
