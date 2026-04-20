/// <reference lib="deno.ns" />
// deno-lint-ignore no-import-prefix
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// deno-lint-ignore no-import-prefix
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

// Cron-compatible scheduled sync function
// This can be triggered by:
// 1. pg_cron schedule
// 2. External cron service
// 3. Manual invocation from UI
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Verify this is a scheduled call or authorized manual trigger
    const authHeader = req.headers.get("authorization")
    const cronSecret = req.headers.get("x-cron-secret")
    const expectedCronSecret = Deno.env.get("CRON_SECRET")

    // Allow if:
    // 1. Valid cron secret is provided (for external cron services)
    // 2. Service role key is provided (for internal/supabase cron)
    // 3. Request is from Supabase cron (can be identified by specific headers)
    const isSupabaseCron = req.headers.get("user-agent")?.includes("supabase") ||
                          (authHeader?.includes(supabaseServiceKey.slice(0, 10)) ?? false)
    const hasValidCronSecret = expectedCronSecret && cronSecret === expectedCronSecret

    if (!isSupabaseCron && !hasValidCronSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // Get portal configuration
    const { data: config, error: configError } = await supabase
      .from("portal_config")
      .select("*")
      .single()

    if (configError || !config) {
      return new Response(JSON.stringify({ error: "Portal configuration not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    if (!config.sync_enabled) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: "Portal sync is disabled, skipping",
        skipped: true 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // Check if sync interval has passed
    const lastSync = config.last_sync_at ? new Date(config.last_sync_at) : null
    const now = new Date()
    const intervalMs = (config.sync_interval_minutes || 60) * 60 * 1000

    if (lastSync && (now.getTime() - lastSync.getTime()) < intervalMs) {
      const minutesRemaining = Math.ceil((intervalMs - (now.getTime() - lastSync.getTime())) / 60000)
      return new Response(JSON.stringify({
        success: true,
        message: `Sync interval not elapsed. Next sync in ${minutesRemaining} minutes`,
        skipped: true,
        nextSyncIn: minutesRemaining,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // Check if there's already a running sync
    if (config.last_sync_status === "running") {
      // Check if it's been running for more than 30 minutes (stuck)
      if (lastSync && (now.getTime() - lastSync.getTime()) > 30 * 60 * 1000) {
        console.warn("[scheduled-portal-sync] Previous sync appears stuck, proceeding anyway")
      } else {
        return new Response(JSON.stringify({
          success: true,
          message: "A sync is already running",
          skipped: true,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }
    }

    // Parse request body for optional filters
    const body = await req.json().catch(() => ({}))
    const { level, semester, session } = body

    // Invoke the fetch-portal-data function
    const response = await fetch(`${supabaseUrl}/functions/v1/fetch-portal-data`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({ level, semester, session }),
    })

    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.error || `Sync failed with status ${response.status}`)
    }

    // Send notification if new results were found and dispatched
    if (result.stats?.newResults > 0 || result.stats?.dispatched > 0) {
      console.log(`[scheduled-portal-sync] Sync completed: ${result.stats.newResults} new results, ${result.stats.dispatched} dispatched`)

      // TODO: Send notification to admin (email, slack, etc.)
      // This could be implemented based on admin preferences
    }

    return new Response(JSON.stringify({
      success: true,
      message: "Scheduled sync completed",
      result,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error("[scheduled-portal-sync] Error:", error)

    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
