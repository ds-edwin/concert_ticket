# Jukebox purchase landing — 2026-10-22

## Routes and flow

- docs/index.html: jukebox kiosk. Welcome → quantity (1–10) → depositor name plus final four phone digits → transfer instructions.
- docs/ticket.html: existing 3D ticket, now with individual ticket sharing and owner-only local group selection.
- Every purchased seat uses its own random UUID and existing issue/restore API. Purchase metadata is recorded in the existing message column with an explicit unverified-deposit label. No Apps Script redeployment or sheet schema change is required.
- “입금했어요!” is a user declaration, never a bank-confirmed payment. Existing check-in status remains separate.

## Required organizer configuration

Set docs/config.js payment.bank, payment.account and payment.holder to the organizer-confirmed receiving account. All are intentionally empty until supplied. The real issue button and account-copy button stay disabled until all fields are configured. unitPrice is 5000.

## Recovery and privacy

Tokens are persisted before the first write. Each result is saved before issuing the next seat. Retries reuse tokens, and Web Locks serialize checkout across supported browser tabs. Payer details stay in session storage; the purchase manifest retains only a payer hash, quantity, tokens and completion state. Cached ticket names follow existing behavior. Partial errors expose already-issued tickets as well as a retry action.

Ticket links contain only a random ticket token in the URL fragment, never name or telephone digits. A link grants access to that individual ticket. Recipient browsers cannot see the purchaser’s other tickets. Forwarding the same link forwards the same ticket; use one distinct link per guest. Existing manager checks remain bearer-accessible as in the previous release.

## Sharing

Native device sharing lets users select installed targets such as KakaoTalk. Availability depends on device, browser and installed apps. Unsupported browsers fall back to link copy. There is also an SMS composer link. No messages are sent automatically, no SOLAPI integration is used, and no Kakao SDK key is required for this native-share approach.

## Validation

Chromium/Edge automated browser tests with an intercepted mock API (no production writes):

- Minimum is 1
- Maximum is 10
- Ten-ticket total
- Reject incomplete suffix
- No real account: payment disabled
- Leading zeros preserved
- Back preserves payer
- Back preserves quantity
- No mobile horizontal overflow
- Three-ticket payment total
- Partial failure retains first ticket
- Reload retains locked purchase quantity
- Retry creates exactly three unique tickets
- Retry does not issue first ticket twice
- Purchaser can select all three tickets
- Issued name rendered
- Server receives intact phone suffix
- Guest sees only shared ticket, no other tickets
- Shared ticket skips registration
- Native share sends selected ticket URL
- Manager cut interaction still arms
- Manager cut interaction toggles off
- Ticket sharing fits 320px
- Kiosk fits 320px
- Invalid link has clear error
- No JavaScript page errors during the tested flow.
- Desktop (1440px) and mobile layouts visually inspected.
- Payment checkout and live message apps have not been verified against a real receiving account/device. Bank configuration remains the deployment blocker for actual purchases.
