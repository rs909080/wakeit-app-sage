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

/**
 * trigger-alarm Edge Function
 * 
 * Called ~3 seconds before an alarm is due (by pg_cron or external scheduler).
 * 
 * 1. Broadcasts a Realtime event on the alarm's group channel
 *    → online clients pick it up instantly and ring
 * 2. Sends FCM high-priority push to all group members' device tokens
 *    → wakes up offline/sleeping devices via service worker
 * 3. Logs delivery to alarm_delivery table for auditing
 *
 * Body: { alarm_id: string }
 */
const rateLimitMap = new Map<string, { count: number, resetAt: number }>();
function checkRateLimit(req: Request) {
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  const now = Date.now();
  let record = rateLimitMap.get(ip);
  if (!record || record.resetAt < now) {
    record = { count: 0, resetAt: now + 60000 };
  }
  record.count++;
  rateLimitMap.set(ip, record);
  return { allowed: record.count <= 20, remaining: Math.max(0, 20 - record.count) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const rl = checkRateLimit(req);
  if (!rl.allowed) {
    return new Response("Too Many Requests", { status: 429, headers: { ...corsHeaders, "X-RateLimit-Limit": "20" } });
  }

  try {
    const { alarm_id } = await req.json();
    if (!alarm_id) throw new Error("Missing alarm_id");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 1. Fetch the alarm details
    const { data: alarm, error: alarmErr } = await supabaseAdmin
      .from("alarms")
      .select("id, group_id, alarm_time, tone_name, tone_url, is_active")
      .eq("id", alarm_id)
      .single();

    if (alarmErr) throw alarmErr;
    if (!alarm) throw new Error("Alarm not found");
    if (!alarm.is_active) {
      return new Response(
        JSON.stringify({ success: true, message: "Alarm is inactive, skipping" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json", "X-RateLimit-Limit": "20" } }
      );
    }

    // 2. Get all group members and their device tokens
    const { data: members } = await supabaseAdmin
      .from("group_members")
      .select("user_id")
      .eq("group_id", alarm.group_id);

    const userIds = (members || []).map((m: { user_id: string }) => m.user_id);

    if (userIds.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No group members to notify" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json", "X-RateLimit-Limit": "20" } }
      );
    }

    // 3. Broadcast via Supabase Realtime (channel: alarm-group-{group_id})
    //    Online clients subscribe to this channel and trigger alarm locally
    const channelName = `alarm-group-${alarm.group_id}`;
    await supabaseAdmin.channel(channelName).send({
      type: 'broadcast',
      event: 'alarm-ring',
      payload: {
        alarm_id: alarm.id,
        group_id: alarm.group_id,
        alarm_time: alarm.alarm_time,
        tone_name: alarm.tone_name,
        tone_url: alarm.tone_url,
        created_by: alarm.created_by,
        required_taps: alarm.required_taps || 1
      }
    });

    // 4. Send FCM push to all member devices (Layer 2 — offline fallback)
    const { data: tokensData } = await supabaseAdmin
      .from("device_tokens")
      .select("token")
      .in("user_id", userIds);

    const tokens: string[] = (tokensData ?? [])
      .map((t: { token: string }) => t.token)
      .filter(Boolean);

    let fcmSuccessCount = 0;
    let fcmFailureCount = 0;

    if (tokens.length > 0) {
      const firebaseApp = getFirebaseApp();
      const messaging = getMessaging(firebaseApp);

      const fcmResponse = await messaging.sendEachForMulticast({
        tokens,
        data: {
          type: "alarm-ring",
          alarm_id: String(alarm.id),
          group_id: String(alarm.group_id),
          tone_name: alarm.tone_name || "Default",
          tone_url: alarm.tone_url || "",
          created_by: String(alarm.created_by || ""),
          required_taps: String(alarm.required_taps || 1),
        },
        android: {
          priority: "high",
          notification: {
            channelId: "wakeit-alarms",
            title: "⏰ Wakeit Alarm!",
            body: "Your group alarm is ringing. Wake up!",
            sound: "default",
            priority: "max",
          },
        },
        apns: {
          headers: { "apns-priority": "10" },
          payload: {
            aps: {
              contentAvailable: true,
              sound: "default",
              badge: 1,
              alert: {
                title: "⏰ Wakeit Alarm!",
                body: "Your group alarm is ringing. Wake up!",
              },
            },
          },
        },
      });

      fcmSuccessCount = fcmResponse.successCount;
      fcmFailureCount = fcmResponse.failureCount;
    }

    // 5. Log delivery for audit trail
    await supabaseAdmin.from("alarm_delivery").insert({
      alarm_id: alarm.id,
      group_id: alarm.group_id,
      channel: "trigger-alarm",
      realtime_sent: true,
      fcm_sent: tokens.length,
      fcm_success: fcmSuccessCount,
      fcm_failed: fcmFailureCount,
      triggered_at: new Date().toISOString(),
    }).then(() => {}).catch((e) => {
      console.warn("[trigger-alarm] Failed to log delivery:", e);
    });

    return new Response(
      JSON.stringify({
        success: true,
        alarm_id: alarm.id,
        group_id: alarm.group_id,
        realtime_broadcast: true,
        fcm_tokens: tokens.length,
        fcm_success: fcmSuccessCount,
        fcm_failed: fcmFailureCount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json", "X-RateLimit-Limit": "20" } }
    );
  } catch (err) {
    console.error("[trigger-alarm] Error:", err);
    return new Response(
      JSON.stringify({ error: String(err instanceof Error ? err.message : err) }),
      { status: 400, headers: { ...corsHeaders, "X-RateLimit-Limit": "20" } }
    );
  }
});
