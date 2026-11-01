# Privacy notice

Version: 2026-11-01

The consumer-facing notice is published at `/privacy` and localised in British English, European Spanish and European French. Keep this source aligned with [Policy.tsx](../src/Policy.tsx).

## Data used for accounts and games

Ludus stores email for sign-in, account settings, language and timezone, chess games and results, private coach reviews and conversations. Public profiles can show username, rank and activity; each player can hide their activity grid.

For an AI review, the browser analyses the selected finished game and up to three preceding finished games where snapshots are available. If a prior game or its engine analysis is missing, the browser marks the gap and can continue with the current game. Ludus sends relevant moves, results, player colour, browser engine analysis, selected teaching profile and language, and any follow-up question or short conversation context to its server and an external AI provider. Ludus does not send email, username, account ID or match ID to that provider.

Saved reviews and replies stay private and retain their generation language. A language change affects future output only and never triggers a new paid review.

## Providers and retention

Stripe hosts payment collection and processes card details. Ludus retains payment identifiers and credit balances for fulfilment, refunds, disputes and accounting; it does not store the full card number. Cloudflare hosts the service and database. Resend delivers authentication email.

The registered controller identity and address, AI provider and its retention terms, contact channel for privacy and refund requests, and exact retention period for payment records remain release gates. Publish and verify them before enabling AI coaching or paid checkout as applicable. Set Stripe's Dashboard Terms URL to `https://ludus.mrlemoos.dev/terms` and privacy URL to `https://ludus.mrlemoos.dev/privacy` after this review. Account deletion removes private reviews and profile data, anonymises retained matches, and preserves only records needed for legal, payment, dispute or abuse handling.

Uninvited waitlist entries expire after 180 days. Invitation delivery metadata is kept for 30 days and abuse reports for 90 days. Ludus does not use account email for marketing.
