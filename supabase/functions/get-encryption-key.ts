/// <reference lib="deno.ns" />
// deno-lint-ignore no-import-prefix
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
}

// Simple helper to get encryption key for client-side credential encryption
// In production, consider using Supabase Vault or a more secure method
serve((req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Get service role key as encryption key (first 32 chars)
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
    const encryptionKey = serviceKey.slice(0, 32)

    // NOTE: This is a simple implementation. In production:
    // 1. Use proper key management (AWS KMS, Azure Key Vault, etc.)
    // 2. Consider using Supabase Vault for secrets
    // 3. Never expose raw keys in production without proper authentication

    return new Response(
      JSON.stringify({
        key: encryptionKey,
        // Provide simple encrypt/decrypt functions for client use
        encrypt: `
          function encrypt(text, key) {
            let result = '';
            for (let i = 0; i < text.length; i++) {
              result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
            }
            return btoa(result);
          }
        `,
        decrypt: `
          function decrypt(encrypted, key) {
            const decoded = atob(encrypted);
            let result = '';
            for (let i = 0; i < decoded.length; i++) {
              result += String.fromCharCode(decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length));
            }
            return result;
          }
        `
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
