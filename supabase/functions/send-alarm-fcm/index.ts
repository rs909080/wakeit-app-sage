import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { initializeApp, getApps, cert } from "npm:firebase-admin@11.11.1/app";
import { getMessaging } from "npm:firebase-admin@11.11.1/messaging";
import { createClient } from "npm:@supabase/supabase-js@2";

const APP_NAME = "wakeit-admin";

// Safe init: reuse existing app if already initialised (avoids "already exists" error)
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
    const { alarm_id, user_ids, group_id, title, body, type } = await req.json();

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    let targetUserIds: string[] = user_ids || [];

    // If a group_id is provided, fetch all group members
    if (group_id && targetUserIds.length === 0) {
      const { data: members, error: membErr } = await supabaseAdmin
        .from("group_members")
        .select("user_id")
        .eq("group_id", group_id);
      if (membErr) throw membErr;
      if (members) targetUserIds = members.map((m: { user_id: string }) => m.user_id);
    }

    if (targetUserIds.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No users to notify" }),
        { headers: corsHeaders }
      );
    }

    // Fetch device tokens for the targets
    const { data: tokensData, error: tokErr } = await supabaseAdmin
      .from("device_tokens")
      .select("token")
      .in("user_id", targetUserIds);

    if (tokErr) throw tokErr;

    const tokens: string[] = (tokensData ?? []).map((t: { token: string }) => t.token).filter(Boolean);

    if (tokens.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No FCM tokens found for these users" }),
        { headers: corsHeaders }
      );
    }

    const firebaseApp = getFirebaseApp();
    const messaging = getMessaging(firebaseApp);

    const msgType = type || "alarm";
    const msgTitle = title || "⏰ Wakeit Alarm!";
    const msgBody  = body  || "Your group alarm is ringing. Wake up!";

    const fcmResponse = await messaging.sendEachForMulticast({
      tokens,
      notification: { title: msgTitle, body: msgBody },
      data: {
        type: msgType,
        alarm_id: String(alarm_id || ""),
      },
      android: {
        priority: "high",
        notification: {
          channelId: "wakeit-alarms",
          sound: "default",
          priority: "max",
        },
      },
      apns: {
        headers: { "apns-priority": "10" },
        payload: { aps: { contentAvailable: true, sound: "default", badge: 1 } },
      },
    });

    // Log any failed tokens for debugging
    const failures = fcmResponse.responses
      .map((r, i) => (!r.success ? { token: tokens[i], error: r.error?.message } : null))
      .filter(Boolean);

    return new Response(
      JSON.stringify({
        success: true,
        sent: tokens.length,
        successCount: fcmResponse.successCount,
        failureCount: fcmResponse.failureCount,
        failures,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[send-alarm-fcm] Error:", err);
    return new Response(
      JSON.stringify({ error: String(err instanceof Error ? err.message : err) }),
      { status: 400, headers: corsHeaders }
    );
  }
});
