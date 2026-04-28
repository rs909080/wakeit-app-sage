# Box 5: Core Features

1. **Theme Switching (Day / Night)**
   - Automatic execution: `getTheme()` evaluates `new Date().getHours()`.
   - Before 6PM: Day (Neumorphism, Green).
   - After 6PM: Night (Glassmorphism, Purple glow). 

2. **Supabase Realtime Sync**
   - The app dynamically subscribes to channels for alarms and group changes.
   - When an admin triggers an alarm, it generates rows, which sync realtime payloads to all members.

3. **Twilio SMS Webhook**
   - Instead of UI buttons, the app lists the Group's Twilio Number.
   - You click a link (`sms:+91XXXX...`) to text and confirm you are awake. 
   - A Supabase Edge Function processes the incoming request, updates your `alarm_wake_status` to `awake`.
   - The app listens for this specific row update. Upon update, it silences your local alarm.

4. **Progressive Web App (PWA)**
   - Provides an App-like feel via `manifest.json`.
   - Service worker caches routes and allows local alarms to trigger if cached content is served while offline.
