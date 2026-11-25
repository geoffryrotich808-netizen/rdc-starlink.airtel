# RDC Starlink Telegram Connection

This package contains the frontend script and backend needed for the current RDC Starlink flow.

## Existing frontend

Keep your existing:
- index.html
- style.css

Replace your existing:
- script.js

The supplied script expects the IDs already present in the current index.html:
packagePage, packageList, pinPage, pinPackage, phone, pin, pinContinue,
pinStatus, otpPage, otpPackage, otp, timer, expiredText, otpVerify,
requestOtp, otpStatus, successPage, successPackage.

## Backend

Replace the backend server.js with the supplied server.js.

Render:
Build Command: npm install
Start Command: npm start

Keep these Render Environment Variables:
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID

The backend URL used by script.js is:
https://starlink-2mc7.onrender.com

If your Render backend URL changes, update BACKEND_URL in script.js.

## Flow

1. Customer selects a package.
2. Customer enters phone and 4-digit PIN.
3. The PIN value is NOT sent to the backend or Telegram.
4. Telegram receives a PIN-stage request with buttons Approve / Wrong PIN.
5. Approve moves the customer to OTP.
6. OTP-stage request is sent to Telegram.
7. Telegram buttons are Approve / Wrong OTP / Insufficient money / OTP expired.
8. Approve shows the selected package success page.
9. Error decisions return the customer to the relevant section and highlight it red.
10. OTP countdown is 60 seconds; Request Another OTP creates a fresh OTP-stage request.

Important:
This is a demo workflow. The backend stores requests in memory, so a Render restart clears them. For production, use a persistent database and a proper payment/identity verification provider.
