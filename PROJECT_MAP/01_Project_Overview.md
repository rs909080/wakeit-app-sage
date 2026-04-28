# Box 1: Project Overview

## App Summary
Wakeit is a group alarm sync web application. One person (admin) sets an alarm with a custom tone, and it rings synchronously on every group member's device. 
The unique core mechanic is the **SMS-confirm dismiss**: the alarm cannot be dismissed through the UI. Members must send an SMS with a specific word (e.g., "WAKE") to a Twilio virtual number. This updates a backend system (via Supabase Edge Function) which flips their status to 'awake', dynamically stopping the alarm on their device.

## Core Features
1. **Group Sync:** Alarms sync to all members via Supabase Realtime via 6-digit invite code.
2. **SMS Dismiss:** Only stops when the user texts the Twilio number.
3. **Live Admin Dashboard:** Admins can see who is awake and who is still sleeping in real time.
4. **Custom Audio & Offline Support:** Syncs online but schedules locally so it rings even if offline. Supports default tones, custom audio, and voice recordings.
5. **Day/Night Theme:** Dynamic UI switching based on local time (6AM-6PM Day, else Night).

## Tech Stack
- **Frontend Core:** HTML, CSS, Vanilla JavaScript (Single file `index.html`).
- **Routing:** Hash-based (`#/screen-name`) to support Vercel hosting without 404s.
- **Backend/Auth/DB:** Supabase (PostgreSQL, Auth, Realtime, Storage).
- **Service Worker / PWA:** Caches assets and manages local background notifications (`sw.js`).
- **Payment:** Razorpay integration for Pro/Trial plans.
- **Push Notifications:** OneSignal.
- **SMS Webhook:** Twilio triggering a Supabase Edge Function.
