# Verification

## 2026-10-22: final setlist and direct ticket transport

Story: registration form or restore button -> Apps Script -> private registration sheet -> confirmed ticket display.

- The organizer supplied the final 16-song setlist and 15 exact YouTube URLs. Blue rain by 오혜린 intentionally has no link.
- The setlist is now bundled in config.js. All setlist sheet reads, cache replacement, polling, refresh buttons and loading timestamps were removed from the website.
- YouTube links use accessible icon-only buttons with 44px touch targets.
- A read-only POST probe to the current production endpoint returned HTML with "다음 스크립트 함수(doPost)를 찾을 수 없습니다." The direct JSON transport is therefore not installed in the current Google deployment.
- Added a doPost transport that routes issue/restore/check to the existing token-protected, locked backend. It sends no Google cookies and keeps personal input and the request token in the POST body.
- Existing deployments remain usable through the legacy bridge until the HTTP version responds successfully. Publishing GitHub files alone does not update Apps Script.
- Added a server-update helper page with the exact add-on code, existing-deployment instructions and a read-only health check.
- The connected browser reaches the Apps Script sign-in page, not an authenticated editor. The owner must save the add-on code and update the existing deployment to a new version.
- Local backend checks: 22/22 passed against the complete INSTALL.gs, including HTTP issue, idempotent repeat, restore, check, validation and post-commit recovery.
- Client tests: 12/12 passed, including credential-free direct POST, no iframe on the direct path, native AbortError recovery, correlated replies and legacy-server compatibility.
- JavaScript syntax checks passed.
- Frontend deployment succeeded (Pages run 39635592483). Browser verification of the final 16-song display was interrupted, so visual confirmation is pending.
- Full production verification of direct issuance/restore is blocked on the Apps Script deployment update. No additional production ticket was issued during this update.

## Previously verified

- Portrait ticket artwork, participant back and exported PNG; all requested copy changes.
- A synthetic ticket was issued and manager confirmation recorded in the private production sheet during earlier integration work.
- A subsequent production restore completed in the connected browser. The user's browser continued to fail, so that earlier result is not evidence that the reported problem was resolved.
