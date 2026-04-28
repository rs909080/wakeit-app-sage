# Box 9: Dashboard

## The Admin Wake Dashboard (`#/wake-dashboard`)
An exclusive view restricted strictly to Group Owners.

## Visual Display
- Displays members split into **two columns/tabs**: 
  1. `<Awake>`: The member submitted the Twilio SMS confirmation.
  2. `<Sleeping>`: The alarm is still running or they have not submitted confirmation yet.
- Color Coded: Green (Awake) / Orange/Red (Sleeping).

## Actions
- The Admin operates solely as a viewer aside from **Nudging**.
- The Admin can send a manual Push Notification buzz/nudge via OneSignal to targeted "Sleeping" users to manually wake them up.
- The Dashboard uses Subabase's Realtime `on` listener to dynamically shift users between lists seamlessly without refresh.
