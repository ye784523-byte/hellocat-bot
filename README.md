# Hello Cat

> `[ HELLO CAT // SECURITY OPERATIONS TERMINAL ]`
>
> A production-minded cybersecurity community bot for Discord: CTF challenges, training simulations, operator progression, CATCOINS cosmetics, moderation and administrator tooling.
>
> *The white rabbit left a trail. The black cat reads it.*

Hello Cat is a self-contained Node.js Discord bot. It stores data in local JSON files (no database server), hashes challenge flags with a keyed HMAC, and keeps every cybersecurity exercise inside fictional, authorized lab scenarios. It **never executes host shell commands from Discord input**.

---

## 1. Project overview

Hello Cat is designed for a Discord server that wants a coherent security-training experience rather than a pile of disconnected commands:

- A dark terminal-style interface with consistent embeds, colors, footers and timestamps.
- A complete CTF engine with categories, difficulties, hints, attempt limits, duplicate-submission protection and private flag verification.
- Player XP, eight ranks, achievements, daily operations and streaks.
- Four training games: quiz, command reconstruction, simulated terminal, cryptography drill.
- A cosmetic CATCOIN economy with no real-world value.
- Permission-protected moderation and administration with audit logging.
- Local JSON storage with atomic writes, backup rotation and corruption quarantine/recovery.

---

## 2. Features

### CTF engine
- Challenge IDs, title, description, objective, category, difficulty, XP reward.
- Hints (free or CATCOIN-priced), optional attempt limits, active/published state.
- Prerequisites: a challenge can require other challenges to be captured first. The gate is evaluated per operator, so the entry is sealed for one operator and open for another.
- Flags stored as HMAC-SHA256 hashes, never plaintext in the runtime data store.
- Public responses never include expected flags.
- Submission history, per-challenge statistics and duplicate-solve protection.
- Categories: Linux, Networking, Web Security, Cryptography, Digital Forensics, OSINT, Programming, General Security.
- Difficulties: Easy, Medium, Hard, Expert.
- Built-in offline `/tools` toolkit for decoding, classical ciphers, XOR, Vigenere, hashing, JWT inspection and artifact analysis.

### Progression
- Ranks: Script Kiddie → Packet Scout → Terminal Runner → Cyber Analyst → Exploit Researcher → Security Engineer → Ghost Operator → Root Access.
- XP from challenge captures, daily operations, games and achievements.
- Idempotency keys prevent repeated XP rewards for the same source.
- Achievements: First Blood, Terminal Ghost, Cipher Breaker, Daily Operator, Root Hunter, Polyglot, Night Shift, Cat Burglar.

### Games
- `/quiz` — five-question cybersecurity quiz with explanations.
- `/guesscommand` — choose the correct Linux command for a scenario.
- `/terminal` — simulated filesystem puzzle; whitelisted, sandboxed command semantics only.
- `/decrypt` — Caesar/ROT13/Atbash/reversal/hex cryptography drills.
- `/daily` — today's daily operation selected deterministically in the configured timezone.

### Web terminal
- A browser-based Kali-style terminal for solving challenges (`npm run web`).
- Fully simulated: an in-memory filesystem, ~90 commands, pipelines, redirection, globbing, aliases and history — no host command execution, ever.
- Per-challenge lab environments (`web/labs/*.json`) place the artefacts a solver needs on the simulated host.
- Includes a compact Python subset so the scripting challenges are solvable in the terminal.
- Discord OAuth2 sign-in; the Discord user id is the operator id, so web progress and bot progress are the same progress.
- Shares the challenge store and the flag hash scheme with the bot.
- **Flags are submitted here, not in the channel.** Every capture is announced by the bot afterwards.
- See [`web/README.md`](web/README.md) for the full guide.

### Landing page
- The root of the web process serves a Matrix-style front door: it explains why Hello Cat exists, what the range contains and how to join.
- Public, no sign-in: the visitor sees the range, the categories with live counters, the FAQ and the invite.
- **Discord is the only supported platform.** The invite is the primary call to action; no other client is advertised anywhere.
- The terminal application moved to `/terminal`, behind the Discord sign-in. Old links to `/index.html` are redirected.
- The served address, the invite, the terminal path and the official site are injected by the server (`WEB_BASE_URL`, `DISCORD_INVITE_URL`, `OFFICIAL_SITE_URL`), so the page never hard-codes a deployment detail.
- `https://helloc.at` is the official address of the project and appears in the copyright of the page.
- See [`web/README.md`](web/README.md#the-landing-page) for the full guide.

### Channel assistant
- The bot owns the channel: it announces new challenges, explains the objective and links the web terminal that loads the challenge.
- Captures made in the web terminal are celebrated in the channel with the operator's ranking, total solves and CATCOINS balance.
- Posts one tip and tricks per day, together with the current top three operators.
- `/leaderboard` ranks operators by challenges solved, with XP and CATCOINS.
- Welcomes new members with a private briefing that walks them through the whole loop, from picking a target to capturing the flag.
- Replies with a short route map when an operator asks for help in the channel.

### Economy
- CATCOINS from challenge captures, dailies and games.
- Cosmetics only: badges, titles and a cosmetic rank accent.
- Explicit "no real-world monetary value" disclosure.
- Duplicate-reference protection and inventory ownership checks.

### Onboarding
- `/tutorial` — interactive guided tour of the terminal (buttons plus a topic jump menu).
- `/tutorial topic lesson:<id>` — read a single topic: orientation, quickstart, challenge engine, toolkit, progression, economy, training, doctrine, authoring.
- `/tutorial roadmap [category:<name>]` — per-domain study plans with live active-challenge counts and the next unsolved challenge.
- All tutorial replies are ephemeral, so briefings and hints stay private.

### Moderation & admin
- Warn, timeout, kick, ban, clear, confidential report.
- Role hierarchy checks; owners/bots/self cannot be targeted.
- Anti-spam signals, per-command cooldowns, interaction rate limits.
- Administrator role or Discord admin permissions.
- Destructive actions require confirmation.
- Every administrative/moderation action is written to `audit.json`.

### Reliability
- Zod configuration validation at startup.
- Structured JSON-line logs with secret/flag redaction.
- Atomic JSON writes via temp file + `fsync` + rename; per-file write queue.
- Corrupt files are quarantined (`.corrupt-<timestamp>`), then `*.bak` is tried.
- Graceful shutdown on SIGINT/SIGTERM, unhandled rejection / uncaught exception logging.
- Automated storage snapshots (`AUTO_BACKUP_HOURS`, default 24).
- Publishing posts an announcement to `CHALLENGE_CHANNEL_ID`; the daily challenge is also announced there once per date.

---

## 3. Requirements

| Requirement | Version / notes |
| --- | --- |
| Node.js | 22 or newer |
| npm | Ships with Node.js |
| Discord bot application | Bot token, application ID, guild ID |
| Privileged gateway intents | **Server Members Intent** and **Message Content Intent** |
| OS | Termux (Android), Debian/Ubuntu, or any Linux host |

No database server, Redis, Docker or external SaaS is required.

---

## 4. Installation

### Termux

```bash
pkg update && pkg upgrade -y
pkg install nodejs git -y
node --version   # must be v22+
git clone <your-repository-url> hello-cat
cd hello-cat
npm install
cp .env.example .env
nano .env
npm run validate
```

> In Termux, keep the process alive with `termux-wake-lock` and run the bot inside `tmux` or `screen` for long sessions.

### Debian / Ubuntu

```bash
sudo apt update
sudo apt install -y curl git build-essential
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node --version   # must be v22+
git clone <your-repository-url> hello-cat
cd hello-cat
npm install
cp .env.example .env
nano .env
npm run validate
```

---

## 5. Discord application creation

1. Open the [Discord Developer Portal](https://discord.com/developers/applications) and click **New Application**.
2. Name it `Hello Cat`.
3. Open **Bot** → **Reset Token** and copy the token. Treat it like a password.
4. Under **Privileged Gateway Intents**, enable:
   - **Server Members Intent** (member resolution, role checks).
   - **Message Content Intent** (content-based anti-spam duplicate detection).
5. Copy the **Application ID** from **General Information** → this is `CLIENT_ID`.
6. In Discord, enable **Developer Mode**, then right-click your server → **Copy Server ID** for `GUILD_ID`.
7. Right-click the administrator role → **Copy Role ID** for `ADMIN_ROLE_ID`.
8. Right-click the challenge channel → **Copy Channel ID** for `CHALLENGE_CHANNEL_ID`.
9. Right-click the staff/log channel → **Copy Channel ID** for `LOG_CHANNEL_ID`.
10. Generate a long random `FLAG_SECRET`, for example:
    ```bash
    node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
    ```

### Required Discord Developer Portal settings

- **Bot → Token**: created and stored only in `.env`.
- **Bot → Privileged Gateway Intents**: Server Members **ON**, Message Content **ON**.
- **OAuth2 → General → Redirects**: none required for slash commands.
- **Installation / OAuth2 scopes**: `bot` and `applications.commands`.
- **Bot permissions** (minimum recommended):
  - View Channels
  - Send Messages
  - Embed Links
  - Read Message History
  - Manage Messages (`/mod clear`)
  - Moderate Members (`/mod timeout`, `/mod warn`)
  - Kick Members (`/mod kick`)
  - Ban Members (`/mod ban`)

No Administrator permission is required for the bot itself.

---

## 6. Bot invitation and permissions

Use the OAuth2 URL generator:

1. **Scopes**: `bot`, `applications.commands`.
2. **Bot Permissions**: as listed above.
3. Open the generated URL, choose your server, authorize.
4. Ensure the bot's role is **above** members it must moderate, and below your own highest role if you intend to moderate the bot.

The bot validates the configured `ADMIN_ROLE_ID` against the guild. If the role is missing, role-based admin access is unavailable but Discord owners/Administrators can still operate administrative commands.

---

## 7. Environment configuration

Copy `.env.example` to `.env`:

```dotenv
DISCORD_TOKEN=
CLIENT_ID=
GUILD_ID=
ADMIN_ROLE_ID=
CHALLENGE_CHANNEL_ID=
LOG_CHANNEL_ID=
FLAG_SECRET=
BOT_PREFIX=!
BOT_TIMEZONE=Africa/Casablanca
NODE_ENV=development
REGISTER_GLOBAL_COMMANDS=false
DATA_DIR=src/storage/data
LOG_DIR=logs
BACKUP_DIR=backups
CHALLENGE_IMPORT_ON_START=false
AUTO_BACKUP_HOURS=24
```

| Variable | Required | Purpose |
| --- | --- | --- |
| `DISCORD_TOKEN` | Yes | Bot token. Never commit it. |
| `CLIENT_ID` | Yes | Discord application ID. |
| `GUILD_ID` | Dev / recommended | Guild used for fast command deployment and validation. `DISCORD_GUILD_ID` is accepted as an alias. The bot must be a member of it. |
| `ADMIN_ROLE_ID` | Recommended | Role granted administrator access, in addition to owner/Admin/ManageGuild. |
| `CHALLENGE_CHANNEL_ID` | Optional | Daily challenge announcement channel. The bot needs access to it. |
| `LOG_CHANNEL_ID` | Optional | Moderation/audit log channel. |
| `FLAG_SECRET` | Yes | HMAC key for flags, at least 16 characters. Changing it invalidates existing hashed flags. |
| `BOT_PREFIX` | No | Reserved for future prefix commands; slash commands are used. |
| `BOT_TIMEZONE` | No | Daily reset/selection timezone. Default `Africa/Casablanca`. |
| `NODE_ENV` | No | `development`, `production`, or `test`. |
| `REGISTER_GLOBAL_COMMANDS` | No | `false` deploys to `GUILD_ID`; `true` deploys globally. |
| `DATA_DIR` | No | JSON data directory. |
| `LOG_DIR` | No | Structured log directory. |
| `BACKUP_DIR` | No | Backup directory. |
| `CHALLENGE_IMPORT_ON_START` | No | Import `challenges/**/*.json` on boot. |
| `AUTO_BACKUP_HOURS` | No | Automated snapshot interval; `0` disables. |
| `DISCORD_CLIENT_SECRET` | Web | OAuth2 client secret for the web terminal sign-in (developer portal → General Information → Client Secret). Never the bot token. |
| `WEB_CLIENT_ID` | Web | OAuth2 client id of the web sign-in application. Defaults to `CLIENT_ID`; set it when the web terminal uses a separate Discord application. |
| `SESSION_SECRET` | Web | Signs the web session cookie. Defaults to `FLAG_SECRET`. |
| `WEB_PORT` | No | Web terminal port. Default `8080`. |
| `WEB_HOST` | No | Web terminal bind address. Default `0.0.0.0`. |
| `WEB_BASE_URL` | Web | Public URL of the site. The root serves the landing page, `/terminal` serves the application. |
| `WEB_REDIRECT_URI` | Web | OAuth2 redirect URI. Defaults to `WEB_BASE_URL/auth/callback`, or the request host when unset. |
| `OFFICIAL_SITE_URL` | No | The official website written on the landing page. Default `https://helloc.at`. |
| `DISCORD_INVITE_URL` | No | Invite to the Discord server, the main call to action of the landing page. Defaults to `https://discord.gg/<GUILD_ID>`. |
| `WEB_REQUIRE_GUILD` | No | Require Discord server membership before granting access. |
| `WEB_COOKIE_SECURE` | No | `auto` (default), `true` or `false`. `auto` marks the cookie Secure for HTTPS requests, including behind a proxy. |
| `WEB_TRUST_PROXY` | No | Honour `X-Forwarded-Proto` from a loopback proxy or tunnel. Default `true`. |
| `WEB_COOKIE_DOMAIN` | No | Cookie domain. Empty (default) keeps the cookie host-only. |
| `WEB_SESSION_TTL` | No | Session lifetime in seconds. Default `43200` (12 hours). |
| `WEB_PUBLIC_URL` | Web | Public URL of the site that the bot links to. Defaults to `WEB_BASE_URL`. The bot links to `<WEB_PUBLIC_URL>/terminal`. |
| `ANNOUNCEMENT_CHANNEL_ID` | No | Channel for challenge announcements, solve celebrations and the daily tip. Falls back to `CHALLENGE_CHANNEL_ID`. |
| `ANNOUNCE_SOLVES` | No | Announce captures that happen in the web terminal. Default `true`. |
| `ANNOUNCE_POLL_SECONDS` | No | How often the bot looks for new captures. Default `15`. |
| `DAILY_TIPS_ENABLED` | No | Post one tip and tricks per day. Default `true`. |
| `WEEKLY_LEADERBOARD_ENABLED` | No | Post the challenge leaderboard to the channel once a week. Default `true`. |
| `ASSISTANT_ENABLED` | No | Reply helpfully when an operator asks for help in the channel. Default `true`. |
| `WELCOME_ENABLED` | No | Welcome new members with the participation briefing. Default `true`. |
| `WELCOME_DM_ENABLED` | No | Send the briefing as a direct message. Falls back to a channel greeting. Default `true`. |
| `WELCOME_CHANNEL_ID` | No | Channel for the public greeting. Falls back to the announcement channel, then the system channel. |

**Never commit `.env`.** It is already ignored. Use a secret manager or host environment variables in production.

---

## 8. Slash command deployment

During development, use guild commands (instant):

```bash
npm run deploy
```

This requires `GUILD_ID` and `REGISTER_GLOBAL_COMMANDS=false`.

For global commands:

```bash
REGISTER_GLOBAL_COMMANDS=true npm run deploy
# or
node scripts/deploy-commands.js --global
```

Global propagation can take up to one hour. Re-run deployment whenever command definitions change.

---

## 9. Running locally

```bash
# optional: load the bundled educational challenges
npm run import

npm start
```

Healthy startup logs include:

```text
Hello Cat boot sequence initiated
Command registry loaded
Event registry loaded
Gateway connected
Hello Cat online
```

Use `npm run dev` for Node's watch mode.

---

## 10. Hosting

### bot-hosting.net

Build the upload archive with:

```bash
npm run package:bot-hosting
```

The archive lands in `dist/hellocat-bot.zip`. It contains the project files at
its root, without `node_modules`, `.env`, the logs and the backups, so it can
be uploaded to the panel as it is.

Panel settings:

| Setting | Value |
| --- | --- |
| Runtime | Node.js 22 or newer (24 recommended) |
| Entry File (STARTUP_FILE) | `src/index.js` |
| Start command | `npm install --omit=dev && node src/index.js` |

Configure `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`, `FLAG_SECRET`,
`NODE_ENV=production` and the optional channel ids in the Variables tab, then
register the slash commands once with `npm run deploy`.

The full walkthrough, including the environment variable reference, the web
terminal deployment and the troubleshooting table, is in
[`deploy/bot-hosting.md`](deploy/bot-hosting.md). The same guide ships inside
the archive as `DEPLOY.md`.

### systemd (Debian/Ubuntu)

Create `/etc/systemd/system/hello-cat.service`:

```ini
[Unit]
Description=Hello Cat Discord Bot
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=hellocat
WorkingDirectory=/opt/hello-cat
EnvironmentFile=/opt/hello-cat/.env
ExecStart=/usr/bin/node /opt/hello-cat/src/index.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/hello-cat/src/storage/data /opt/hello-cat/logs /opt/hello-cat/backups

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now hello-cat
sudo journalctl -u hello-cat -f
```

### pm2

```bash
sudo npm install -g pm2
pm2 start src/index.js --name hello-cat
pm2 save
pm2 startup
```

### Termux

```bash
termux-wake-lock
tmux new -s hellocat
npm start
```

Detach with `Ctrl+b`, then `d`; reattach with `tmux attach -t hellocat`.

### Web terminal

The web terminal ships with its own systemd unit and an nginx template:

```bash
sudo bash deploy/install-web.sh
sudo cp deploy/nginx/hellocat-web.conf /etc/nginx/sites-available/hellocat-web
sudo ln -s /etc/nginx/sites-available/hellocat-web /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

To run it under pm2 instead:

```bash
pm2 start web/index.js --name hellocat-web
```

The bot and the web terminal may run side by side against the same `DATA_DIR`:
writes are atomic and serialised with a lock file, so neither process loses the
other's updates. See [`web/README.md`](web/README.md) for the details.

---

## 11. Challenge creation tutorial

### Method A — Discord modal

```text
/admin challenge-create category:<category> difficulty:<difficulty> xp:<1-10000> [max-attempts:<n>]
```

A secure modal asks for:

- Title
- Description
- Objective
- Flag (**hashed immediately; never echoed back**)
- Hints, one per line. Use `cost|text` for paid hints, e.g. `25|Look at the second token.`

The challenge is created as a **draft**. Publish it:

```text
/admin challenge-publish id:HC-001
```

### Method B — Local JSON file

Create a file under `challenges/easy/`, `challenges/medium/`, `challenges/hard/` or `challenges/expert/`:

```json
{
  "id": "HC-101",
  "title": "Example Lab Challenge",
  "description": "A fictional workstation left this clue...",
  "objective": "Submit the recovered value as HC{value}.",
  "category": "Linux",
  "difficulty": "Easy",
  "xp": 120,
  "flag": "HC{example_flag}",
  "prerequisites": ["HC-100"],
  "hints": [
    { "text": "Start with the manual page.", "cost": 0 },
    { "text": "Look at the second word.", "cost": 25 }
  ],
  "maxAttempts": 5,
  "flagFormat": "HC{...}",
  "authorName": "Hello Cat Intel",
  "published": true
}
```

Validate and import:

```bash
npm run validate
npm run import                      # imports and publishes everything in challenges/
node scripts/import-challenges.js --publish --only=HC-101   # imports selected ids only
# or: node scripts/import-challenges.js
```

Rules:

- IDs must match `HC-<alphanumeric/underscore/dash>`.
- Flags are normalized (trim + collapse whitespace) before HMAC hashing.
- The source JSON contains plaintext flags for import only; the runtime store contains only hashes.
- Never publish challenge source files in a public repository if the flags are meant to stay secret. The bundled 17 challenges are educational examples; rotate their flags before using them in a competitive event.
- Daily selection uses published/active challenges, deterministic per date in `BOT_TIMEZONE`.

### Prerequisites — chained labs

`prerequisites` lists the challenges that have to be captured before an entry opens up. The gate is
enforced per operator, not globally:

- The catalogue, `/challenge browse`, `/challenge info` and `/challenge start` mark a sealed entry with 🔒.
- The web terminal refuses to load a sealed environment and refuses the flag submission, so the lab cannot be solved around the gate.
- Hints stay locked as well, so no CATCOIN is spent on intel that cannot be used yet.
- Capturing the prerequisite announces the unlock in the challenge channel.
- A challenge cannot require itself, and an unknown prerequisite is reported by `npm run validate` and by the importer.

The shipped chain is `HC-016` (First Contact) → `HC-017` (Second Contact): the second lab runs on the
same fictional training host and asks for a hidden file encoded in hex instead of the Base64 token of
the first one.

### Daily operations

- Set `CHALLENGE_CHANNEL_ID` to announce the selected daily challenge.
- The scheduler checks every minute and posts once per day.
- `/daily` shows the challenge, completion state, streak and bonus.
- Solving that challenge in the web terminal records the daily bonus and streak automatically.

### Field toolkit

The `/tools` command provides offline, local utilities for working through challenge artifacts. It never executes host commands or calls external services.

| Subcommand | Purpose |
| --- | --- |
| `/tools decode` | Decode Base64, Base64url, hex, binary, URL, ROT13, Caesar, Atbash, Morse or reversed text. |
| `/tools encode` | Apply the same encodings/ciphers in the opposite direction. |
| `/tools caesar` | Brute-force all 26 Caesar rotations and show every candidate. |
| `/tools hash` | Compute MD5, SHA1, SHA256 or SHA512, or identify a digest by length/signature. |
| `/tools xor` | XOR hex or UTF-8 input with a repeating key and show hex plus printable output. |
| `/tools vigenere` | Encode or decode a Vigenere cipher with an alphabetic key. |
| `/tools jwt` | Decode a JWT header and payload without verifying the signature. |
| `/tools analyze` | Extract flags, IPs, domains, URLs, emails, MACs and hash-like values, and detect common encodings. |

`/challenges` is an alias of `/challenge` for browsing, inspecting and starting challenges.

### Guided tutorial

`/tutorial` is the onboarding surface for new operators. Content lives in `src/constants/tutorial.js` as static lesson and track data, so it can be edited without touching command logic.

| Subcommand | Purpose |
| --- | --- |
| `/tutorial start` | Interactive tour: PREV/NEXT buttons plus a topic jump menu, ephemeral, five-minute timeout. |
| `/tutorial topic lesson:<id>` | Print one lesson: orientation, quickstart, browse, brief, hints, submit, toolkit, progress, economy, training, scope, authoring. |
| `/tutorial roadmap` | Study plan per security domain with live active-challenge counts (paginated). |
| `/tutorial roadmap category:<name>` | One domain in detail, including the next unsolved challenge for the caller. |

Lessons reference live commands only; no lesson text is generated at runtime and no external content is fetched.

---

## 12. Admin command reference

All administration commands require owner, Administrator, ManageGuild, or the configured `ADMIN_ROLE_ID`. Destructive actions require a confirmation button. Every action is audited in `audit.json`.

| Command | Description |
| --- | --- |
| `/admin challenge-create` | Create a draft challenge via secure modal. |
| `/admin challenge-edit` | Edit text, flag, hints, category, difficulty, XP, attempts; `clear-hints` removes hints. |
| `/admin challenge-delete` | Permanently delete a challenge (confirmation). Submission history is retained. |
| `/admin challenge-list` | Paginated list, including drafts/offline entries. |
| `/admin challenge-publish` | Activate and publish a challenge; posts it to the configured challenge channel. |
| `/admin challenge-disable` | Take a challenge offline; existing submissions remain valid. |
| `/admin player-reset` | Zero XP, streak, hints, coins, inventory, achievements and submissions (confirmation). |
| `/admin give-xp` | Grant XP with an audit reason and unique idempotency key. |
| `/admin remove-xp` | Remove XP, floored at zero. |
| `/admin announce` | Send a branded announcement to a channel. |
| `/admin backup` | Create a snapshot in `backups/`. |
| `/admin stats` | Platform telemetry: operators, challenges, attempts, captures, coin supply, audit/mod cases, memory. |

Moderation:

| Command | Permission |
| --- | --- |
| `/mod warn` | Moderate Members |
| `/mod timeout` | Moderate Members |
| `/mod kick` | Kick Members |
| `/mod ban` | Ban Members |
| `/mod clear` | Manage Messages |
| `/mod report` | Any member (confidential) |

All other commands:

- General: `/help`, `/ping`, `/about`, `/status`, `/rules`, `/server`, `/tutorial` (`start|topic|roadmap`)
- Profile: `/profile`, `/rank`, `/leaderboard`, `/achievements`, `/history`, `/streak`
- CTF: `/challenge` or `/challenges` (`browse|info|start`), `/hint`, `/mychallenges`, `/categories`
- Tools: `/tools` (`decode|encode|caesar|hash|xor|vigenere|jwt|analyze`)
- Games: `/quiz`, `/guesscommand`, `/terminal`, `/daily`, `/decrypt`
- Economy: `/balance`, `/shop`, `/buy`, `/inventory`

---

## 13. JSON backup and recovery

### Data files

```text
src/storage/data/
├── users.json
├── challenges.json
├── submissions.json
├── achievements.json
├── economy.json
├── moderation.json
├── settings.json
└── audit.json
```

Each write is atomic (temp file → fsync → rename). Before replacing a file, the previous version is copied to `<name>.json.bak`.

### Backups

```bash
npm run backup
```

Snapshots are written to `backups/backup-<timestamp>/` with a `manifest.json`. The newest 10 backups are retained. Automatic snapshots run every `AUTO_BACKUP_HOURS` (default 24); `/admin backup` creates one on demand.

### Recovery

1. Stop the bot (`Ctrl+C`, `systemctl stop hello-cat`, or `pm2 stop hello-cat`).
2. Inspect `src/storage/data/`. Corrupt files are preserved as `*.corrupt-<timestamp>`; do not delete them until you finish investigating.
3. Either restore the automatic `.bak` by copying it over the live file:
   ```bash
   cp src/storage/data/challenges.json.bak src/storage/data/challenges.json
   ```
4. Or restore a full snapshot:
   ```bash
   cp backups/backup-<timestamp>/*.json src/storage/data/
   ```
5. Run validation and restart:
   ```bash
   npm run validate
   npm start
   ```

Do not edit JSON while the bot is running. If a file is malformed, Hello Cat quarantines it and attempts `<file>.bak`, then initializes a fresh default if no valid backup exists. It does not silently discard the corrupt file.

---

## 14. Security considerations

- **Flag secrecy:** runtime data stores `flagHash` only. `publicChallenge()` strips hashes. Commands, embeds and logs never print submitted/expected flags.
- **Flag rotation:** changing `FLAG_SECRET` invalidates all existing hashes. Re-import or edit flags after rotation.
- **No host execution:** `/terminal` uses a hardcoded fictional filesystem and rejects shell metacharacters. It never calls `child_process`. The web terminal is the same idea at larger scale: an in-memory filesystem with a fixed command registry, so no input can reach the host.
- **Web terminal isolation:** the terminal talks to no external host. `curl`, `nmap` and friends only see the lab's own inventory. Sessions are per-operator, expire after two hours of inactivity, and the session cookie is `HttpOnly`, `SameSite=Lax` and HMAC-signed.
- **Web terminal auth:** Discord OAuth2 with the `identify` scope only. The bot token is never sent to the browser. `WEB_REQUIRE_GUILD=true` additionally gates access on Discord server membership.
- **Least privilege:** the bot does not need Administrator permission. Admin access is checked at runtime; role IDs are validated as snowflakes and resolved against the guild before use.
- **Moderation hierarchy:** owners, bots, self-targets and equal/higher roles are protected.
- **No automatic punishments from spam heuristics.** Anti-spam only warns and logs; staff decide.
- **Secrets:** `.env` is ignored. Logs redact keys matching token/secret/password/flag/key. Never share bot tokens or webhook URLs in chat; rotate any credential that has been exposed.
- **Input validation:** Zod validates configuration and challenge definitions; Discord option limits bound text; submission length is capped.
- **Idempotency:** XP, coins, hints, dailies and achievement rewards use idempotency keys/references to prevent replay farming.
- **Single processes:** the JSON engine is safe within one bot process (per-file queue + atomic rename). Do not run multiple bot instances against the same `DATA_DIR`.
- **Two processes are supported:** the bot and the web terminal may share a `DATA_DIR` because writes are serialised with a lock file (`src/utils/fileLock.js`) in addition to being atomic.
- **Backups contain user data and flag hashes.** Protect `backups/` and restrict file permissions.

Educational scope: challenges are fictional and self-contained. The bot contains no tooling for unauthorized access, credential theft, phishing or attacking third-party systems.

---

## 15. Troubleshooting

| Symptom | Fix |
| --- | --- |
| `DISCORD_TOKEN is required` | Fill `.env`; ensure you copied `.env.example` → `.env`. |
| `FLAG_SECRET is required and must be at least 16 characters` | Generate a long random secret and set it. |
| Slash commands missing | Run `npm run deploy`; confirm `CLIENT_ID`, `GUILD_ID`; wait for global propagation. |
| `Invalid BOT_TIMEZONE` | Use an IANA name such as `Africa/Casablanca` or `UTC`. |
| Admin command denied | Ensure you are owner/Administrator/ManageGuild or have `ADMIN_ROLE_ID`; check the role exists and the bot can see it. |
| Moderation fails with hierarchy error | Move the bot's role above the target, and ensure you outrank the target. |
| Timeout/kick/ban failed | Check bot role position and Discord permissions (Moderate/Kick/Ban Members). |
| Flag rejected unexpectedly | Flags are case/spacing sensitive after trimming and whitespace collapsing. Verify the flag format and attempts used. |
| Flag rejected after changing secrets | `FLAG_SECRET` changed; re-import/edit flags so hashes are regenerated. |
| Daily channel not receiving posts | Set `CHALLENGE_CHANNEL_ID`; ensure the bot can send embeds there; posts occur once per date. |
| Anti-spam duplicate detection is weak | Enable **Message Content Intent** in the Developer Portal. |
| `Challenge import failed` | Run `npm run validate`; inspect reported file/line; IDs must be unique. |
| Data file corrupt warning | Inspect `*.corrupt-*`; restore `.bak` or a backup snapshot; restart. |
| Webhook/token leaked | Revoke/rotate it immediately in Discord settings. Hello Cat never requires third-party webhooks. |
| Tests fail on Node | Use Node 22+; run `npm test`. No Discord token is required for tests. |

### Web terminal sign-in

The web terminal signs operators in with Discord OAuth2. Every stage of the
handshake is logged to `logs/web-*.log` with an `auth.*` stage marker, so a
failed sign-in can be traced without guessing:

| Log stage | Meaning |
| --- | --- |
| `auth.credentials` | Startup probe of the client id/secret against Discord. `invalid_client` means `DISCORD_CLIENT_SECRET` is wrong or was rotated. |
| `auth.login` | The authorize redirect was issued (state fingerprint, redirect URI, cookie security). |
| `auth.callback` | The callback arrived (code/state present, Discord error). |
| `auth.profile` | The Discord user profile was retrieved. |
| `auth.session` | The session cookie was issued. |
| `auth.exchange` | The authorization code could not be exchanged. |

Common sign-in problems:

| Symptom | Fix |
| --- | --- |
| `Discord rejected the OAuth2 client credentials (invalid_client)` | The client secret is not the one of the application. Copy **Client Secret** from the Discord developer portal (General Information) into `DISCORD_CLIENT_SECRET`. It is never the bot token. The client id and the secret must belong to the same application: set `WEB_CLIENT_ID` when the web terminal uses a different application than the bot. |
| `redirect_uri mismatch` in the browser | `WEB_REDIRECT_URI` must match a redirect registered in the developer portal byte for byte. With an ephemeral tunnel, set it to the current tunnel URL or leave it empty to derive it from the request host. |
| Browser returns to the sign-in screen repeatedly | The session cookie was not accepted. Check `WEB_COOKIE_SECURE` (`auto` for HTTPS), `WEB_TRUST_PROXY=true` behind nginx/ngrok, and that the browser allows cookies for the site. |
| `The sign-in cookie was missing or blocked by the browser` | Cookies are blocked, or the state cookie was dropped. Enable cookies for the site and start the sign-in again. |
| `The bot is not a member of guild ...` from `npm run deploy` | Invite the bot to that server with the printed link, then deploy again. Guild commands can only be registered in a server the bot is in. |
| Daily challenge is not announced | The bot cannot see `CHALLENGE_CHANNEL_ID`. Check that the bot is in the guild and that it has **View Channel**, **Send Messages** and **Embed Links** there. |

---

## Project structure

```text
hello-cat/
├── src/
│   ├── index.js                 # startup, shutdown, schedulers
│   ├── client.js                # Discord client + reconnect logging
│   ├── config/config.js         # Zod env config
│   ├── commands/                # general, profile, ctf, games, economy, moderation, admin
│   ├── events/                  # ready, interactionCreate, messageCreate
│   ├── handlers/                # command/event loaders, daily scheduler
│   ├── services/                # challenge, player, ranking, moderation, daily, achievements, economy, games
│   ├── storage/                 # JsonStore, repositories, data/
│   ├── games/                   # reusable game engine + modes
│   ├── utils/                   # embeds, flags, permissions, cooldowns, anti-spam, backup
│   └── constants/               # brand, ranks, achievements, shop, rules, tutorial content
├── challenges/                  # easy/, medium/, hard/, expert/ JSON definitions
├── scripts/                     # deploy-commands, build-deploy-zip, backup, validate-data, import-challenges
├── tests/                       # node:test suites (no Discord token required)
├── deploy/                      # bot-hosting.md guide, systemd unit, nginx template
├── logs/
├── backups/
├── .env.example
├── .gitignore
├── package.json
├── README.md
└── LICENSE
```

---

## Testing

```bash
npm test
npm run validate
```

The suite covers JSON storage atomicity/concurrency/corruption recovery, challenge creation/editing, flag hashing/verification, duplicate submissions, attempt locks, hints and CATCOIN debits, XP/rank progression, idempotent awards, leaderboards, achievements, dailies/streaks, economy transactions, cooldowns, anti-spam, permissions/hierarchy, game engine sessions, simulated terminal safety, configuration validation and command-loading integrity.

Tests use temporary directories and never require a Discord token or network access.

---

## License

MIT — see [LICENSE](LICENSE).

CATCOINS are fictional and have no monetary value. All challenges are fictitious educational scenarios for authorized lab environments.
