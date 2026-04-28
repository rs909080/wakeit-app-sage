# Wakeit Edge Functions (Twilio / SMS webhooks)

Wakeit uses Supabase Edge Functions to handle incoming Twilio SMS messages securely without exposing database credentials to the frontend.

## How it works:
1. When a user replies to an alarm SMS (e.g., replying "AWAKE"), Twilio makes a POST request to your Supabase Edge Function.
2. The Edge function looks up the phone number in the `profiles` table to find the `user_id`.
3. It finds the active alarm in `wake_attempts` for that user.
4. It updates the status to `awake`.
5. Because Supabase Realtime is enabled, the frontend instantly reflects this change.

## Creating the Edge Function in your new project

If you have the Supabase CLI installed, you can create and deploy the function:

```bash
# 1. Login to your new project
supabase login

# 2. Link your local project
supabase link --project-ref YOUR_NEW_PROJECT_ID

# 3. Create the function
supabase functions new twilio-webhook
```

### Edge Function Code (`supabase/functions/twilio-webhook/index.ts`)

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req) => {
  // 1. Get the form data from Twilio
  const formData = await req.formData();
  const fromPhone = formData.get("From")?.toString(); // e.g. +1234567890
  const body = formData.get("Body")?.toString().trim().toLowerCase(); // e.g. "awake"

  if (!fromPhone || !body) {
    return new Response("Missing parameters", { status: 400 });
  }

  // 2. Connect to Supabase using the SERVICE ROLE KEY (bypasses RLS)
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  // 3. Find the user ID based on phone number
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('phone', fromPhone)
    .single();

  if (profile && body.includes('awake')) {
    // 4. Update the most recent pending wake attempt for this user
    await supabaseAdmin
      .from('wake_attempts')
      .update({ status: 'awake', updated_at: new Date().toISOString() })
      .eq('user_id', profile.id)
      .eq('status', 'pending');
  }

  // 5. Send an empty TwiML response back to Twilio
  return new Response(
    '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
    { headers: { "Content-Type": "text/xml" } }
  );
})
```

### Deploying the Function

```bash
supabase functions deploy twilio-webhook --no-verify-jwt
```
*Note: `--no-verify-jwt` is important because Twilio sends raw POST requests, not authenticated Supabase requests.*

### Linking to Twilio

In your Twilio Console:
1. Go to your Phone Number configuration.
2. Under "A Message Comes In", select "Webhook".
3. Enter your Edge Function URL:
   `https://YOUR_NEW_PROJECT_ID.supabase.co/functions/v1/twilio-webhook`
4. Set it to `HTTP POST` and save.
