# RDC Starlink Telegram Backend

## Render

Build Command:
npm install

Start Command:
npm start

## Environment Variables

Add these in Render, not in GitHub:

TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID

## Website API

POST /api/requests
GET /api/requests/:id

The backend sends the package request and a masked phone number to the configured Telegram admin chat.

For safety, this backend does NOT accept, store, forward, or display customer PINs or OTP codes.

## Telegram admin buttons

The Telegram message contains:

- Approve
- Wrong PIN
- Wrong OTP
- Insufficient money
- OTP expired

The customer's website can poll GET /api/requests/:id and update its page according to the returned status.

This demo stores requests in memory. For production, use a persistent database and proper authentication.
