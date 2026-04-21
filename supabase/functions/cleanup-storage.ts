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
  // Default origins if not configured
  return [
    "http://localhost:5173",
    "https://mturesults.app",
    "https://www.mturesults.app",
  ]
}

const getCorsHeaders = (req: Request): Record<string, string> => {
  const allowedOrigins = getAllowedOrigins()
  const origin = req.headers.get("origin")
  
  // Allow requests with no origin (mobile apps, curl, etc.) or from allowed origins
  const allowOrigin = !origin || allowedOrigins.includes(origin) 
    ? (origin || allowedOrigins[0]) 
    : allowedOrigins[0]
  
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  }
}

interface CleanupRequest {
  studentId?: string
  pdfUrl?: string
  mode?: 'single' | 'orphaned'
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) })
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

    // Get user JWT from Authorization header
    const authHeader = req.headers.get("authorization")
    const userJwt = authHeader?.replace("Bearer ", "")

    if (!userJwt) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      })
    }

    // Validate user JWT by creating a client with it and checking the user
    const supabaseUserClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${userJwt}`,
        },
      },
    })

    // Verify the JWT is valid by getting the user
    const { data: { user }, error: authError } = await supabaseUserClient.auth.getUser()

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      })
    }

    // Use service role client for database operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { studentId, pdfUrl, mode = 'single' }: CleanupRequest = await req.json()

    const deletedFiles: string[] = []
    const errors: string[] = []

    if (mode === 'single' && pdfUrl) {
      // Delete a single PDF file
      const bucketPath = pdfUrl.split("/result_pdfs/")[1]
      if (bucketPath) {
        const { error } = await supabase.storage
          .from("result_pdfs")
          .remove([bucketPath])

        if (error) {
          errors.push(`Failed to delete ${bucketPath}: ${error.message}`)
        } else {
          deletedFiles.push(bucketPath)
        }
      }
    } else if (mode === 'single' && studentId) {
      // Delete PDFs for a specific student
      const { data: results } = await supabase
        .from("results")
        .select("pdf_url")
        .eq("student_id", studentId)

      if (results && results.length > 0) {
        for (const result of results) {
          if (result.pdf_url) {
            const bucketPath = result.pdf_url.split("/result_pdfs/")[1]
            if (bucketPath) {
              const { error } = await supabase.storage
                .from("result_pdfs")
                .remove([bucketPath])

              if (error) {
                errors.push(`Failed to delete ${bucketPath}: ${error.message}`)
              } else {
                deletedFiles.push(bucketPath)
              }
            }
          }
        }
      }
    } else if (mode === 'orphaned') {
      // List all files in storage and check against results
      const { data: files, error: listError } = await supabase.storage
        .from("result_pdfs")
        .list()

      if (listError) {
        throw new Error(`Failed to list storage: ${listError.message}`)
      }

      // Get all valid PDF URLs from results
      const { data: results } = await supabase
        .from("results")
        .select("pdf_url")
        .not("pdf_url", "is", null)

      const validPaths = new Set(
        (results || [])
          .map(r => r.pdf_url?.split("/result_pdfs/")[1])
          .filter(Boolean)
      )

      // Find orphaned files
      const orphanedFiles = (files || [])
        .filter(f => f.name !== '.emptyFolderPlaceholder')
        .map(f => f.name)
        .filter(name => !validPaths.has(name))

      // Delete orphaned files
      if (orphanedFiles.length > 0) {
        const { error } = await supabase.storage
          .from("result_pdfs")
          .remove(orphanedFiles)

        if (error) {
          errors.push(`Failed to delete orphaned files: ${error.message}`)
        } else {
          deletedFiles.push(...orphanedFiles)
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        deletedCount: deletedFiles.length,
        deletedFiles,
        errors: errors.length > 0 ? errors : undefined
      }),
      {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      }
    )
  } catch {
    return new Response(
      JSON.stringify({ error: "Cleanup failed" }),
      {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      }
    )
  }
})
