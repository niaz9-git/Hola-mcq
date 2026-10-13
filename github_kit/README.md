# MCQ site kit - phone + PC, works offline (GitHub runs it, Cloudflare Pages hosts it)

## What lives where
| Piece | Where |
|---|---|
| Code, the two workflows | this GitHub repository (public) |
| Question data zip (`site_data.zip`) | GitHub release tagged `data` |
| Image zips + `image_map.json` | GitHub release tagged `images` |
| The finished website (reader + questions + images, one address) | Cloudflare Pages project |
| Your token and the raw downloaded data | **never uploaded** |

Everything is one website on one address, so images load fast and can be saved for offline use.
Free-tier limits to keep in mind: Cloudflare Pages allows 20,000 files and 25 MiB per file; a release file must be under 2 GiB.
Expected file count: about 1,200 question files + 1,250 topic lists + about 14,500 images = about 17,000.

## One-time setup
1. Create a **public** GitHub repository and upload everything in this folder (drag and drop works in the browser).
2. Replace `data/image_urls.json` with your own `image_urls.json` from Google Drive
   (or create it in Colab: `!python download_images.py --scan-only`).
3. Cloudflare: free account, then an API token (My Profile > API Tokens) with **Account > Cloudflare Pages > Edit**.
   Copy your Account ID.
4. GitHub repo > Settings > Secrets and variables > Actions
   - Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
   - Variable: `CF_PROJECT` = the name you want, for example `my-mcq` (the site becomes https://my-mcq.pages.dev)

## Step 1 - download all images once
Actions > "images - download all images once and keep them in a release" > Run workflow.
First with `limit` = 50 (trial, nothing uploaded), then with `limit` = 0 (everything).
It stores 4 zips and `image_map.json` in the release `images`.
Later runs only download images that are new.

## Step 2 - build the question data (Colab, where your downloaded data is)
Download `image_map.json` from the `images` release into your Drive folder `site_images/`, then:
    %cd "/content/drive/MyDrive/Live Mcq/Claude"
    !python build_site_data.py --image-map site_images/image_map.json --image-dir site_images --out /content/site_data
    !cd /content/site_data && zip -qr "/content/drive/MyDrive/Live Mcq/Claude/site_data.zip" .
Images in the data look like `{{IMG}}img/4/abc.png`. `{{IMG}}` is replaced by `IMG_BASE` in `site/config.js`
(empty = the same website, which is what this setup uses).

## Step 3 - publish
1. GitHub > Releases > Draft a new release with tag `data`, attach `site_data.zip`, publish.
   (Publishing starts the deploy workflow; you can also run "deploy" by hand from the Actions tab.)
2. When it finishes, open https://<CF_PROJECT>.pages.dev

## Use it on phone and PC
- Open the address. Phone: browser menu > "Add to Home screen" / "Install app". PC (Chrome/Edge): the install icon in the address bar.
- Open a topic > **Save for offline**. It saves that topic, all its subtopics, and their images on this device.
  Menu (...) > **Offline storage** shows what is saved and lets you delete it.
- Saving everything is roughly 2.5 GB, so save the categories you study. Browsers may clear saved data if the device runs low on space.
- Your read marks and favourites live in each browser. Menu > Export progress / Import progress moves them between devices.

## Preview on your own computer
Unzip `site_data.zip` into `site/data`, put the images in `site/img` (optional), then in the `site` folder run
`python -m http.server 8000` and open http://localhost:8000 (localhost counts as secure, so offline saving works there too).

## Updating later
New questions appear in the app over time. Download again, rebuild `site_data.zip`, upload it to the `data` release
(replace the old file), and run "deploy". Old offline copies on devices are cleared automatically when the data changes.

## Not tested
The workflows were written without access to GitHub or Cloudflare, so the first run may need a small fix.
The reader and the service worker were tested with a browser simulation on made-up data, not on a real phone, a real
iPhone, or your full data.
