# Khaadi ZIP file proxy

The Vercel `/api/drive/download-zip` route authorizes each selected dress and returns one-hour signed URLs for its files. The browser fetches those URLs from this Cloudflare Worker and builds the same ZIP structure locally. Original image bytes do not pass through Vercel.

## Configure

1. Deploy this Worker under the Cloudflare account that will serve the downloads. Set `APP_ORIGIN` in `wrangler.jsonc` to the actual production app origin, without a trailing slash. For any other app origin, configure an additional Worker or update the allowed-origin policy.
2. Set these Worker secrets using `wrangler secret put`: `ZIP_FILE_SIGNING_SECRET` (a random value of at least 32 bytes), `GOOGLE_SERVICE_ACCOUNT_EMAIL`, and `GOOGLE_SERVICE_ACCOUNT_KEY`. Use the same Google Drive service account that the Vercel app already uses, with access to the shoot folders. Never commit the key.
3. On the Vercel project, set `ZIP_FILE_SIGNING_SECRET` to the same value and `ZIP_FILE_WORKER_URL` to the deployed Worker's HTTPS origin. Deploy the Vercel app only after the Worker and both Vercel variables are ready. If either variable is missing, ZIP download requests return 503 rather than silently sending large ZIPs through Vercel.
4. Verify with an editor account and a review-only account: download a single dress, a collection, and a batch; check filenames and ZIP contents. Check Vercel Usage after the downloads. The manifest request should be small while Cloudflare handles file bytes.

The URL signatures expire after one hour. Start a new ZIP request if the download runs longer. Cloudflare Workers requests and Google Drive API use may have separate limits. On browsers with limited memory, assembling an exceptionally large ZIP may fail; this implementation keeps the file list and ZIP feature, but does not provide disk-backed streaming on iOS.
