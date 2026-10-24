# Contact Center sign-in helper

The Contact Center (`contact-center.html`) shows the repository's GitHub issues
as three tabs — bug reports, suggestions, requests — and lets a visitor post and
reply from the page after signing in with GitHub.

Reading needs nothing. Posting needs a user token from a **GitHub App**, and
GitHub hands one out only in exchange for the App's client secret. This Worker
holds that secret and does that one exchange (plus the renewal every 8 hours).
It stores nothing.

Until its two secrets are set, `/config` answers `{"configured":false}` and the
page sends people to GitHub's own issue forms instead. Nothing on the site has
to be rebuilt when the secrets are set.

## Setting it up

### 1. Create the GitHub App

<https://github.com/settings/apps/new>

| Field | Value |
|---|---|
| GitHub App name | `Pokerole Dynamic Sheets` (any free name) |
| Homepage URL | `https://tearmoon96.github.io/Pokerole-Dynamic-Sheets/` |
| Callback URL | `https://tearmoon96.github.io/Pokerole-Dynamic-Sheets/contact-center.html` |
| Expire user authorization tokens | ✅ on |
| Request user authorization (OAuth) during installation | off |
| Enable Device Flow | off |
| Webhook → Active | **off** |
| Repository permissions → Issues | **Read and write** |
| Everything else | No access |
| Where can this GitHub App be installed? | **Any account** |

"Any account" is required: a private App can be signed into only by its owner.
It does not let anyone into your repositories — what a visitor's token can do is
limited by the App's permissions (issues only), by where the App is installed,
and by `repository_id` (this repository only).

For local testing add two more callback URLs:
`http://localhost:8099/contact-center.html` and
`http://localhost:5173/contact-center.html`.

### 2. Install it on the repository

On the App's page: **Install App** → your account → **Only select repositories**
→ `Pokerole-Dynamic-Sheets`.

### 3. Give the Worker the id and a secret

On the App's page copy the **Client ID** (starts with `Iv`), then
**Generate a new client secret** and copy it (it is shown once). Then:

```sh
cd contact-worker
npx wrangler secret put GITHUB_CLIENT_ID       # paste the Client ID
npx wrangler secret put GITHUB_CLIENT_SECRET   # paste the secret
```

Check: `curl https://pokerole-contact.tearmoon96.workers.dev/config` answers
`{"configured":true,"clientId":"Iv…"}`.

## Moderating

Everything happens on GitHub: delete a post (… → Delete issue), lock a
conversation, block a user, or set temporary interaction limits under
Settings → Moderation options. The page shows whatever GitHub has.

## Testing

```sh
node .verify/contact-mock.mjs 8788 &                    # a fake GitHub
printf 'GITHUB_CLIENT_ID=Iv23test\nGITHUB_CLIENT_SECRET=test-secret\nGITHUB_OAUTH=http://localhost:8788\n' > contact-worker/.dev.vars
(cd contact-worker && npx wrangler dev --port 8789) &
node scripts/static-server.mjs "$PWD/PDS React Develop" 8099 &
node .verify/contact-e2e.mjs                            # ~75 checks
node .verify/contact-live-read.mjs <issue> <tab>        # the real API, reads only
```

## Deploying

```sh
cd contact-worker && npm install && npx wrangler deploy
```

If the site ever moves to another domain, add it to `SITE_ORIGINS` in
`src/index.ts`, redeploy, and add the new callback URL to the App.
