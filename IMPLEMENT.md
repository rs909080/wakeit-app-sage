# WAKEIT IMPLEMENTATION PLAN

## Already Built — Will Not Touch
- `appInit()` — app boot sequence working
- `onAuthStateChange` — Supabase auth listener working
- `onRouteChange()` — page routing working
- `AppState` object — state management working
- Critical SyntaxError fixed (duplicate const members)
- Service Worker `sw.js` — v21, network-first for index.html
- `manifest.json` — PWA manifest present
- `offline.html` — offline fallback page present
- Firebase initialized successfully
- Server clock sync — `clockOffset` calculated (1125ms detected)
- App boots and renders landing page correctly

## Task 1 — Fix Database Schema
Files to change: Supabase SQL via `mcp_supabase_execute_sql` (creating tables, renaming columns)
Files to update: `index.html` (update all references to `owner_id`, `expected_members`, `alarm_time`, `tone_name`)
End result: Database schema will perfectly match app expectations with correct column names, and missing tables (`alarm_delivery`, `alarm_history`) will be fully created. All frontend queries will be updated to use the new names.

## Task 2 — Fix RLS Policies
Files to change: Supabase SQL via `mcp_supabase_execute_sql`
End result: All RLS policies for `profiles`, `groups`, `group_members`, `alarms`, `alarm_wake_status`, `device_tokens`, `alarm_delivery`, and `alarm_history` will be updated to strictly allow appropriate user/admin/service role access, ensuring no data shows "Loading..." forever due to blocks.

## Task 3 — Fix Pricing Plans
Files to change: `index.html`
End result: The pricing logic will be completely hardcoded in JavaScript. The 4 specific plans (Free Trial, Member, Admin, Organisation) will be embedded. The pricing modal will display these 4 plans instantly without any loading state. Legacy texts like "₹25 trial" will be removed. 

## Task 4 — Fix Home Screen Clock and Data
Files to change: `index.html`
End result: A standalone clock powered by `setInterval` every 1000ms using `new Date()` will run immediately, and all `--:--` placeholders will be removed. The greeting will update based on the hour. The home screen data loading will strictly follow the cache-first pattern (LocalStorage -> Fetch -> Update -> Cache). 

## Task 5 — Fix Invite Code and Group Screen Data
Files to change: `index.html`
End result: All hardcoded `------` occurrences will be removed and replaced with real invite codes immediately. Members and alarms lists on the group screen will use skeleton loaders and cache-first logic without showing generic "Loading..." text.

## Task 6 — Fix and Complete Edge Functions
Files to change: 
- `supabase/functions/get-server-time/index.ts`
- `supabase/functions/send-alarm-fcm/index.ts`
- `supabase/functions/nightly-alarm-sync/index.ts`
- `supabase/functions/trigger-alarm/index.ts`
End result: All 4 edge functions will be properly written and deployed via the Supabase CLI (`run_command`), enabling accurate server time syncing, FCM push notifications to offline devices, nightly alarm scheduling, and Realtime alarm broadcasting.

## Task 7 — Build Core Alarm Sync System
Files to change: `index.html`
End result: A 3-layer system will be built. Layer 1 uses Supabase Realtime (`subscribeToAlarmChannel`). Layer 2 uses FCM (`send-alarm-fcm`). Layer 3 uses Local Notifications. The `trigger-alarm` function will fire 3 seconds early. Audio buffers will be prepared in advance, and all devices will ring within 50ms of each other.

## Task 8 — Fix FCM Token Management
Files to change: `index.html`
End result: FCM notification permissions will be properly requested with specific messaging. The FCM token will be fetched and upserted to the `device_tokens` table in Supabase. It will also auto-update if it changes during token refresh or app open.

## Task 9 — Fix Pricing Popup Logic
Files to change: `index.html`
End result: The pricing modal will accurately pop up on signup success, first login, or when the user's plan expires. Expiry modal won't have a close button for the first 5 seconds and will persist as a bottom banner until payment succeeds.

## Task 10 — Fix Sidebar Pricing Button
Files to change: `index.html`
End result: One clearly visible "⭐ Upgrade Plan" button will be added to the bottom of the left sidebar. All other pricing links in the app will be removed. 

## Task 11 — Enforce Plan Limits in Code
Files to change: `index.html`
End result: The application will strictly enforce membership constraints based on the `getUserPlanLimits(planType)` helper function. Group creation and member additions will trigger pricing modally or show specific warnings when limits are reached.

## Task 12 — Fix all Performance and Response Times
Files to change: `index.html`
End result: A strict 200ms visual response rule will be applied globally. Loading spinners or visual states will trigger instantly, operations will execute asynchronously, and all "Loading..." plain text will be replaced with skeleton loaders. Logout/login will also adhere to this SLA.

## Task 13 — Fix Audio
Files to change: `index.html`
End result: `unlockAudio()` will be built to unlock the `AudioContext` on the first user interaction. Audio playback will pre-buffer the 4 tones. Alarm ringing will slowly ramp up volume, play HTML5 fallback if Web Audio fails, vibrate the device, and retry if failure occurs.

## Task 14 — Fix Admin Offline Warning
Files to change: `index.html`
End result: The alarm setter screen will subscribe to Supabase Realtime Presence to track which group members are online vs offline. It will display a live updating warning card letting the admin know the exact delivery status condition.

## Task 15 — Fix Wake Dashboard
Files to change: `index.html`
End result: The Wake Dashboard will be directly linked to Supabase Realtime on `alarm_wake_status`, displaying live "🔴 Live" pulsing indicators, supporting single-member nudges (which push an FCM via `send-alarm-fcm` edge function), and rendering true FCM delivery status.

## Task 16 — Fix Specific Error Messages
Files to change: `index.html`
End result: All generic error messages will be scrubbed and replaced with accurate, situation-specific language (e.g. "No internet", "Wrong invite code", "Group full", etc.) with actionable elements like retry links where appropriate.

## Task 17 — Add PWA Install Banner
Files to change: `index.html`
End result: A single-time PWA prompt banner will show for users after their first login. This will trigger the native PWA install prompt and persist the dismissal state in `localStorage` indefinitely.

## Task 18 — Add Alarm History
Files to change: `index.html`
End result: A new "History" tab on the group screen will surface past alarms querying the new `alarm_history` table. Alarms that complete their cycle will insert a summary row that shows accurate participant sleeping/waking stats.

## Task 19 — Missed Alarm Detection
Files to change: `index.html`
End result: Whenever the app resolves auth state, it will query for any alarms that fired in the last 2 hours. If a user missed responding to one, a specific "Missed Alarm" warning overlay will display asking for a late confirmation or dismissal.

## Task 20 — Final Deploy and Verify
Files to change: None (Execution phase)
End result: Final validation will execute. A syntax check will verify `index.html`. `vercel --prod --yes` will execute. A final cross-check with the live site (logging in, rendering all features) will complete the checklist before returning success to you.

## Questions Before Starting
- I am ready to begin. No questions yet! Please provide your approval to start with Task 1.
