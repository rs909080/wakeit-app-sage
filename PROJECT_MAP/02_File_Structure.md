# Box 2: File Structure

## Core Architecture
The application runs entirely from a single file frontend architecture to eliminate complicated build steps and ensure maximum performance. 

## Files
- `index.html`: The monolithic codebase housing the DOM structure, CSS (via internal styles), and the entirety of the JS application logic (Router, Supabase Data Models, UI renderers, Alarm engines).
- `sw.js`: Service worker logic. Provides offline caching of assets, caches alarm tones, handles PWA install, and manages background notifications.
- `manifest.json`: Configuration for PWA installation (icons, theme colors, display modes).
- `OneSignalSDK.sw.js`: Dedicated service worker for OneSignal push notifications.
- `vercel.json`: Deployment configuration ensuring that static resources are correctly handled or rewritten if necessary.
- `Wakeit_PRD_v3.1.txt`: Original Product Requirements Document which guides the logic and rules built into `index.html`.

## Key Sections inside `index.html`
1. **Config & Globals:** Hashes, `AppState`, `ROUTES`, Config Keys.
2. **Setup:** Twilio, Stripe/Razorpay configurations (dummy or actual). 
3. **Services:** `db`, `db.auth`, `db.groups`, `db.alarms`.
4. **Routing Engine:** Listens to `hashchange` and toggles `.active` class on `.screen` elements.
5. **UI Controllers:** Renders tabs, themes, custom modales.
6. **Alarm Engine:** `scheduleLocalAlarm`, Web Audio API instances, and Web Vibration API.
