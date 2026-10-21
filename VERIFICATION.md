# Verification

- Initial backend adapter tests: 18/18 passed.
- The production Apps Script uses the spreadsheet where setup was run. Production registrations were preserved.
- Previous live issuance and manager confirmation were checked using synthetic ticket No. 0003; the production sheet recorded O.
- The production setlist was re-read on 2026-10-22 (Asia/Seoul). It contains four songs with artist names.
- The portrait front, participant back and exported portrait PNG were inspected. The back-side content now fits above the perforation.
- Requested copy changes: setlist disclaimer, ticket-owner heading, issue-button instruction, message placeholder, and removal of the closing slogan.
- Client bridge regression tests: 5/5 passed (dropped request recovery, bounded handshake failure, no automatic issuance replay, simultaneous read recovery, and origin/source validation).
- A server timeout now invalidates the old connection. Only public/restore reads retry automatically, once.
- Public song data is shown immediately from the latest bundled or browser-cached copy; successful sheet responses replace it. Names, contact suffixes and registration messages are not included in this public cache.
- The blocked-origin local browser test showed all four songs after CONNECT failure, with the last-confirmed time, a latest-query-delay notice and an enabled refresh button.
- Frontend JavaScript syntax checks passed.
- Production Pages deployment succeeded. A fresh browser load immediately displayed all four songs from the saved copy, then changed to the live-confirmed updated state after a successful sheet response.
- All five requested wording changes were verified in the deployed DOM; no browser warnings or errors were reported.
