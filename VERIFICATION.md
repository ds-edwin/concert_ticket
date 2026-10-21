# Verification

- Backend adapter tests: 18/18 passed in the initial implementation.
- The production Apps Script uses the spreadsheet where setup was run. A different similarly purposed spreadsheet was initially inspected; production records were preserved.
- Live issuance was verified with one synthetic registration (No. 0003).
- Clicking manager confirmation wrote O to that same test row in the production spreadsheet.
- The deployed website displays all four production tracks, with artist names. Manual refresh completed successfully.
- The frontend refreshes the setlist on each opening, with a manual refresh button and a 30-second refresh while the panel is visible. Existing tracks remain visible if a later request fails.
- The supplied portrait artwork is unchanged. The browser renders a vertical ticket with a lower perforation and a folding stub for checked tickets.
- Mobile front and back views were inspected at a 375–390 px content width. The page has no horizontal overflow; touch-action allows vertical panning and pinch zoom.
- Portrait PNG download was exercised successfully for the synthetic ticket and visually inspected.
- Frontend JavaScript syntax checks passed.
- A final spacing adjustment keeps the back-side venue block above the perforation. It is committed; the Pages build was re-run and was queued at the last check.
