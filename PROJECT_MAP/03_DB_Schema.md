# Box 3: DB Schema

## Overview
Database operations run on Supabase (PostgreSQL) and are directly queried from the frontend using the Supabase JS Client embed. Realtime features constantly watch table rows for inserts and updates.

## Core Tables (Inferred)
1. **`users` / `profiles`**
   - `id` (UUID): Auth reference.
   - `phone` (string): The user's phone number, crucial for Twilio SMS lookup.
   - `name` (string): Display name.
   - `plan` (string): Trial vs Pro limits.

2. **`groups`**
   - `id` (UUID)
   - `invite_code` (string): 6-digit unique code for onboarding.
   - `owner_id` (UUID): Creator of the group (Admin).
   - `twilio_number` (string): Assigned SMS number.
   - `name` (string): Group display name.

3. **`group_members`**
   - `group_id` (UUID)
   - `user_id` (UUID)
   - `role` (string): admin or member.

4. **`alarms`**
   - `id` (UUID)
   - `group_id` (UUID)
   - `time` (timestamp/string)
   - `tone_url` (string): Supabase storage path or default tone name.
   - `active` (boolean)

5. **`alarm_wake_status`**
   - `id` (UUID)
   - `alarm_id` (UUID)
   - `user_id` (UUID)
   - `status` (string): 'pending', 'awake', 'sleeping'. 
   *(Updated externally by Edge Function on Twilio webhook).*
