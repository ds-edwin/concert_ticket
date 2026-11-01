# Registration links for previously paid tickets

Open https://ds-edwin.github.io/concert_ticket/paid-tickets.html.

1. Choose 1–10 tickets and press 공유하기. On devices without native sharing, the link is copied.
2. Send the generated URL to the recipient. It opens the existing ticket page with numbered ticket choices.
3. Each person enters their name and last four phone digits, then presses 나의 티켓 받기.
4. Re-share the same URL to reuse the same ticket slots. Use 새 링크 만들기 for a different group. Recent links are saved only in the creator's browser.

Each slot has a fixed UUID and uses the existing issue/restore API and its idempotency protection. Group selection travels in the URL fragment, so recipients do not need the creator's localStorage. Individual-ticket sharing still sends only the selected ticket.

Creating or sharing a group does not reserve a serial number, create a deposit ledger row, verify bank payment, or mark a ticket as checked in. The existing registration API issues the serial when the attendee submits their information. Group size is a navigation convenience, not a new server-side payment authorization system.

No Apps Script update is required. Standard checkout and its deposit recording remain unchanged.

Run: node tests/registration-links.test.cjs
