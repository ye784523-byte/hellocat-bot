# Deploying Hello Cat on bot-hosting.net

This archive is the Hello Cat Discord bot, packaged for the
[bot-hosting.net](https://bot-hosting.net) panel.

The archive has **no wrapper folder**: `package.json` and `src/` sit at its
root, so extracting it in the panel puts the project directly into the
deployment root.

---

## 1. Create the deployment

1. Sign in at <https://bot-hosting.net/login> with Discord.
2. Select your project, then **New Deployment** in the top right.
3. Name it (for example `hello-cat`).
4. Source: **Blank** (upload the archive afterwards) or **ZIP** if the panel
   accepts the file during creation.
5. Runtime: **Node.js**, version **22** or newer (the bot requires
   `node >= 22.0.0`; Node 24 LTS is recommended).
6. Pick the resources and launch.

## 2. Upload the files

Open the **Files** tab of the deployment:

1. Upload `hellocat-bot.zip`.
2. Click the three dots next to the archive and choose **Unarchive**.
3. If the archive extracted into a folder (for example `hellocat-bot/`), drag
   the files **out** of it so that `package.json`, `src/`, `web/` and
   `challenges/` are in the deployment root.
4. Delete the archive and the leftover folder to free space.

`node_modules` is intentionally not in the archive. The panel installs the
dependencies from `package.json` when the deployment starts.

## 3. Startup settings

Open the **Startup** tab:

| Setting | Value |
| --- | --- |
| Runtime | Node.js |
| Version | 22 or newer (24 recommended) |
| Entry File (STARTUP_FILE) | `src/index.js` |
| Start command | `npm install --omit=dev && node src/index.js` |

The start command is a full shell line and runs on every boot, so the
`npm install` step has to stay in it. The panel also installs the packages
from `package.json` itself; keeping the explicit install is what makes a
restart work after a dependency change.

To run the web terminal instead, use `web/index.js` as the entry file and
`npm install --omit=dev && node web/index.js` as the start command. It needs
its own deployment and its own public URL (see section 7).

## 4. Environment variables

Open the **Variables** (or **Environment**) tab and add these. `.env` is not
part of the archive, so the bot reads everything from the panel.

### Required

| Variable | Value |
| --- | --- |
| `DISCORD_TOKEN` | Bot token from the Discord developer portal. |
| `CLIENT_ID` | Application id of the bot. |
| `FLAG_SECRET` | At least 16 characters. HMAC key for the flags. |
| `NODE_ENV` | `production` |
| `GUILD_ID` | The server id. Required in production unless `REGISTER_GLOBAL_COMMANDS=true`. |

### Recommended

| Variable | Value |
| --- | --- |
| `REGISTER_GLOBAL_COMMANDS` | `false` to register the commands in `GUILD_ID` (instant), `true` for global commands (up to one hour to propagate). |
| `CHALLENGE_IMPORT_ON_START` | `true` to import `challenges/**/*.json` on boot. Required when `FLAG_SECRET` differs from the one that hashed the current flags, because it re-hashes every flag with the new secret. |
| `ADMIN_ROLE_ID` | Role id that gets administrator access. |
| `BOT_TIMEZONE` | Daily reset timezone, for example `Africa/Casablanca`. |
| `ANNOUNCEMENT_CHANNEL_ID` | Channel for the daily challenge, solve celebrations and the tips. Falls back to `CHALLENGE_CHANNEL_ID`. |
| `CHALLENGE_CHANNEL_ID` | Channel for the daily challenge announcement. |
| `LOG_CHANNEL_ID` | Channel for the moderation and audit log. |

### Optional

| Variable | Value |
| --- | --- |
| `WELCOME_ENABLED` | `true` to welcome new members. |
| `WELCOME_DM_ENABLED` | `true` to send the briefing as a direct message. |
| `WELCOME_CHANNEL_ID` | Channel for the public greeting. |
| `DAILY_TIPS_ENABLED` | `true` to post the daily tip. |
| `WEEKLY_LEADERBOARD_ENABLED` | `true` to post the weekly leaderboard. |
| `ASSISTANT_ENABLED` | `true` to answer operators asking for help in the channel. |
| `ANNOUNCE_SOLVES` | `true` to announce captures made in the web terminal. |
| `ANNOUNCE_POLL_SECONDS` | Polling interval in seconds, `5` to `600`. Default `15`. |
| `AUTO_BACKUP_HOURS` | Snapshot interval in hours, `0` disables it. Default `24`. |
| `DATA_DIR` | Data directory, relative to the deployment root. Default `src/storage/data`. |
| `LOG_DIR` | Log directory. Default `logs`. |
| `BACKUP_DIR` | Backup directory. Default `backups`. |

> **Flags and `FLAG_SECRET`**
> The shipped `src/storage/data/challenges.json` holds flags hashed with the
> `FLAG_SECRET` of the machine that built the archive. If you use a different
> secret in the panel, set `CHALLENGE_IMPORT_ON_START=true`: the bot re-imports
> `challenges/**/*.json` and re-hashes every flag with the new secret. The
> same secret must be used everywhere, otherwise the flags in the archive stop
> validating.

## 5. Register the slash commands

The commands are not registered by the bot itself, they are deployed once:

```bash
npm run deploy
```

Run it from a machine that has the environment variables of the deployment
(the same `DISCORD_TOKEN`, `CLIENT_ID` and `GUILD_ID`) and the sources of this
archive. With `REGISTER_GLOBAL_COMMANDS=false` the commands appear in
`GUILD_ID` within seconds; globally they can take up to an hour.

The panel has no interactive shell on every plan, so running the script
locally is the easiest path. `node scripts/deploy-commands.js --global`
registers the commands globally.

The bot must be a member of `GUILD_ID` for guild commands. Invite it with:

```text
https://discord.com/oauth2/authorize?client_id=<CLIENT_ID>&scope=bot%20applications.commands&permissions=1411702189079&guild_id=<GUILD_ID>&disable_guild_select=true
```

## 6. Start the deployment

Press **Start** and watch the console. A healthy boot looks like this:

```text
Hello Cat boot sequence initiated
Command registry loaded
Event registry loaded
Gateway connected
Hello Cat online
```

Everything is also written to `logs/bot-<date>.log` inside the deployment.

## 7. Web terminal (optional)

The web terminal is a second process and therefore a second deployment:

1. Create another deployment from the same archive.
2. Entry file `web/index.js`, start command
   `npm install --omit=dev && node web/index.js`.
3. Add `DISCORD_CLIENT_SECRET`, `WEB_CLIENT_ID`, `WEB_BASE_URL`,
   `WEB_REDIRECT_URI`, `SESSION_SECRET`, `WEB_PORT` and `WEB_HOST=0.0.0.0`.
4. Link a domain in the **Domains** tab and set `WEB_BASE_URL` to it.
5. Register `<WEB_BASE_URL>/auth/callback` as a redirect URI in the Discord
   developer portal.

`WEB_COOKIE_SECURE=auto` and `WEB_TRUST_PROXY=true` are the right defaults
behind the panel's proxy.

## 8. Data and persistence

- The bot writes to `src/storage/data` (JSON store), `logs` and `backups`.
- Write access is required in those three directories. The archive ships them
  with a `.gitkeep`, so they exist after the extraction.
- Both the bot and the web terminal may run against the same `DATA_DIR`: the
  writes are atomic and serialised with a lock file.
- Take a backup from the panel's **Backups** tab, or with `npm run backup`.

## 9. Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Cannot find module 'discord.js'` | The dependencies were not installed. Check the start command, it has to contain `npm install`. |
| `Invalid Token has been provided` | `DISCORD_TOKEN` is wrong or has a trailing space. |
| `Startup configuration invalid` | `DISCORD_TOKEN`, `CLIENT_ID` or `FLAG_SECRET` (min. 16 characters) is missing, or `GUILD_ID` is missing while `NODE_ENV=production`. |
| `Unknown Interaction` | The slash commands were not deployed. Run `npm run deploy`. |
| `The bot is not a member of guild ...` | Invite the bot to the server first, then deploy the commands again. |
| Commands do not appear in the channel | Guild commands need `REGISTER_GLOBAL_COMMANDS=false` plus a correct `GUILD_ID`. Global commands take up to an hour. |
| Flags are rejected | The `FLAG_SECRET` differs from the one used to hash them. Set `CHALLENGE_IMPORT_ON_START=true` and restart. |
| Nothing is written to `logs/` | The deployment root is not writable. Check the file permissions of `logs` and `src/storage/data`. |

## 10. Rebuilding the archive

```bash
node scripts/build-deploy-zip.js
```

The archive lands in `dist/hellocat-bot.zip`. Options:

| Option | Effect |
| --- | --- |
| `--out <file>` | Write to another path. |
| `--no-web` | Leave the web terminal out. |
| `--no-state` | Ship an empty data store. |
| `--with-tests` | Ship the test suite as well. |

`.env`, `node_modules`, the logs and the backups are never part of the
archive.
