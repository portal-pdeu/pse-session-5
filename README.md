# NeonCart Bug Hunt

A CTF where players hunt bugs in **NeonCart**, an e-commerce app that "AI agents" built too fast. The
admin releases the app's code one module at a time. Players download it, run it, find the bug, and submit the
flag it prints.

## Self-hosting

This repository is public so anyone can run their own NeonCart Bug Hunt. Nothing in it points at a real project:
you bring your own Appwrite Cloud project and generate your own secrets.

- Create an Appwrite project and follow [Before you start](#before-you-start) and
  [One-time setup](#one-time-setup-of-the-appwrite-project). Generate fresh module salts with `npm run salts`;
  never reuse salts between events, or players from different events would share flags.
- The `.env` files, `appwrite/salts.json` and the generated `stage-NN/` folders are gitignored. Keep your API key
  and salts out of version control, and delete the API key when you are done.
- `docs/SOLUTIONS.html` is a full walkthrough of every bug. Do not hand it to players. The flag values in it are
  examples from a throwaway seed and do not work for your event.

**The challenge apps are deliberately vulnerable.** Everything under `modules-source/` contains real,
exploitable bugs (path traversal, missing authorization, forgeable tokens, and so on) and hardcoded values such as
the session signing key in stage 05 are part of the challenge, not leaked secrets. The stage apps listen on
`127.0.0.1` only. Do not expose them to a network or deploy them anywhere, and do not set `HOST=0.0.0.0` outside
a container you control.

## How the pieces fit

| Folder | What it is | Where it runs |
|---|---|---|
| `portal/` | The players' site (React + TypeScript). Login, module list, downloads, flag submission. | **Hosted** on Cloudflare Pages |
| `admin/` | The admin panel (React + TypeScript). Add players, release modules, leaderboard, reset. | **Your machine only.** Never hosted. |
| `appwrite/` | Sets up the Appwrite project, and the `ctf` Function that checks flags. | Appwrite Cloud |
| `modules-source/` | The NeonCart app itself, one snapshot per module (`stage-00` … `stage-05`). | Players' machines |

Player sign-in, data, stage downloads, and flag checks use one Appwrite Cloud project (Auth, TablesDB, Storage,
and one Function). There is no separately hosted API. The admin panel's small API runs only inside its
localhost-only Vite dev server.

- **Players** sign in to the portal with an email and password. Only the admin creates accounts.
- **Admin** uses the local panel, which talks to Appwrite with a server API key. The key stays on your machine.
- **Flags** are unique per player: each player has a private random seed, and the flag is derived from that seed
  and the module's salt. Salts are generated per event with `npm run salts`, kept in the gitignored
  `appwrite/salts.json`, deployed to the Function's settings, and injected into challenge snapshots at build
  time; the player seed keeps each player's flag unique.

## Before you start

You need Node.js 22 or newer and an Appwrite Cloud project.

1. **API key.** In the Appwrite console go to Overview → Integrations → API keys and create a key with these
   scopes: `databases`, `tables`, `columns`, `indexes`, `rows`, `buckets`, `files`, `users` (read and write
   for each), `sessions.write`, and `functions` (read and write). Delete the key when the event is over.
2. **Web platform.** Add a Web platform in Appwrite. Add `localhost` for development, and the exact hostname
   Cloudflare Pages gives your site (or your custom domain) for production. Without this the browser blocks calls
   to Appwrite.
3. **Email/password sign-in** must be on (Auth → Settings). It is by default.

Nothing points at a project until you fill it in: copy each folder's `env.sample` to `.env` and set
`APPWRITE_ENDPOINT` and `APPWRITE_PROJECT_ID` from your Appwrite console (Overview). The portal reads the
`VITE_` names from `portal/.env` at build time. The endpoint defaults to Appwrite Cloud's global URL; if your
project lives in a region, use that regional endpoint and update the CSP `connect-src` in `portal/public/_headers`.

## One-time setup of the Appwrite project

```bash
cd appwrite
npm install
cp env.sample .env          # put your API key and project id in .env

npm run salts               # generates the per-event module salts (gitignored)
npm run setup               # database, tables, permissions, the 6 modules, the stage zips
npm run deploy              # creates and deploys the flag-check Function
npm run check               # prints what exists, as a sanity check
```

Safe to run again; anything that already exists is left alone. Run `npm run setup -- --refresh-stages` after you
change the app code and rebuild the snapshots, to re-upload the zips.

## Run the admin panel (local)

```bash
cd admin
npm install
cp env.sample .env          # put the same API key in APPWRITE_API_KEY
npm run dev
```

Open <http://127.0.0.1:3000>. It listens on localhost only.

- **Players** – paste one line per player as `email,password` (8+ characters). Each player gets an account, the
  `player` label and a personal seed. Every line needs both parts; a line with only an email is rejected. You can
  also reset a player's wrong-flag attempts or delete them.
- **Modules** – *Release* opens a module to every player at once (and its zip becomes downloadable). *Lock*
  closes it again.
- **Leaderboard** – players ranked by points, then by who got there first. Players cannot see this.
- **Session** – clear progress, or delete every player, for a fresh run. Type `RESET` to confirm.

The panel does not refresh by itself, because database reads count against the Free plan's monthly limit. Use
the **Refresh** button.

## Run the portal (local)

```bash
cd portal
npm install
npm run dev
```

Open <http://localhost:5174> and sign in with a player account created in the admin panel.

## Deploy the portal to Cloudflare Pages

Build locally, then create a Pages project with **Direct Upload** and upload the generated `portal/dist/`
directory (or its contents) from the Cloudflare dashboard:

```bash
cd portal
npm install
npm run build
```

The portal reads `VITE_APPWRITE_ENDPOINT` and `VITE_APPWRITE_PROJECT_ID` from `portal/.env` (see
`portal/env.sample`) when it is built, so create that file before building. Add the hostname Cloudflare gives your site as a **Web platform** in Appwrite before
testing sign-in; Appwrite only allows browser requests from registered hostnames. The checked-in `public/_headers`
file allows requests to the configured Appwrite endpoint. If you build for a different endpoint, set the Vite
variables before building and update the CSP `connect-src` value in `public/_headers` too.

Direct Upload is the manual deployment path. Cloudflare does not let a Direct Upload project later switch to Git
integration; create a separate project if you later want Git-based deployments.

`npm run build` ends with a build check (`portal/scripts/check-dist.mjs`) that fails the build, and so the
Cloudflare deploy, if the output contains an API key, a module salt, source maps or an env file, or if the
security headers are missing or weakened. A GitHub Actions workflow (`.github/workflows/ci.yml`) runs all the
tests and this build on every push.

`portal/public/_headers` is copied into the build and gives the site a strict Content-Security-Policy (scripts
only from the site itself, network calls only to `cloud.appwrite.io`), no framing, no referrer, and
`noindex`. `robots.txt` asks crawlers to stay away. If you point the portal at a regional Appwrite endpoint, change
`connect-src` in `_headers` too.

### Before the event: lock the project down

Anyone can sign up to an Appwrite project that has email/password on, using the public project id. They get no
`player` label, so they can read nothing, but do this so they cannot pile up or use your quota:

1. The `ctf` Function can only be called by users with the `player` label (`npm run deploy` sets this and
   `npm run check` verifies it), so junk accounts cannot burn the monthly executions.
2. Console → Auth → Settings → **Limit users**: set it to the number of players plus a few spare, and raise it
   when you add more. Also set a short session duration and a maximum number of sessions per user.
3. Console → Overview → Platforms: keep the Pages hostname. `localhost` is only needed while you run the portal
   on your own machine (the admin panel does not need it, it uses the API key); remove it once you stop testing locally.
4. Give every player a unique random password, never a shared one.
5. Watch Console → Usage and Auth during the event. Delete odd accounts from the admin panel.
6. Delete the API key when the event is over.

## Tests

```bash
cd appwrite && npm test                    # flag validation, submission rules, and portal module data
cd admin && npm test                       # the admin panel's operations (in memory)

# against the real Appwrite project (creates throwaway users and removes them again)
cd appwrite && npm run test:live           # needs the API key in appwrite/.env
cd admin && npm run test:live              # needs the API key in admin/.env
```

`npm run typecheck` in `portal/` and `admin/` runs the TypeScript checks.

## Running a session

1. Create player accounts in the local admin panel and give each player their email and password.
2. Release modules from the admin **Modules** tab. Each release makes that module and its zip available to all
   players immediately; there is no countdown or player unlock mechanic.
3. A player downloads the zip and runs the app with the seed shown in their portal account, for example:
   `PLAYER_SEED=your_seed_here node server.js` (replace the example value with their seed). The app runs at
   <http://localhost:3307> by default. The same seed can instead be pasted into `config/player-license.json`.
4. Players submit flags in the portal. Each module allows three wrong flag attempts; an admin can reset one
   module's attempts or all attempts from the **Players** tab.
5. Use the admin-only **Leaderboard** tab to follow scores. **Session** can clear progress and re-lock modules,
   or also delete player accounts.

## Changing the app code

The editable source is in `modules-source/stage-defs/`. The `stage-00` … `stage-05` folders are generated; do not
edit them by hand. After changing the source, rebuild the snapshots and re-upload the zips:

```bash
node modules-source/tools/build-stages.mjs
cd appwrite && npm run setup -- --refresh-stages
```

## Scoring

Each flag is worth points that grow faster than linearly with its difficulty, and the last, hardest module is worth
a bit more again. 1,900 points in total, no bonuses.

| Module | Points |
|---|---|
| 00 Project Scaffold (intro) | 50 |
| 01 Diagnostics (very easy) | 100 |
| 02 Support Tickets (easy) | 200 |
| 03 Billing & Checkout (easy–medium) | 350 |
| 04 Profile & File Uploads (medium) | 500 |
| 05 Sessions & Tokens (hardest) | 700 |

The numbers live in `MODULES` in `appwrite/schema.mjs`. After changing them, update `portal/src/modules.ts` to match
(a test checks that) and run `npm run setup` in `appwrite/` so the database has them. Points already earned keep the
value they were worth when they were scored.

## License

MIT, see [LICENSE](LICENSE). The challenge apps in `modules-source/` are intentionally vulnerable; use them at your own risk.
