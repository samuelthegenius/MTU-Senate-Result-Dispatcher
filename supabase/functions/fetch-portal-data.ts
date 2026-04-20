/// <reference lib="deno.ns" />
// deno-lint-ignore no-import-prefix
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// deno-lint-ignore no-import-prefix
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

interface PortalConfig {
  id: string
  base_url: string
  api_endpoint: string
  encrypted_username?: string
  encrypted_password?: string
  api_key?: string
  sync_enabled: boolean
  auto_dispatch_enabled: boolean
}

interface PortalStudent {
  matric_no: string
  full_name: string
  programme?: string
  level?: number
}

interface PortalResult {
  matric_no: string
  pdf_url: string
  level: number
  semester: number
  session: string
  cgpa?: number
  portal_result_id: string
}

interface SyncStats {
  studentsFetched: number
  resultsFetched: number
  newResults: number
  dispatched: number
  errors: string[]
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

// Simple XOR encryption for basic credential protection
// In production, use proper encryption or store in Supabase Vault
function decrypt(encrypted: string | null, key: string): string | null {
  if (!encrypted) return null
  try {
    const decoded = atob(encrypted)
    let result = ''
    for (let i = 0; i < decoded.length; i++) {
      result += String.fromCharCode(decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length))
    }
    return result
  } catch {
    return null
  }
}

// Fetch authentication token from MTU portal
async function authenticateWithPortal(config: PortalConfig, encryptionKey: string): Promise<string | null> {
  const username = decrypt(config.encrypted_username ?? null, encryptionKey)
  const password = decrypt(config.encrypted_password ?? null, encryptionKey)

  if (!username || !password) {
    throw new Error("Portal credentials not configured")
  }

  // TODO: Customize this based on actual MTU portal authentication
  // This is a template - actual implementation depends on portal API structure
  const authUrl = `${config.base_url}/api/auth/login`

  try {
    const response = await fetch(authUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.api_key ? { "X-API-Key": config.api_key } : {}),
      },
      body: JSON.stringify({
        username,
        password,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Portal authentication failed: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    // TODO: Customize based on actual response structure
    return data.token || data.access_token || data.data?.token
  } catch (error) {
    console.error("[fetch-portal] Authentication error:", error)
    throw error
  }
}

// Fetch students from portal
async function fetchStudentsFromPortal(
  config: PortalConfig,
  token: string,
  level?: number,
  session?: string
): Promise<PortalStudent[]> {
  // TODO: Customize this based on actual MTU portal API
  const url = new URL(`${config.base_url}/api/students`)
  if (level) url.searchParams.append("level", level.toString())
  if (session) url.searchParams.append("session", session)

  const response = await fetch(url.toString(), {
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(config.api_key ? { "X-API-Key": config.api_key } : {}),
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch students: ${response.status}`)
  }

  const data = await response.json()
  // TODO: Customize based on actual response structure
  return data.students || data.data || data || []
}

// Fetch results from portal
async function fetchResultsFromPortal(
  config: PortalConfig,
  token: string,
  level?: number,
  semester?: number,
  session?: string
): Promise<PortalResult[]> {
  // TODO: Customize this based on actual MTU portal API
  const url = new URL(`${config.base_url}${config.api_endpoint}`)
  if (level) url.searchParams.append("level", level.toString())
  if (semester) url.searchParams.append("semester", semester.toString())
  if (session) url.searchParams.append("session", session)

  // Only fetch senate-approved results
  url.searchParams.append("senate_approved", "true")

  const response = await fetch(url.toString(), {
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(config.api_key ? { "X-API-Key": config.api_key } : {}),
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch results: ${response.status}`)
  }

  const data = await response.json()
  // TODO: Customize based on actual response structure
  return data.results || data.data || data || []
}

// Download PDF from portal and upload to Supabase Storage
async function downloadAndStorePdf(
  supabase: ReturnType<typeof createClient>,
  pdfUrl: string,
  matricNo: string,
  token: string,
  config: PortalConfig
): Promise<string | null> {
  try {
    // Download PDF from portal
    const response = await fetch(pdfUrl, {
      headers: {
        "Authorization": `Bearer ${token}`,
        ...(config.api_key ? { "X-API-Key": config.api_key } : {}),
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to download PDF: ${response.status}`)
    }

    const pdfBuffer = await response.arrayBuffer()
    const fileName = `${matricNo}_${Date.now()}.pdf`
    const filePath = `portal/${fileName}`

    // Upload to Supabase Storage
    const { data: _uploadData, error: uploadError } = await supabase.storage
      .from("result_pdfs")
      .upload(filePath, pdfBuffer, {
        contentType: "application/pdf",
        upsert: false,
      })

    if (uploadError) {
      throw new Error(`Failed to upload PDF: ${uploadError.message}`)
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("result_pdfs")
      .getPublicUrl(filePath)

    return urlData.publicUrl
  } catch (error) {
    console.error(`[fetch-portal] Error downloading PDF for ${matricNo}:`, error)
    return null
  }
}

// Trigger dispatch for a result
async function triggerDispatch(
  supabase: ReturnType<typeof createClient>,
  resultId: string
): Promise<boolean> {
  try {
    // Check if net schema exists
    let netCheck: { exists: boolean }[] | null = null
    try {
      // deno-lint-ignore no-explicit-any
      const { data } = await (supabase.rpc as any)("pg_execute", {
        query: "SELECT EXISTS(SELECT 1 FROM information_schema.schemata WHERE schema_name = 'net') as exists"
      })
      netCheck = data as { exists: boolean }[] | null
    } catch {
      netCheck = [{ exists: false }]
    }

    const netExists = netCheck?.[0]?.exists ?? false

    if (netExists) {
      // Use pg_net for async dispatch
      // deno-lint-ignore no-explicit-any
      await (supabase.rpc as any)("invoke_dispatch", { result_id: resultId })
    } else {
      // Fallback: call the edge function directly
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

      await fetch(`${supabaseUrl}/functions/v1/process-dispatch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ resultId }),
      })
    }

    return true
  } catch (error) {
    console.error(`[fetch-portal] Failed to trigger dispatch for ${resultId}:`, error)
    return false
  }
}

// Main sync function
async function performPortalSync(
  supabase: ReturnType<typeof createClient>,
  config: PortalConfig,
  encryptionKey: string,
  options: { level?: number; semester?: number; session?: string }
): Promise<SyncStats> {
  const stats: SyncStats = {
    studentsFetched: 0,
    resultsFetched: 0,
    newResults: 0,
    dispatched: 0,
    errors: [],
  }

  // Authenticate with portal
  const token = await authenticateWithPortal(config, encryptionKey)
  if (!token) {
    throw new Error("Failed to authenticate with MTU portal")
  }

  // Fetch students
  const students = await fetchStudentsFromPortal(config, token, options.level, options.session)
  stats.studentsFetched = students.length

  // Upsert students to database
  for (const student of students) {
    try {
      // deno-lint-ignore no-explicit-any
      const { error } = await (supabase.from as any)("students").upsert(
        {
          matric_no: student.matric_no,
          full_name: student.full_name,
          programme: student.programme,
          level: student.level,
        },
        { onConflict: "matric_no" }
      )

      if (error) {
        stats.errors.push(`Student ${student.matric_no}: ${error.message}`)
      }
    } catch (error) {
      stats.errors.push(`Student ${student.matric_no}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // Fetch results
  const results = await fetchResultsFromPortal(
    config,
    token,
    options.level,
    options.semester,
    options.session
  )
  stats.resultsFetched = results.length

  // Get student IDs for linking results
  const { data: dbStudents } = await supabase
    .from("students")
    .select("id, matric_no")

  type StudentRow = { id: string; matric_no: string }
  const studentMap = new Map((dbStudents as StudentRow[] | null)?.map(s => [s.matric_no, s.id]) || [])

  // Process each result
  for (const result of results) {
    try {
      const studentId = studentMap.get(result.matric_no)
      if (!studentId) {
        stats.errors.push(`Result ${result.portal_result_id}: Student ${result.matric_no} not found`)
        continue
      }

      // Check if result already exists
      const { data: existingResult } = await supabase
        .from("results")
        .select("id")
        .eq("portal_result_id", result.portal_result_id)
        .maybeSingle()

      if (existingResult) {
        // Result already exists, skip
        continue
      }

      // Download and store PDF
      const pdfUrl = await downloadAndStorePdf(supabase, result.pdf_url, result.matric_no, token, config)

      if (!pdfUrl) {
        stats.errors.push(`Result ${result.portal_result_id}: Failed to download PDF`)
        continue
      }

      // Insert result as senate-approved (since it comes from portal)
      // deno-lint-ignore no-explicit-any
      const { data: newResult, error: insertError } = await (supabase.from as any)("results")
        .insert({
          student_id: studentId,
          pdf_url: pdfUrl,
          level: result.level,
          semester: result.semester,
          is_senate_approved: true, // Portal results are already senate approved
          source: "portal",
          portal_result_id: result.portal_result_id,
          portal_fetched_at: new Date().toISOString(),
        })
        .select("id")
        .single()

      if (insertError) {
        stats.errors.push(`Result ${result.portal_result_id}: ${insertError.message}`)
        continue
      }

      stats.newResults++

      // Auto-dispatch if enabled
      type ResultRow = { id: string }
      const resultRowId = (newResult as ResultRow | null)?.id
      if (config.auto_dispatch_enabled && resultRowId) {
        const dispatched = await triggerDispatch(supabase, resultRowId)
        if (dispatched) {
          stats.dispatched++
          // Update dispatch timestamp
          // deno-lint-ignore no-explicit-any
          await (supabase.from as any)("results")
            .update({ auto_dispatched_at: new Date().toISOString() })
            .eq("id", resultRowId)
        }
      }
    } catch (error) {
      stats.errors.push(`Result ${result.portal_result_id}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return stats
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    const encryptionKey = Deno.env.get("PORTAL_ENCRYPTION_KEY") || supabaseServiceKey.slice(0, 32)

    // Get user JWT from Authorization header
    const authHeader = req.headers.get("authorization")
    const userJwt = authHeader?.replace("Bearer ", "")

    if (!userJwt) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // Validate user
    const supabaseUserClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${userJwt}` } },
    })

    const { data: { user }, error: authError } = await supabaseUserClient.auth.getUser()

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // Use service role client for database operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Parse request body
    const body = await req.json().catch(() => ({}))
    const { level, semester, session, syncId } = body

    // Get portal configuration
    const { data: config, error: configError } = await supabase
      .from("portal_config")
      .select("*")
      .single()

    if (configError || !config) {
      throw new Error("Portal configuration not found")
    }

    if (!config.sync_enabled) {
      throw new Error("Portal sync is disabled")
    }

    // Update sync status to running
    const { error: updateError } = await supabase
      .from("portal_config")
      .update({
        last_sync_status: "running",
        last_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", config.id)

    if (updateError) {
      console.error("[fetch-portal] Failed to update sync status:", updateError)
    }

    // Create or use provided sync log
    let syncLogId = syncId
    if (!syncLogId) {
      const { data: syncLog, error: syncLogError } = await supabase
        .from("portal_sync_logs")
        .insert({
          status: "running",
          started_at: new Date().toISOString(),
        })
        .select("id")
        .single()

      if (syncLogError) {
        console.error("[fetch-portal] Failed to create sync log:", syncLogError)
      } else {
        syncLogId = syncLog?.id
      }
    }

    // Perform the sync
    // deno-lint-ignore no-explicit-any
    const stats = await performPortalSync((supabase as any), config, encryptionKey, {
      level,
      semester,
      session,
    })

    // Determine overall status
    const status: "success" | "partial" | "error" =
      stats.errors.length === 0 ? "success" :
      stats.newResults > 0 || stats.dispatched > 0 ? "partial" :
      "error"

    // Update sync log
    if (syncLogId) {
      await supabase
        .from("portal_sync_logs")
        .update({
          status,
          completed_at: new Date().toISOString(),
          students_fetched: stats.studentsFetched,
          results_fetched: stats.resultsFetched,
          results_new: stats.newResults,
          results_dispatched: stats.dispatched,
          errors: stats.errors.join("; ") || null,
        })
        .eq("id", syncLogId)
    }

    // Update portal config with last sync info
    await supabase
      .from("portal_config")
      .update({
        last_sync_status: status,
        last_sync_message: stats.errors.length > 0 ? `${stats.errors.length} errors occurred` : "Sync completed successfully",
        updated_at: new Date().toISOString(),
      })
      .eq("id", config.id)

    return new Response(
      JSON.stringify({
        success: status !== "error",
        status,
        stats,
        syncId: syncLogId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error("[fetch-portal] Error:", error)

    // Try to update sync status if we have a config
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      const supabase = createClient(supabaseUrl, supabaseServiceKey)

      await supabase
        .from("portal_config")
        .update({
          last_sync_status: "error",
          last_sync_message: errorMessage,
          updated_at: new Date().toISOString(),
        })
        .eq("id", (await supabase.from("portal_config").select("id").single()).data?.id)
    } catch {
      // Ignore errors in error handling
    }

    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
