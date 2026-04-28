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
    const { user_id, group_name, alarm_id, custom_heading, custom_body } = await req.json();

    if (!user_id) throw new Error("Missing user_id");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Fetch FCM tokens for the user
    const { data: tokensData, error: tokErr } = await supabaseAdmin
      .from("device_tokens")
      .select("token")
      .eq("user_id", user_id);

    if (tokErr) throw tokErr;

    const tokens: string[] = (tokensData ?? [])
      .map((t: { token: string }) => t.token)
      .filter(Boolean);

    if (tokens.length === 0) {
      return new Response(
        JSON.stringify({ success: false, message: "No FCM tokens found for this user" }),
        { headers: corsHeaders }
      );
    }

    const firebaseApp = getFirebaseApp();
    const messaging = getMessaging(firebaseApp);

    const heading = custom_heading || "🔔 Wake up!";
    const body = custom_body || `Your group "${group_name || "Wakeit"}" is nudging you!`;

    const fcmResponse = await messaging.sendEachForMulticast({
      tokens,
      notification: { title: heading, body },
      data: {
        type: "nudge",
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
        payload: { aps: { sound: "default", badge: 1 } },
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        sent: tokens.length,
        successCount: fcmResponse.successCount,
        failureCount: fcmResponse.failureCount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[nudge-member] Error:", error);
    return new Response(
      JSON.stringify({ error: String(error instanceof Error ? error.message : error) }),
      { status: 400, headers: corsHeaders }
    );
  }
});
