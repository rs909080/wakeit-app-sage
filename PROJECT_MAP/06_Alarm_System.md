# Box 6: Alarm System

## Mechanics
1. **Creation:** An Admin generates an Alarm object inside the `alarms` database table.
2. **Distribution:** Realtime listener triggers on the member's client.
3. **Execution (`scheduleLocalAlarm`):**
   - Alarm computes the `setTimeout` difference between now and the target time.
   - Ensures deduplication via tracking scheduled IDs in `AppState.scheduledAlarmIds`.
   - At the exact time, sets hash to `#/alarm-ringing`.
4. **Ringing Output (`triggerAlarm`):**
   - `playAlarmAudio` triggers the Tone (`Web Audio API` or `HTML5 Audio`).
   - If mobile, calls `navigator.vibrate` loop.

## Turning it off (SMS Protocol)
- Standard Snooze is disabled.
- The UI lists an SMS string and a Twilio Number.
- When DB signals Status = 'awake' -> Stop `setInterval`s, stop vibration, `audio.pause()`, redirect to `#/home`.
