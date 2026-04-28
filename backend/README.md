# Wakeit Supabase Backend Guide

This folder contains everything you need to recreate the entire backend architecture of the Wakeit app in a completely new Supabase project.

## Migration Steps

To recreate the backend in a new Supabase account, follow these steps exactly in order:

### 1. Database Schema
Go to **SQL Editor** in your new Supabase project. Open the `01_schema.sql` file in this folder, copy its entire contents, and paste it into the SQL Editor. Click **Run**. This will create all your tables, relationships, and the automatic profile creation trigger.

### 2. Row Level Security (RLS) Policies
In the same **SQL Editor**, open the `02_policies.sql` file, copy its contents, run it. This secures your database so users can only see and modify data they own or groups they belong to.

### 3. Authentication Setup
1. Go to **Authentication -> Providers**.
2. **Email**: Ensure Email sign-ins are enabled. Turn OFF "Confirm email" (if you want seamless signup without verification codes for now).
3. **Google (Optional)**: If you are using Google Login, enable it and paste your Google Client ID and Secret.

### 4. Storage Buckets
If the app stores user avatars, custom alarm tones, or anything else:
1. Go to **Storage -> New Bucket**.
2. Create a bucket (check `04_storage.md` for specific bucket names, like `user_data`).
3. Set the bucket to "Public".

### 5. Edge Functions (Twilio / SMS handling)
If you have Twilio integrated for SMS replies:
Check the `03_edge_functions.md` file for the code and instructions on how to deploy the Supabase Edge function that listens to Twilio SMS replies and updates the database.

### 6. Update Frontend Variables
Finally, in your `index.html` file (or wherever your environment variables are stored), you must update the Supabase URL and Anon Key to point to the new project:
```javascript
const SUPABASE_URL = 'https://YOUR_NEW_PROJECT_ID.supabase.co';
const SUPABASE_ANON = 'YOUR_NEW_ANON_KEY';
```
*(You find these in Supabase -> Project Settings -> API).*
