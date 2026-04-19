import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

interface CleanupRequest {
  studentId?: string
  pdfUrl?: string
  mode?: 'single' | 'orphaned'
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
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
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    )
  } catch (error: any) {
    console.error("[cleanup-storage] Error:", error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    )
  }
})
