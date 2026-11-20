# Golden Hour, Midnight Glamour — Vote

Status: complete

KPF Singapore Christmas Party "Golden Hour, Midnight Glamour" (3 Dec 2026, Bedrock Origin,
Sentosa) Best Dressed ranked-choice voting app.

## Files
- `index.html` / `app.js` — guest voting flow: welcome + judging tips, pick own name (search,
  no free typing), rank 1–3 candidates (tap order sets rank, up/down/remove controls, self
  blocked with note), review with gold rank badges, submit, confetti/snow confirmation screen.
  Already-voted is remembered locally (`localStorage`) AND must be enforced server-side too.
- `qr.html` — organiser "Show QR" screen. QR generated fully in-browser via `qrcodejs`
  (cdnjs), pointing at `index.html` on the same origin. No external QR API.
- `results.html` / `results.js` — PIN-gated (`2026`) organiser dashboard: live leaderboard
  sorted by points, tie-break by 1st then 2nd place picks (shared place highlighted with a
  dashed outline + "(tie)" label), voter count out of 44, CSV export, dramatic Top 3 reveal
  (3rd → 2nd → 1st, one tap at a time, gold confetti), and a type-RESET-to-confirm vote reset.
- `data.js` — the 44-name attendee list (single source of truth for voter + candidate lists) plus the shared `escapeHtml()` helper.
- `storage.js` — shared same-origin storage client (`VoteStorage`). Calls a same-origin JSON
  API at `api/votes/{state,submit,reset}`. **By design it never falls back to per-device
  storage** — any network/404/parse failure throws `StorageUnavailableError`, and both
  `app.js` and `results.js` show a blocking red error banner instead of continuing silently.
- `fx.js` — shared snow + gold glitter background (`initFx()`) and confetti burst
  (`fireConfetti()`), used by index/qr/results pages.
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
- Backend contract expected by `storage.js` (not implemented as part of this static site,
  since KAI hosting here is static-files-only): `GET api/votes/state`,
  `POST api/votes/submit {voter, picks}`, `POST api/votes/reset {confirm:"RESET"}`. If this
  endpoint isn't present, the app surfaces a clear "shared storage unavailable" error on both
  the voting and results pages rather than silently using `localStorage` for vote tallies.

## Libraries / CDNs
- Google Fonts: Playfair Display, Inter.
- `qrcodejs` from cdnjs (`https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js`)
  for in-browser QR generation on `qr.html`.
- No other third-party APIs or services.

## Editing notes
- Attendee list lives only in `data.js`; edit there and both voter/candidate pickers update.
- PIN for results is the literal string `'2026'` near the top of `results.js`.
- Tie-break logic and place assignment are in `computeLeaderboard()` in `results.js`.
- Reveal order logic (3rd→2nd→1st) is in the `btnReveal` handler in `results.js`.

## Changelog (most recent first)
- Light theme (cream background, dark-gold text, cool-grey snow) + bug-fix pass:
  - Voting: "Review Picks" button now shows as soon as the rank screen opens; already-voted phones are blocked instead of just warned; empty ballots can no longer be submitted; added "Not you? Change name"; search boxes reset between steps; hint when trying a 4th pick; keyboard-accessible name cards; localStorage failures no longer break voting; error text is HTML-escaped.
  - Results: people with 0 points are no longer shown as "1 (tie)"; duplicate/self/4th picks are ignored defensively; reveal refreshes data, refuses to open with no votes, scrolls to the overlay and disables Next at the end; reset modal scrolls into view; CSV gets a UTF-8 BOM; leaderboard auto-refreshes every 20s.
  - Storage: GETs are never cached; 405/502/503/504 count as "storage unavailable".
  - QR page: graceful fallback if the CDN library is blocked. Added favicon, theme-color, noindex on organiser pages.
- Initial build: all files created per spec above.
