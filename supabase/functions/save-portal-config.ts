// deno-lint-ignore no-import-prefix
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// deno-lint-ignore no-import-prefix
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// Allowed origins for CORS - supports local dev and production
const getAllowedOrigins = (): string[] => {
  const envOrigins = Deno.env.get("ALLOWED_ORIGINS")
  if (envOrigins) {
    return envOrigins.split(",").map(o => o.trim()).filter(Boolean)
  }
  return [
    "http://localhost:5173",
    "https://mturesults.app",
    "https://www.mturesults.app",
  ]
}

const getCorsHeaders = (req: Request): Record<string, string> => {
  const allowedOrigins = getAllowedOrigins()
  const origin = req.headers.get("origin")
  const allowOrigin = origin && allowedOrigins.includes(origin) ? origin : null

  return {
    // Only echo back the Origin header if it is in the allowed list.
    // Do NOT fall back to allowedOrigins[0] for disallowed origins — that
    // sends a misleading ACAO header the browser will still block.
    ...(allowOrigin ? { "Access-Control-Allow-Origin": allowOrigin } : {}),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  }
}

// AES-256-GCM encryption using Web Crypto API (same as fetch-portal-data.ts)
const ALGORITHM = "AES-GCM"
const IV_LENGTH = 12
const TAG_LENGTH = 128

async function deriveKey(keyMaterial: string): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  const keyData = encoder.encode(keyMaterial)
  const hashBuffer = await crypto.subtle.digest("SHA-256", keyData)
  return await crypto.subtle.importKey(
    "raw",
    hashBuffer,
    { name: ALGORITHM },
    false,
    ["encrypt", "decrypt"]
  )
}

async function encrypt(plaintext: string | null, keyMaterial: string): Promise<string | null> {
  if (!plaintext) return null
  try {
    const key = await deriveKey(keyMaterial)
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
    const encoder = new TextEncoder()
    const data = encoder.encode(plaintext)

    const encrypted = await crypto.subtle.encrypt(
      { name: ALGORITHM, iv, tagLength: TAG_LENGTH },
      key,
      data
    )

    const combined = new Uint8Array(iv.length + new Uint8Array(encrypted).length)
    combined.set(iv)
    combined.set(new Uint8Array(encrypted), iv.length)

    return btoa(String.fromCharCode(...combined))
  } catch {
    return null
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) })
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    const encryptionKey = Deno.env.get("PORTAL_ENCRYPTION_KEY")

    if (!encryptionKey) {
      return new Response(JSON.stringify({ error: "PORTAL_ENCRYPTION_KEY not configured" }), {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      })
    }

    // Authenticate the caller — must be a valid, active admin
    const authHeader = req.headers.get("authorization")
    const userJwt = authHeader?.replace("Bearer ", "")

    if (!userJwt) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      })
    }

    const supabaseUserClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${userJwt}` } },
    })

    const { data: { user }, error: authError } = await supabaseUserClient.auth.getUser()

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      })
    }

    // Check caller is an active admin (server-side enforcement)
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const { data: staffRow, error: staffError } = await supabase
      .from("staff")
      .select("role, is_active")
      .eq("user_id", user.id)
      .maybeSingle()

    if (staffError || !staffRow || staffRow.role !== "admin" || !staffRow.is_active) {
      return new Response(JSON.stringify({ error: "Admin privileges required" }), {
        status: 403,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      })
    }

    const body = await req.json()
    const {
      base_url,
      api_endpoint,
      students_endpoint,
      api_key,
      sync_enabled,
      sync_interval_minutes,
      auto_dispatch_enabled,
      plaintext_username,
      plaintext_password,
      updated_at,
    } = body

    // Fetch existing config to preserve encrypted credentials if not changing them
    const { data: existingConfig } = await supabase
      .from("portal_config")
      .select("id, encrypted_username, encrypted_password")
      .maybeSingle()

    // Encrypt credentials server-side using AES-256-GCM
    const encryptedUsername = plaintext_username
      ? await encrypt(plaintext_username, encryptionKey)
      : existingConfig?.encrypted_username ?? null

    const encryptedPassword = plaintext_password
      ? await encrypt(plaintext_password, encryptionKey)
      : existingConfig?.encrypted_password ?? null

    const configData = {
      base_url,
      api_endpoint,
      students_endpoint,
      encrypted_username: encryptedUsername,
      encrypted_password: encryptedPassword,
      api_key: api_key || null,
      sync_enabled,
      sync_interval_minutes,
      auto_dispatch_enabled,
      updated_at: updated_at || new Date().toISOString(),
    }

    const { error: saveError } = existingConfig?.id
      ? await supabase.from("portal_config").update(configData).eq("id", existingConfig.id)
      : await supabase.from("portal_config").insert(configData)

    if (saveError) {
      throw new Error(`Failed to save config: ${saveError.message}`)
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    })
  } catch {
    return new Response(JSON.stringify({ error: "Failed to save portal configuration" }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    })
  }
})
