# Golden Hour, Midnight Glamour — Vote

Status: complete

KPF Singapore Christmas Party "Golden Hour, Midnight Glamour" (3 Dec 2026, Bedrock Origin,
Sentosa) Best Dressed ranked-choice voting app.

## Files
- `index.html` / `app.js` — guest voting flow (reached by scanning the QR, at `/index.html`): welcome + judging tips, pick own name (search,
  no free typing), rank 1–3 candidates (tap order sets rank, up/down/remove controls, self
  blocked with note), review with gold rank badges, submit, confetti/snow confirmation screen.
  Already-voted is remembered locally (`localStorage`) AND must be enforced server-side too.
- `qr.html` — landing page (`/`): the "Scan to Vote" QR screen, with an organiser link to results. QR generated fully in-browser via `qrcodejs`
  (cdnjs), pointing at `index.html` on the same origin. No external QR API.
- `results.html` / `results.js` — PIN-gated organiser dashboard (PIN checked by the server): live leaderboard
  sorted by points, tie-break by 1st then 2nd place picks (shared place highlighted with a
  dashed outline + "(tie)" label), voter count out of 44, CSV export, a "Launch Top 3 Reveal" button that opens the reveal in a new tab,
  and a type-RESET-to-confirm vote reset.
- `reveal.html` / `reveal.js` — full-screen Top 3 reveal page for a projector (opens in its own tab from the results page): 3rd → 2nd → 1st, one tap (button, Space or →) at a time, gold confetti, progress dots, final podium. Gets the PIN from the results tab (sessionStorage) or asks for it.
- `scoring.js` — shared `computeLeaderboard()` (points, tie-break, places) and `buildRevealQueue()`, used by results and reveal pages.
- `data.js` — the 44-name attendee list (single source of truth for voter + candidate lists) plus the shared `escapeHtml()` helper.
- `storage.js` — shared same-origin storage client (`VoteStorage`). Calls a same-origin JSON
  API at `api/votes/{state,submit,reset}`. **By design it never falls back to per-device
  storage** — any network/404/parse failure throws `StorageUnavailableError`, and both
  `app.js` and `results.js` show a blocking red error banner instead of continuing silently.
- `fx.js` — shared snow + gold glitter background (`initFx()`) and confetti burst
  (`fireConfetti()`), used by index/qr/results pages.
- `emblem.svg` — the festive header emblem (gold Art Deco sunburst, three decorated Christmas trees, sparkles), used on every page in place of the old plain fan + emoji.
- `style.css` — Christmas × Art Deco theme on a light champagne-cream background (dark gold text,
  red accents, deco corner frame + fan motif, ornament-style gold/silver/bronze rank badges,
  Playfair Display for headings.

## Design decisions
- Scoring: 1st = 3 pts, 2nd = 2 pts, 3rd = 1 pt, summed across all voters; no per-criterion
  scoring anywhere. The 3 judging criteria are shown only as inspirational tips on the
  welcome screen.
- Self-voting is blocked in the UI (name greyed out, not clickable, with a note) on the
  candidate list; `storage.js`/the backend must also reject a vote where the voter's own name
  appears in `picks` — this is a server-side contract the real backend must honor.
- "One vote per person" is enforced by the backend rejecting a second submit for a name
  already in its `votes` map; the client also remembers locally as a fast UX guard, but the
  source of truth is the server per spec.
- Backend: `server.js` (zero-dependency Node) serves the site and implements the API that
  `storage.js` calls: `GET /api/votes/state` and `POST /api/votes/reset` (both require the
  organiser PIN in an `X-Organiser-Pin` header) and `POST /api/votes/submit {voter, picks}`. The
  server validates every vote against `data.js` (known voter, 1-3 distinct known picks, no
  self-vote, one vote per name) and rate-limits wrong PIN guesses. If the API is missing, the
  app shows a "shared storage unavailable" error rather than silently using `localStorage`.
- Persistence: votes are stored in `DATA_DIR/votes.json` (atomic writes). On Railway, mount a
  volume at `/data` and set `DATA_DIR=/data`, otherwise votes are lost on every redeploy.

## Libraries / CDNs
- Google Fonts: Playfair Display, Inter.
- `qrcodejs` from cdnjs (`https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js`)
  for in-browser QR generation on `qr.html`.
- No other third-party APIs or services.

## Editing notes
- Attendee list lives only in `data.js`; edit there and both voter/candidate pickers update.
- Organiser PIN is the `ORGANISER_PIN` environment variable on the server (never stored in the repo).
- Tie-break logic and place assignment are in `computeLeaderboard()` in `scoring.js`.
- Reveal order logic (3rd→2nd→1st) is `buildRevealQueue()` in `scoring.js`; the reveal UI is `reveal.js`.

- Voting deadline: voting closes at `VOTING_DEADLINE` (default `2026-12-03T20:30:00+08:00`, i.e. 8:30 PM Singapore time). The welcome screen shows it, `GET /api/votes/config` exposes it, and `POST /api/votes/submit` returns 403 after it (server clock decides, not the guest's phone). Results/reveal still work afterwards. Change it with the `VOTING_DEADLINE` env var (ISO time with offset).

## Run locally / deploy
`ORGANISER_PIN=XXXX node server.js` then open http://localhost:3000. On Railway: `npm start`, env `ORGANISER_PIN` + `DATA_DIR=/data`, volume mounted at `/data`.

## Changelog (most recent first)
- New festive header emblem (`emblem.svg`) on the voting, QR, results and reveal pages.
- Voting deadline (8:30 PM SGT on 3 Dec 2026): shown on the welcome screen, enforced by the server, configurable via `VOTING_DEADLINE`.
- Top 3 reveal moved out of the results page into its own full-screen page (`reveal.html`, opens in a new tab); added shared `scoring.js`; reveal ends with a podium and supports Space/→.
- Light theme (cream background, dark-gold text, cool-grey snow) + bug-fix pass:
  - Voting: "Review Picks" button now shows as soon as the rank screen opens; already-voted phones are blocked instead of just warned; empty ballots can no longer be submitted; added "Not you? Change name"; search boxes reset between steps; hint when trying a 4th pick; keyboard-accessible name cards; localStorage failures no longer break voting; error text is HTML-escaped.
  - Results: people with 0 points are no longer shown as "1 (tie)"; duplicate/self/4th picks are ignored defensively; reveal refreshes data, refuses to open with no votes, scrolls to the overlay and disables Next at the end; reset modal scrolls into view; CSV gets a UTF-8 BOM; leaderboard auto-refreshes every 20s.
  - Storage: GETs are never cached; 405/502/503/504 count as "storage unavailable".
  - QR page: graceful fallback if the CDN library is blocked. Added favicon, theme-color, noindex on organiser pages.
- Added `server.js` backend (PIN-protected results/reset, server-side vote validation, file persistence) + `package.json` for Railway deploy.
- Initial build: all files created per spec above.
