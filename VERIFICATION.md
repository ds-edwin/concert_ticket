# Verification

- Initial backend adapter tests: 18/18 passed.
- The production Apps Script uses the spreadsheet where setup was run. Production registrations were preserved.
- Previous live issuance and manager confirmation were checked using synthetic ticket No. 0003; the production sheet recorded O.
- The production setlist was re-read on 2026-10-22 (Asia/Seoul). It contains four songs with artist names.
- The portrait front, participant back and exported portrait PNG were inspected. The back-side content now fits above the perforation.
- Requested copy changes: setlist disclaimer, ticket-owner heading, issue-button instruction, message placeholder, and removal of the closing slogan.
- Client bridge regression tests: 8/8 passed, including a timed-out read while issuance/check is still running, read-only recovery after an uncertain issuance result, and missing-record failures.
- A request timeout now fails only that request. An old connection is replaced only after its remaining requests finish; a slow setlist/restore cannot cancel issuance or manager confirmation.
- An uncertain issuance response triggers a restore lookup using the same stored token. The issuance is never automatically replayed; a missing record remains a failure.
- Background and manual ticket checks now share one lookup and the same button state instead of leaving an enabled button that silently ignores clicks.
- Before this patch, a manual production restore of the existing synthetic ticket succeeded, but the user-reported browser failure was not reproduced directly. This patch addresses independently reproduced concurrency defects, not a verified diagnosis of every browser environment.
- No additional production ticket was issued during this investigation. The current patch deployed successfully (Pages run 39628210439). The production browser loaded the new asset version, completed a manual restore of the existing synthetic ticket, reset the button and showed the success message, with no captured browser warnings/errors. New production issuance was not retested in this investigation.
- Public song data is shown immediately from the latest bundled or browser-cached copy; successful sheet responses replace it. Names, contact suffixes and registration messages are not included in this public cache.
- The blocked-origin local browser test showed all four songs after CONNECT failure, with the last-confirmed time, a latest-query-delay notice and an enabled refresh button.
- Frontend JavaScript syntax checks passed.
- Production Pages deployment succeeded. A fresh browser load immediately displayed all four songs from the saved copy, then changed to the live-confirmed updated state after a successful sheet response.
- All five requested wording changes were verified in the deployed DOM; no browser warnings or errors were reported.
