# The Rolling Table relay

A shared dice table needs one thing GitHub Pages cannot provide: somewhere for
two browsers to meet. Pages serves files and runs no code, so this is that
place — and deliberately nothing more.

**It cannot read a single roll.** Clients derive an AES-GCM key and a 32-character
room address from the lobby id and the password. The relay is told the address
and nothing else, and the address cannot be turned back into either half. Every
payload is encrypted and signed before it arrives here. A relay that was breached
outright could drop or delay messages; it could not read one or forge one.

That is why the limits below are all about volume and never about content.

| Limit | Value | Why |
|---|---|---|
| Message size | 32 KB | Fits a joiner's history sync; useless as storage |
| Sockets per room | 16 | A leaked password cannot become an unbounded room |
| Rate | 40 messages / 10 s per socket | One loud client cannot drown the others |
| Idle teardown | 6 hours | Abandoned rooms do not hold connections open, and their files are deleted |
| File part | 1 MiB | Under SQLite's 2 MB row; a file is up to 64 parts. A longer upload is read to its end (an unread body breaks the runtime) but no more than 1 MiB of it is held |
| Files per room | 256 MB | The oldest files go first when a new part would pass it |
| Pages | the site and `localhost` | A browser names the page a socket or request comes from, so another website cannot spend this account's allowance through its visitors. A request naming no page (not a browser) is let through: the limits above are what hold it |

The idle alarm is a storage write, so a busy room moves it at most every five
minutes rather than on every message.

### The file store and the clock

The shared map and the music move files that a 32 KB frame cannot carry, so a
room also keeps files, in its Durable Object's own SQLite:

| Route | What |
|---|---|
| `POST /room/<addr>/claim` | The GM's page takes the room on connect, with a random upload key. The first claim wins; only the key's hash is stored |
| `PUT /room/<addr>/blob/<id>/<part>` | One sealed part. Needs the upload key |
| `GET /room/<addr>/blob/<id>/<part>` | One part, to anyone with the address |
| `GET /room/<addr>/blob/<id>` | Which parts exist — how the GM notices a file was dropped |
| `DELETE /room/<addr>/blob/<id>` | Needs the upload key |

Every part is sealed with the room key before it is sent, so the store is as
blind as the socket. A socket frame `\u0001t<n>` is the table's clock: it is
answered to its sender alone with this object's time and never forwarded.

Neither needs a change to `wrangler.toml`: the class is already SQLite-backed,
so there is no new migration. Redeploy after pulling these changes.

---

## One-time setup

You need a Cloudflare account. The Workers free plan needs **no credit card**.

```sh
cd worker
npm install
npx wrangler login          # opens a browser to authorise this machine
npx wrangler deploy
```

`deploy` prints the URL it published to, something like:

```
https://pokerole-rolling-table.your-name.workers.dev
```

**Take that URL, change `https://` to `wss://`, and paste it into
`src/table/relay.ts`** as `PRODUCTION_RELAY`. Then rebuild and publish the site
as usual:

```sh
cd ..
npm run deploy              # builds + assembles PDS React Deploy/
```

Until that constant is set, the rolling table shows a setup notice instead of a
join form rather than failing somewhere in a socket handshake.

### What the free plan covers

100,000 requests a day. One message from one player costs one request. A
five-person table playing for four hours, heartbeats included, runs to a few
thousand — so the ceiling is somewhere around a hundred simultaneous tables all
day, every day, which is a different order of problem from the one this solves.

---

## Testing it locally, before anything is deployed

Two terminals.

**Terminal 1 — the relay:**

```sh
cd worker
npm run dev                 # http://localhost:8787
```

**Terminal 2 — the app:**

```sh
npm run dev                 # http://localhost:5173
```

Then open, once per browser:

```
http://localhost:5173/rolling-table.html?relay=ws://localhost:8787
```

The `?relay=` is remembered, so subsequent loads need only
`http://localhost:5173/rolling-table.html`. Passing `?relay=` with nothing after
it clears the override again.

**Use two separate browser profiles**, not two tabs. The lobby session and the
signing keys live in localStorage and IndexedDB, which every tab of one profile
shares — so a second tab restores the first tab's identity, IS the same person,
and takes the table over while the first tab stands down. A normal window plus
a private window is the quickest split; a second browser gives you a third seat.

Then: create a table in one, copy the invite, join from the other.

`npm run tail` streams the deployed relay's logs if you ever need to watch a
live table connect.

### Removing the local seam

The `?relay=` override lives in one clearly marked block in
`src/table/relay.ts`. It is **already inert on a real origin** — it is only
honoured on `localhost`, `127.0.0.1` and `file://`, so a link like
`…github.io/rolling-table.html?relay=wss://attacker.example` does nothing. That
check is the point: without it, a link could move somebody's table onto a relay
of the sender's choosing.

So it is safe to leave in place. Delete the block if you would rather not carry
it, and the file falls back to `PRODUCTION_RELAY` alone.

---

## Changing the relay later

`wrangler.toml` pins the Durable Object class name and its migration tag.
Migrations are append-only: **do not edit or remove `[[migrations]] tag = "v1"`**
after the first deploy, or Cloudflare will refuse the next one. Adding a class
later means adding a `v2` block, not rewriting `v1`.

Redeploying drops every open socket. Clients reconnect on their own with
exponential backoff, and the GM keeps their identity across it — so a redeploy
mid-session interrupts a table for a few seconds rather than ending it.

---

## How much it is used

The relay counts, in Workers Analytics Engine (dataset `pokerole_table`, free
plan: 100,000 points written a day, kept about three months), two things and
only numbers in either — no room address, no IP, no name:

| Point | When | Numbers |
|---|---|---|
| `join` | a socket opens | how many are in the room with it |
| `session` | a room empties, or is wiped idle | the most people it held at once, its minutes |

A session's peak is the head count: a reload or a dropped connection is a
second `join` but not a second person.

```sh
npm run stats          # the last 30 days, a line a day
npm run stats -- 90    # the last 90
```

It needs an API token with **Account › Account Analytics › Read** (Cloudflare
dashboard › My Profile › API Tokens › Create Token › Custom token), saved in
`worker/.stats-token` (gitignored) or passed as `CF_STATS_TOKEN`. A table shows
up once everyone has left it; a GM alone, preparing, counts as "solo".
