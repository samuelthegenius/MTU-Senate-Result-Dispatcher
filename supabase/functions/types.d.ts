// Type declarations for Deno Edge Functions
// Provides just enough type info to keep VS Code's TypeScript server happy.
// At runtime, all types are provided natively by the Deno runtime.

/** Minimal Deno namespace stub for VS Code IntelliSense. */
declare namespace Deno {
  export interface Env {
    get(key: string): string | undefined;
  }
  export const env: Env;
}

// Ambient module stubs for Deno URL-style imports.
// VS Code's Node-based TS server cannot resolve these; the stubs silence the errors.

declare module "https://deno.land/std@0.168.0/http/server.ts" {
  export type Handler = (req: Request) => Response | Promise<Response>;
  export function serve(handler: Handler): void;
}

declare module "https://esm.sh/@supabase/supabase-js@2" {
  export * from "@supabase/supabase-js";
}
