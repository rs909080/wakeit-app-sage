# WAKEIT - Key Rotation Plan

This document outlines all the secret keys used by the WAKEIT application, where they are stored, and the procedure to rotate each one.

> **Note**: Vercel environment variable changes take effect on the **next deployment**. Whenever you rotate a key stored in Vercel, you must trigger a redeployment for the changes to apply.

## 1. Supabase
### Keys:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

### Where they are stored:
- `.env.local` / `.env.production` / `.env.staging` (Local / CI environments)
- Vercel Environment Variables
- Supabase Edge Functions (if applicable)

### How to rotate:
1. Go to your Supabase Dashboard -> Project Settings -> API.
2. For `SUPABASE_URL`, it typically doesn't change unless you migrate to a new project.
3. For the `ANON_KEY` and `SERVICE_ROLE_KEY`, use the "Roll" button next to the respective keys.
4. Update the keys in Vercel environment variables.
5. Trigger a new deployment on Vercel.
6. Update your local `.env` files.

## 2. OneSignal
### Keys:
- `ONESIGNAL_APP_ID`
- `ONESIGNAL_REST_API_KEY`

### Where they are stored:
- `.env.local` / `.env.production` / `.env.staging`
- Vercel Environment Variables

### How to rotate:
1. Log in to the OneSignal Dashboard -> Select your App -> Settings -> Keys & IDs.
2. The `ONESIGNAL_APP_ID` is persistent.
3. To rotate the `ONESIGNAL_REST_API_KEY`, generate a new key and delete the old one.
4. Update the Vercel environment variables with the new `ONESIGNAL_REST_API_KEY`.
5. Trigger a new deployment on Vercel.
6. Update local `.env` files.

## 3. Firebase (FCM / Auth)
### Keys:
- `FIREBASE_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_MESSAGING_SENDER_ID`
- `FIREBASE_APP_ID`

### Where they are stored:
- `.env.local` / `.env.production` / `.env.staging`
- Vercel Environment Variables
- Client-side initialization code

### How to rotate:
1. Go to the Firebase Console -> Project Settings -> General.
2. If you need to rotate the Web API Key (`FIREBASE_API_KEY`), go to Google Cloud Console -> APIs & Services -> Credentials, find the Browser key (auto-created by Firebase), delete it, and create a new API key restricting it to Firebase APIs.
3. Other Firebase IDs (`PROJECT_ID`, `APP_ID`, etc.) are generally static and do not need rotation unless you are migrating to a new Firebase project.
4. Update Vercel environment variables.
5. Trigger a new deployment on Vercel.
6. Update local `.env` files.

## 4. Razorpay
### Keys:
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET` (if used on the backend)

### Where they are stored:
- `.env.local` / `.env.production` / `.env.staging`
- Vercel Environment Variables

### How to rotate:
1. Log in to the Razorpay Dashboard -> Settings -> API Keys.
2. Click on "Regenerate Key". You will be given an option to roll over immediately or keep the old key active for up to 24 hours. Choose the 24-hour rollover to prevent downtime.
3. Note the new `RAZORPAY_KEY_ID` (and `RAZORPAY_KEY_SECRET`).
4. Update Vercel environment variables with the new keys.
5. Trigger a new deployment on Vercel.
6. Verify the new keys work, and update local `.env` files.
