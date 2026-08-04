# Project Overview
- **Project name:** Repo/image/UI all `pugzilla` (package `pugzilla-journal`). The GitHub repo was renamed from `tradezilla` → `pugzilla` on 2026-07-06; GitHub 301-redirects the old URLs. Local folder is still `.../Desktop/tradezilla` and the NAS deploy dir is still `/root/tradezilla` (folder names only, harmless). Tradovate integration keeps its own identifiers (`appId: TradezillaJournal`, `deviceId: tradezilla-nas`) — do NOT rename those, they may match an external Tradovate registration.
- **Purpose:** A local, self-hosted trading journal for NQ/ES (index futures) traders. Log trades, attach chart screenshots, and analyse performance, psychology and ICT-style setups.
- **Business objective:** Personal tool for one trader (single-user), runnable on a home NAS via Docker. Not a commercial multi-tenant product.
- **Success criteria:** Data persists reliably on disk; existing trades never break on upgrade; new analytics help the owner find their edge and discipline leaks.

# Current Status
- **Current phase:** Feature-complete v2.0.0 iteration shipped and running on the owner's NAS. Maintenance/refinement.
- **Current priorities:** Keep backwards compatibility with existing trade data; small UX fixes on request.
- **Next milestone:** None fixed. Candidate follow-ups are deprioritised (see Open Questions).
- **Key risks:** Accidental data loss on schema changes; global (non-per-user) data model if multiple logins are ever used; growing single JS bundle.

# Architecture
- **High-level:** Single Node/Express server serves both the JSON API and the built React SPA on one port (3001 in-container). No separate DB — file-based JSON datastore with atomic writes.
- **Main components:**
  - `server/index.js` — Express app: cookie parsing, auth middleware, all routes, static serving of `client/dist` + `/uploads`.
  - `server/store.js` — trades datastore (`data/trades.json`), `computeMetrics()` (derived P&L/R/holding time), `FIELDS` whitelist, backups, one-time `schema-v2` safety backup.
  - `server/auth.js` — username/password (scrypt), in-memory sessions, `data/users.json`.
  - `server/playbooks.js` — playbook datastore (`data/playbooks.json`).
  - `server/tradovate.js` + `TradovateSettings.jsx` — optional Tradovate fills sync.
  - `server/csv.js` — dependency-free CSV parse/stringify.
  - Client: `App.jsx` (tabs, theme, shortcuts, modals), `helpers.js` (all stats + option constants + `APP_VERSION`), `api.js` (fetch wrappers), plus one component per view/feature under `client/src/components/`.
- **Data flows:** Browser → `/api/*` (JSON, cookie-auth) → store modules → JSON files on disk. Screenshots: multipart upload → `server/uploads/` → referenced by filename in trade/playbook records. Metrics are computed server-side on read (`decorate`) and previewed client-side (`previewMetrics`).
- **External dependencies:** Tradovate REST API (optional, needs paid "API Access" add-on). GitHub Container Registry (image hosting). No other third-party runtime services.
- **Infrastructure:** Docker image `ghcr.io/ven0x-s/pugzilla:latest` (public). `docker-compose.ghcr.yml` maps host **9088** → container **3001**, volumes `./data/trades`→`/app/server/data` and `./data/uploads`→`/app/server/uploads`. GitHub Actions (`.github/workflows/docker-publish.yml`) builds + pushes `linux/amd64` on push to `main` and `v*` tags. `nas-quickstart.sh` = one-command NAS setup.

# Technology Stack
- **Languages:** JavaScript (ES modules client, CommonJS server), CSS.
- **Frameworks/libraries:** React 18 + Vite 5 (client); Express 4 + Multer 2 (server); Recharts 2 (charts). No CSS framework — hand-written `styles.css` with CSS variables + `[data-theme]`.
- **Databases:** None. Flat JSON files under `server/data/`.
- **Cloud services:** GHCR only. (Google Drive backup was requested but NOT implemented.)
- **Dev tooling:** npm workspaces-style split (`server/` + `client/` each have their own `package.json`). Root scripts: `npm run setup` (install both + build), `npm start` (node server), `npm run build`, `npm run dev:server`, `npm run dev:client`. Node 18+ required; Docker image uses `node:20-alpine`.

# Important Design Decisions
- **File-based JSON store, no database**
  - Rationale: single-user, simplicity, trivial backup (copy `data/`), zero DB ops on a NAS.
  - Alternatives: SQLite. Rejected for now to keep zero-dependency persistence and human-readable files.
  - Consequences: No real concurrency control (only atomic tmp+rename writes); full-file read/write per operation; fine at personal scale.
- **Dependency-free server utilities** (scrypt auth, manual cookie parsing, custom CSV)
  - Rationale: minimise supply-chain surface; only Express + Multer as server deps.
  - Consequences: More hand-written code; must maintain it ourselves.
- **New trade fields are optional / null-tolerant + one-time safety backup**
  - Rationale: hard requirement to never break existing trades on upgrade.
  - Consequences: No destructive migrations; `store.js` writes a `.schema-v2` marker + backup once on startup.
- **Unified naming as `pugzilla`** (repo renamed from `tradezilla` on 2026-07-06)
  - Rationale: match the UI brand everywhere. The old brand split (repo `tradezilla` vs UI `Pugzilla`) is gone.
  - Consequences: GHCR image path changed to `ghcr.io/ven0x-s/pugzilla`; the NAS had to re-point + recreate its container. Local/NAS folder names left as `tradezilla` (cosmetic).
- **Single-process app serving API + SPA on one port**
  - Rationale: one container, one port, simplest NAS deploy.

# Constraints
- **Business:** Single-user tool; no multi-tenant/billing requirements.
- **Technical:** Backwards compatibility with existing `trades.json` is mandatory. Runs on Windows (dev) and Alpine Linux (Docker). Node 18+.
- **Security:** No hardcoded secrets. Passwords scrypt-hashed, never stored/logged in plaintext. Session cookie is `HttpOnly; SameSite=Lax`. `server/data/` and `server/uploads/` are gitignored (never committed). Tradovate credentials live only in `data/tradovate.json`.
- **Compliance:** None applicable (personal use).

# Coding Conventions
- **Architectural principles:** Server computes canonical metrics; client mirrors them only for live preview. One React component per view/feature. Keep persistence dependency-free.
- **Coding standards:** 2-space indent; CommonJS on server, ESM on client; small focused modules; user-facing text in English.
- **Important patterns:**
  - Adding a trade field = add to `store.js` `FIELDS`, render in `TradeForm.jsx`, extend `CSV_COLUMNS` + import mapping in `index.js`. Keep null-tolerant.
  - `ChoiceField` (in `TradeForm.jsx`) = dropdown of preset options + an "Other…" free-text fallback. Reuse it for option-with-custom fields (News, Emotions, Mental mistake, Draw on liquidity, Prop firm).
  - `groupStats(trades, keyFn)` + `computeStats` power all breakdown tables. `setupTagsOf(t)` normalises `setupTags` (array or `;`/`,` string).
  - CSS theming via variables on `:root` and `:root[data-theme="light"]`.
- **Anti-patterns to avoid:** Don't hardcode secrets. Don't rewrite all trades in a migration. Don't assume `resultDollars` exists (open trades have null metrics). Don't scope-creep the JSON store into per-user data without an explicit, backed-up migration.

# Known Issues
- **Leftover `rating` field:** removed from the UI and breakdown tables, but still present in `store.js` `FIELDS` and `CSV_COLUMNS`. Harmless; can be pruned later. (Grade replaced it.)
- **Bundle size:** single JS chunk >500 kB (Vite warns). No code-splitting yet.
- **Setup performance counts:** stats count only *closed* trades, so a trade tagged but without exit shows 0 in "Setup performance". Expected, can confuse.
- **Windows line endings:** git warns LF→CRLF on commit; cosmetic.
- **Global data model:** trades and playbooks are shared across all logged-in users (not per-user). Fine for single-user; would surprise with multiple accounts.

# Open Questions
- **Multi-workspace accounts (separate trades/dashboards/playbook + switcher):** NOT built. Owner deprioritised it. Would require scoping every store read/write + a careful backed-up migration.
- **Google Drive backup/restore:** NOT built. Owner deprioritised it. Requires the owner's own Google Cloud OAuth client (client ID/secret) — cannot be hardcoded.
- **Assumptions to validate:** `package.json` versions are still `1.0.0` while the app footer/`APP_VERSION` is `2.0.0` — footer is the source of truth for "app version"; package versions were not bumped.

# Active Backlog
- **High:** None outstanding.
- **Medium:** Prune the dead `rating` field from `store.js`/CSV; consider code-splitting to cut bundle size; bump `package.json` versions to match `APP_VERSION`.
- **Low:** Multi-workspace accounts; Google Drive OAuth backup (both explicitly deprioritised by the owner).

# Recent Major Changes
- **v2.0.0 feature wave** (commits `ab946a2`→`a917133`):
  - ICT setup multi-select tags (1–9 keyboard shortcuts, custom labels in localStorage), HTF context (daily bias, HTF PDA, draw on liquidity, narrative), PO3 phase, validated TradingView URL, prop-firm account types.
  - Dashboard: account-type toggle (all / per type / side-by-side compare with separate equity curves), sortable Setup performance, PO3 table.
  - Analysis: HTF bias with-vs-against comparison + account/firm/bias/PO3 tables.
  - Playbook module (per-setup rules, screenshots, rules-followed-vs-broken comparison; `server/playbooks.js`).
  - QoL: light/dark theme toggle (persisted), global keyboard shortcuts + help modal, mobile quick-add form, version footer.
- **Earlier:** personal login/auth; Pugzilla rebrand + red-folder news; shareable canvas trade cards; psychology tracking; Insights tab (drawdown, streaks, R-histogram, tilt/overtrading, discipline split); Grade field; Dutch→English UI.
- **Latest (`a917133`):** removed redundant Rating field; Mental mistake back to preset dropdown + custom.

# AI Guidance
- **Must understand first:** This is a single-user, file-JSON app. **Never break existing trades.** New fields must be optional and null-tolerant. Server (`store.computeMetrics`) is the source of truth for P&L/R/holding time.
- **Read these files before changing behaviour (in order):** `README.md`, `DOCKER.md`, `server/store.js` (`FIELDS` + `computeMetrics`), `server/index.js` (routes + auth middleware), `client/src/helpers.js` (stats + option constants + `APP_VERSION`), `client/src/App.jsx` (tabs, theme, shortcuts).
- **Do not change without strong reason:** the file-JSON persistence model; the auth model (scrypt + in-memory sessions); the repo/image name `pugzilla`; the null-tolerant field pattern; host port 9088 in compose.
- **Extra caution:** any edit to `store.js` `FIELDS`/`computeMetrics`, CSV import/export, or Docker/compose/CI (owner deploys straight from GHCR). Restarting the server clears in-memory sessions → everyone is logged out.
- **Test loop that works here:** `npm run build` → `preview_start` (server name `tradezilla-server`, port 3001) → register/login → create trades via `POST /api/trades` → verify tabs in the browser → delete `server/data/{users,trades,playbooks}.json` + uploads to clean up. **Server-side changes require a preview restart** (then re-login, sessions are in-memory). Data files are gitignored — safe to delete.
- **Deploy flow:** commit to `main` → GitHub Actions builds + pushes the image → on NAS run `docker compose -f docker-compose.ghcr.yml pull && up -d`. Confirm the Actions run is green before telling the owner to pull.

# Session Handover
- **Completed recently:** Full v2.0.0 feature set; then a cleanup removing the duplicate Rating field (Grade stays) and restoring Mental mistake as a dropdown-with-custom. CI green, image on GHCR.
- **Recommended next actions:** (optional) prune leftover `rating` from `store.js`/CSV; bump `package.json` versions to 2.0.0; consider bundle code-splitting.
- **Important context:** Owner communicates in Dutch; app UI is English. Owner values token efficiency and a build→test→commit→push loop per change. Google Drive + multi-workspace are intentionally out of scope for now.

# AI Change Log
- 2026-08-04 — v2.7.0: four features. (1) Multi-account per trade (copy trader): trade field `accountId` → `accountIds` array (legacy `accountId` still read via new `accountIdsOf(t)` helper); TradeForm shows account chips per firm (multi-select); AccountsView attributes the FULL trade P&L to each linked account (owner's choice), Dashboard total still counts each trade once. (2) Calendar day detail: cells clickable → DayModal listing that day's trades (click → opens TradeForm) + the market note (read / write-if-none / edit / share); blue `.note-dot` marks days with a note; journal Editor extracted to shared `JournalEditor.jsx` (with `fixedDate`), reused by Market tab + Calendar. (3) New Study/Learn tab: `server/study.js` store (`study.json`) + `/api/study` CRUD/screenshots; `StudyView.jsx` (title, category, tags, long content, screenshots, search, reader modal). (4) Shareable: `StudyShareCard.jsx` canvas card (reuses exported ShareCard helpers), JournalShareCard wired into the Calendar day view. Note: browser-pane screenshots time out this environment — verified via canvas pixel-sampling + DOM inspection. — Claude
- 2026-07-24 — v2.6.0: (1) Manual P&L override per trade: new nullable `pnlOverride` field; when set it replaces computed resultDollars (and drives R) in both server `computeMetrics` and client `previewMetrics`; resultPoints stay price-derived. "Adjust trade log P&L…" button in TradeForm reveals the input; "· manual" badge on Result ($). For crypto/other pairs where point-math doesn't fit. (2) Custom assets: `pug_custom_assets` localStorage ({symbol,pointValue}); add-asset row under Symbol; custom assets join the quick-pick and auto-fill point value via `pvFor()`. (3) Removed HTF delivery, Daily bias, HTF PDA, PO3 phase from TradeForm/Filters/TradesView/Dashboard(PO3 table)/AnalysisView(HTF-bias compare + By daily bias + By PO3). Stored data preserved (still in FIELDS, null-tolerant; old trades keep values via normalize/stripComputed). (4) Draw on liquidity gained Session liquidity, PDA array, REH, REL. (5) Model is now a ChoiceField dropdown of playbook names + custom ("Model (playbook)"). Market-journal "Bias" is a separate feature and was left intact. — Claude
- 2026-07-14 — v2.5.0: Market-journal share card (`JournalShareCard.jsx`, Share button per note in MarketJournalView). Canvas PNG like the trade card: date + weekday headline, bias/traded pills, optional Day P&L computed from same-date closed trades (App now passes `trades` to MarketJournalView), wrapped "What I saw"/"Why" sections (canvas grows), first screenshot panel, QR, per-element toggles, copy/download. ShareCard.jsx now exports its canvas helpers (wrapLines/loadImage/roundRect/drawQr) for reuse. Note: browser-pane screenshots timed out this session (capture-side issue); verified via canvas pixel sampling instead. — Claude
- 2026-07-14 — v2.4.0: account status (active/passed/blown) on prop-firm accounts. Server validates via `validStatus()` in propfirms.js (invalid → active, missing → active for pre-existing accounts). UI: instant status dropdown per account row in PropFirmsView (PUTs immediately, colored: active=accent, passed=pos, blown=neg; blown rows dimmed), status column in the All accounts table, status dot in equity-curve headings, "· PASSED"/"· BLOWN" suffix in the TradeForm account picker. — Claude
- 2026-07-14 — v2.3.1: moved prop-firm/account management out of the Data tab into the Accounts tab (owner couldn't find it) and rewrote the broken PropFirmsView inline editing (v2.3.0's onChange handlers cancelled edit mode, so nothing was editable). Accounts tab now = manage firms/accounts (type dropdown, name, current balance — editable via Edit/Save row) + "All accounts" summary table (balance, journal P&L, trades, win%, avg R) + per-account equity curves. Balance is user-maintained ("current balance", matches platform Net Liq); journal P&L shown separately to avoid double counting. TradeForm account dropdown now groups accounts per firm via optgroup. — Claude
- 2026-07-10 — v2.2.0: (1) CSV import auto-detects Tradovate "Performance" exports (buyPrice/sellPrice/qty/boughtTimestamp…): first fill = entry and decides long/short, contract symbol stripped to base (MNQU5→MNQ) so default point values apply, source `tradovate-csv`. (2) Partial exits: new `exits` field (`[{qty,price}]`) in FIELDS/CSV (`2@29550; 1@29600` format); `computeMetrics` uses the qty-weighted avg as effective exit (returned in metrics so decorated `exit`/`contracts` are partials-aware); TradeForm has scale-out rows and disables Exit price when partials are set; share card shows "EXIT (AVG)" + per-partial line. (3) Share card: subtle QR (qrcode-generator, first client dep added since v1) top-right linking to github.com/ven0x-s/pugzilla, toggleable. — Claude
- 2026-07-09 — v2.1.1: footer now shows build id (`__BUILD_SHA__`/`__BUILD_DATE__` injected via vite `define`; CI passes `GIT_SHA` build-arg through Dockerfile ARG). `api.js` turns network-level "Failed to fetch" into an actionable message and 401s outside /auth into a "session expired, re-login" hint (in-memory sessions reset on every container update — the likely cause of user reports). — Claude
- 2026-07-06 — Renamed the GitHub repo `tradezilla` → `pugzilla` and updated all code/doc references (GHCR image path, compose service+container name, quickstart URL, README/DOCKER titles, package names, server backup filename/log). Left Tradovate `appId`/`deviceId` untouched (external identifiers). NAS had to `down` the old `tradezilla` container, fetch the new `docker-compose.ghcr.yml`, then `pull`+`up -d` the `pugzilla` image. — Claude
- 2026-07-06 — Created MEMORY.md from full-codebase analysis at commit `a917133` (v2.0.0). — Claude
- 2026-07-06 — Added Market Journal (`server/journal.js` store + `/api/journal` CRUD/screenshots, `MarketJournalView.jsx`, "Market" tab): per-day notes (date, bias, took-trades flag, what-I-saw, why-did/didn't-trade, screenshots) for days with or without trades — separate from the trades store. Also added Share-card element toggles (+ P&L in points). — Claude
- 2026-07-06 — Added shared Account-type + Playbook filters (in `emptyFilters`/`Filters.jsx`, applied via `App.filtered` so Trades+Insights stay consistent), per-trade `playbookId` selector, `By playbook` report + Trades table Account/Playbook columns, trade Notes on the Share image (wrapped, canvas grows to avoid truncation), and a larger header/login logo. `ACCOUNT_TYPES` changed to `Eval/Funded/Demo Funded/Live`. — Claude
<!-- Future sessions: append one dated bullet per significant change. Keep this file under 1000 lines; update sections in place rather than adding new ones. -->
