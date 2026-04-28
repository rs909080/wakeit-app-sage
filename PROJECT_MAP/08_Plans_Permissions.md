# Box 8: Plans and Permissions

## Available Tiers

### Trial Plan
- **Cost:** ₹25 one-time.
- **Limits:** 
  - Valid for 7 days.
  - 1 Group limit.
  - Max 5 members per group.
  - Basic tones only.
- **Includes:** SMS dismiss logic.

### Pro Plan
- **Cost:** ₹499 / year.
- **Limits:**
  - Unlimited groups.
  - Max 20 members per group.
  - Voice Recording & Custom Audio Tones Unlocked.
- **Includes:** SMS dismiss logic.

## State Management
- Stored temporarily globally in `localStorage.getItem('wakeit_plan')`.
- Authenticated and locked via Paywall (`#/paywall`) route blocker.
