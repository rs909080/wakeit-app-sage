import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  
  try {
    const { alarm_id } = await req.json();
    if (!alarm_id) throw new Error("Missing alarm_id");

    const app_id = Deno.env.get("ONESIGNAL_APP_ID");
    const rest_api_key = Deno.env.get("ONESIGNAL_REST_API_KEY");

    if (!app_id || !rest_api_key) {
      throw new Error("OneSignal secrets are not configured.");
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get the alarm details
    const { data: alarm, error: alarmErr } = await supabaseAdmin
      .from('alarms')
      .select('*, groups(name)')
      .eq('id', alarm_id)
      .single();

    if (alarmErr || !alarm) throw new Error("Alarm not found");

    // Get all members of the group
    const { data: members } = await supabaseAdmin
      .from('group_members')
      .select('user_id, profiles(onesignal_id)')
      .eq('group_id', alarm.group_id);

    const playerIds = members
      .map(m => m.profiles?.onesignal_id)
      .filter(id => id != null);

    if (playerIds.length === 0) {
      return new Response(JSON.stringify({ message: "No users with OneSignal ID found." }), { headers: corsHeaders });
    }

    const [hours, minutes] = alarm.time_string.split(':').map(Number);
    const now = new Date();
    let targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0);
    if (targetDate < now) {
      targetDate.setDate(targetDate.getDate() + 1);
    }
    // Subtract 1 minute
    targetDate.setMinutes(targetDate.getMinutes() - 1);

    const payload = {
      app_id: app_id,
      include_player_ids: playerIds,
      headings: { en: 'Wakeit Group Alarm' },
      contents: { en: `Alarm ringing in 1 minute for group "${alarm.groups.name}"!` },
      send_after: targetDate.toISOString() + " GMT",
    };

    const res = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Basic ${rest_api_key}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: corsHeaders });
  }
});
