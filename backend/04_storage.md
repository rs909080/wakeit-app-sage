# Wakeit Storage Configuration

If Wakeit utilizes custom alarm tones or user avatars uploaded via the web interface, you must configure Supabase Storage.

## Setting up Storage

1. Go to your new Supabase Project Dashboard.
2. Navigate to **Storage** in the left sidebar.
3. Click **New Bucket**.
4. Name the bucket `user_data` (or the exact name used in your frontend code).
5. **CRITICAL:** Toggle the switch to make the bucket **Public**. If the bucket is private, audio tags (`<audio src="...">`) in HTML will fail to load the alarm tones without signed URLs.

## Storage Security Policies (RLS)

Just like the database, Storage buckets need policies so users can only upload to their own folders, but everyone can read public files.

Go to **Storage -> Policies** and create the following policies for your bucket:

### 1. Read Access (Public)
* **Action:** `SELECT`
* **Target:** `user_data` bucket
* **Allowed Roles:** `public`, `authenticated`, `anon`
* **Policy Condition:** *(Leave blank or use `true`)*

### 2. Insert Access (Authenticated users only)
* **Action:** `INSERT`
* **Target:** `user_data` bucket
* **Allowed Roles:** `authenticated`
* **Policy Condition:** 
  ```sql
  (bucket_id = 'user_data'::text) AND (auth.uid() = owner)
  ```
  *(Note: You might need to adjust this depending on if files are stored under `user_id/` folders)*

### 3. Update/Delete Access (Owner only)
* **Action:** `UPDATE`, `DELETE`
* **Target:** `user_data` bucket
* **Allowed Roles:** `authenticated`
* **Policy Condition:**
  ```sql
  (bucket_id = 'user_data'::text) AND (auth.uid() = owner)
  ```
