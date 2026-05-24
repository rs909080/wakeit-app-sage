import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req) => {
  // 1. Get the form data from Twilio
  const formData = await req.formData();
  const fromPhone = formData.get("From")?.toString();
  const body = formData.get("Body")?.toString().trim().toLowerCase();

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
  } else if (profile && body.includes('sleep')) {
    await supabaseAdmin
      .from('wake_attempts')
      .update({ status: 'sleeping', updated_at: new Date().toISOString() })
      .eq('user_id', profile.id)
      .eq('status', 'pending');
  }

  // 5. Send an empty TwiML response back to Twilio
  return new Response(
    '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
    { headers: { "Content-Type": "text/xml" } }
  );
})
