SafeHer Backend
===============

Node.js + Express + Twilio backend for emergency SMS alerts.

## Setup

1. Install dependencies
   npm install

2. Configure credentials
   Copy .env.example to .env and fill in your Twilio credentials:

   TWILIO_ACCOUNT_SID   → Account SID from console.twilio.com
   TWILIO_AUTH_TOKEN    → Auth token from console.twilio.com
   TWILIO_PHONE_NUMBER  → Your Twilio "from" number (e.g. +15551234567)

3. Start the server
   node server.js

## API Endpoints

POST /send-alert
  Body: { "phone": "+15551234567", "message": "Emergency Alert..." }
  Returns: { "success": true, "sid": "SM..." }

POST /send-bulk-alert
  Body: { "contacts": [{ "name": "Jane", "phone": "+15551234567" }], "message": "..." }
  Returns: { "success": true, "alerted": ["Jane"], "failed": [] }

GET /health
  Returns: { "status": "ok", "timestamp": "..." }

## Mobile App Integration

Set BACKEND_URL in services/emergencyService.js to point to this server:
  - Local development:  http://192.168.x.x:3000  (your machine's LAN IP)
  - Production:        https://your-server.com:3000

The mobile app uses this server when online and falls back to device SMS when offline.
