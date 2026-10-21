# Verification

- Backend adapter checks: 18/18 passed.
- Live spreadsheet prepared: E=체크여부, F=하고 싶은 말, G=_요청키 (hidden).
- Backend maps columns by title and preserves their order.
- The 1000th ticket grows the default 1000-row sheet for its header.
- Frontend syntax checked; stub rotates 28 degrees away from the viewer.
- No live attendee issued or checked during this task.
- GitHub Pages deployment succeeded on 2026-10-21; the public site loads at https://ds-edwin.github.io/concert_ticket/.
- The deployed Apps Script bridge returned the live issued count (0 / 1000) and an empty setlist without browser console warnings or errors.
- Public browser checks confirmed the compact heading, mint setlist hint, ticket flip, performer lineup, and setlist panel.
- Live issuance and manager check-in remain untested because issuing a test ticket consumes a permanent serial number. Backend adapter tests cover both paths.
