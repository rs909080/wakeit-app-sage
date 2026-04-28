import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { initializeApp, getApps, cert } from "npm:firebase-admin@11.11.1/app";
import { getMessaging } from "npm:firebase-admin@11.11.1/messaging";
import { createClient } from "npm:@supabase/supabase-js@2";

const APP_NAME = "wakeit-admin";

function getFirebaseApp() {
  const existing = getApps().find(a => a.name === APP_NAME);
  if (existing) return existing;

  const raw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT") || "{}";
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(raw);
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT env var is not valid JSON");
  }

  if (!serviceAccount.project_id) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is missing project_id — check Supabase secret");
  }

  return initializeApp({ credential: cert(serviceAccount) }, APP_NAME);
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Fetch all active alarms — time_string is now auto-populated by DB trigger
    const { data: alarms, error: alarmErr } = await supabaseAdmin
      .from("alarms")
      .select("id, group_id, alarm_time, time_string, is_active")
      .eq("is_active", true);

    if (alarmErr) throw alarmErr;
    if (!alarms || alarms.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No active alarms to sync" }),
        { headers: corsHeaders }
      );
    }

    const firebaseApp = getFirebaseApp();
    const messaging = getMessaging(firebaseApp);

    let totalSent = 0;
    let totalFailed = 0;

    for (const alarm of alarms) {
      // Derive time_string from alarm_time if DB trigger hasn't set it yet
      const timeStr = alarm.time_string ?? (() => {
        const d = new Date(alarm.alarm_time);
        const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
        return `${String(ist.getUTCHours()).padStart(2,"0")}:${String(ist.getUTCMinutes()).padStart(2,"0")}`;
      })();

      const { data: members } = await supabaseAdmin
        .from("group_members")
        .select("user_id")
        .eq("group_id", alarm.group_id);

      if (!members || members.length === 0) continue;

      const userIds = members.map((m: { user_id: string }) => m.user_id);
      const { data: tokensData } = await supabaseAdmin
        .from("device_tokens")
        .select("token")
        .in("user_id", userIds);

      const tokens: string[] = (tokensData ?? [])
        .map((t: { token: string }) => t.token)
        .filter(Boolean);

      if (tokens.length === 0) continue;

      // Data-only push — service worker schedules a local notification
      const result = await messaging.sendEachForMulticast({
        tokens,
        data: {
          type: "nightly-sync",
          alarm_id: String(alarm.id),
          time_string: timeStr,
        },
        android: { priority: "high" },
        apns: {
          headers: { "apns-priority": "5" },
          payload: { aps: { contentAvailable: true } },
        },
      });

      totalSent   += result.successCount;
      totalFailed += result.failureCount;
    }

    return new Response(
      JSON.stringify({
        success: true,
        synced_alarms: alarms.length,
        tokens_sent: totalSent,
        tokens_failed: totalFailed,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[nightly-alarm-sync] Error:", err);
    return new Response(
      JSON.stringify({ error: String(err instanceof Error ? err.message : err) }),
      { status: 400, headers: corsHeaders }
    );
  }
});
