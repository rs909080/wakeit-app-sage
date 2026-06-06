import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: { user } } = await supabaseClient.auth.getUser()
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 })
    }

    const { data: profile, error } = await supabaseClient.from('profiles').select('plan_type, plan_expires_at, plan_started_at, created_at').eq('id', user.id).single()
    if (error || !profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 })
    }

    const now = new Date()
    let expiresAt = profile.plan_expires_at ? new Date(profile.plan_expires_at) : null
    
    // For paid plans without expiry, or free_trial with valid expiry
    // If expiresAt is null, we assume it's active unless it's explicitly 'free_trial' which might require an expiry (but usually has one set now).
    let isExpired = false;
    
    if (profile.plan_type === 'free_trial') {
      // If free_trial has no explicit expiry, calculate 3 days from start
      if (!expiresAt) {
        const start = profile.plan_started_at ? new Date(profile.plan_started_at) : (profile.created_at ? new Date(profile.created_at) : now);
        expiresAt = new Date(start.getTime() + 3 * 24 * 60 * 60 * 1000);
      }
      isExpired = now > expiresAt;
    } else if (profile.plan_type === 'none' || !profile.plan_type) {
      isExpired = true; 
    } else {
      // Paid plan
      if (expiresAt) {
        isExpired = now > expiresAt;
      } else {
        isExpired = false; // Paid plans without expiry never expire
      }
    }

    return new Response(JSON.stringify({
      plan_type: profile.plan_type,
      is_active: !isExpired,
      expired_at: expiresAt
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })
  }
})
