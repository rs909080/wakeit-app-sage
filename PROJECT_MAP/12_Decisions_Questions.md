# Box 12: Decisions and Questions

## Architectural Decisions
1. **Twilio Edge Function Hook over Frontend Hook:** The Twilio SMS webhook evaluates and writes to the DB entirely via a Supabase Edge Function to prevent user device-level interference and simplify logic.
2. **Single File Structure (`index.html`):** Used to prevent any Vercel configuration friction regarding Single Page App redirects.
3. **Hash Routing (`#/path`):** Bypasses Vercel's standard HTTP strict routing errors on refresh.

## Open Questions / Clarifications required from Admin
1. Is the webhook Twilio number generic to all Wakeit users, or provisioned dynamically per group? (Implied shared Twilio number based on PRD).
2. Are push payload messages purely informational, or do they directly trigger local JS via the Background Sw.js? (Implied informational + Navigation trigger as per SW constraints).
