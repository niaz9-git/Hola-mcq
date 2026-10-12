# MCQ site kit (GitHub + Cloudflare, free tiers)

## What lives where
| Piece | Where | Size (estimate) |
|---|---|---|
| Reader page + question data | GitHub Pages (this repo) | ~600 MB raw, mostly compressed on the way out |
| Images | Cloudflare Pages project | ~2 GB, ~14,500 files |
| The raw downloaded data and your token | **never in this repo** | - |

GitHub only runs the jobs and serves the files. It is not a database; the "database" is the static JSON files.

## One-time setup
1. Create a **public** GitHub repository and upload everything in this folder (drag and drop works in the browser).
   Then replace `data/image_urls.json` with your own `image_urls.json` from Google Drive.
2. Cloudflare: make a free account, then create an API token (My Profile > API Tokens) with the permission
   **Account > Cloudflare Pages > Edit**. Also copy your Account ID (dashboard sidebar).
3. In the GitHub repo: Settings > Secrets and variables > Actions
   - Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
   - Variables: `CF_IMAGES_PROJECT` = a project name you choose (for example `my-mcq-images`)
4. Settings > Pages > Source: choose **GitHub Actions**.

## Step 1 - images
Actions tab > "images - download all images and publish them" > Run workflow.
- First run with `limit` = 50 as a trial. It downloads 50 images and does not publish.
- Then run with `limit` = 0. It downloads everything and publishes to Cloudflare Pages.
- When it finishes, download the artifact `image-map` and put `image_map.json` into your Drive folder
  `site_images/` (create it). Your images will be at `https://<CF_IMAGES_PROJECT>.pages.dev/img/...`.

## Step 2 - build the question data (in Colab, where your downloaded data is)
    !python build_site_data.py --image-map site_images/image_map.json
    !cd site_data && zip -qr ../site_data.zip .
Images in the data now look like `{{IMG}}img/4/abc123.png`; `{{IMG}}` is a placeholder.

## Step 3 - publish the site
1. GitHub repo > Releases > Draft a new release, tag `data-1`, attach `site_data.zip`, publish.
   (Each file in a release can be up to 2 GiB.)
2. Add a repository variable `IMG_BASE` = `https://<CF_IMAGES_PROJECT>.pages.dev/` (ends with a slash).
   You can change it any time; rerun the workflow "site - publish the MCQ reader on GitHub Pages".
   Or leave `IMG_BASE` empty and edit `site/config.js` instead.
3. The Pages workflow runs when you publish the release (or run it by hand).

## Updating later
New questions appear in the app over time. Download again, rebuild `site_data`, publish a new release with the
same file name, and run the Pages workflow again.

## Not tested
These workflows were written without access to GitHub or Cloudflare, so the first run may need a small fix.
The Python scripts were tested on made-up data only.
