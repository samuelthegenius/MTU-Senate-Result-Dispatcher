import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

let supabaseClient: SupabaseClient | null = null

if (supabaseUrl && supabaseAnonKey) {
  supabaseClient = createClient(supabaseUrl, supabaseAnonKey)
}

export const hasSupabase = () => Boolean(supabaseUrl && supabaseAnonKey)

export const getSupabase = () => {
  if (!supabaseClient) {
    throw new Error('Supabase not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file.')
  }
  return supabaseClient
}

export const supabase = supabaseClient ?? {
  auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    signInWithPassword: async () => ({ data: null, error: new Error('Supabase not configured') }),
    signOut: async () => ({ error: null }),
  },
  from: () => ({
    select: () => ({ eq: () => ({ order: () => ({ data: null, error: new Error('Supabase not configured') }) }) }),
    insert: async () => ({ data: null, error: new Error('Supabase not configured') }),
    update: () => ({ eq: () => ({ then: () => ({ data: null, error: new Error('Supabase not configured') }) }) }),
    upsert: async () => ({ data: null, error: new Error('Supabase not configured') }),
  }),
  storage: {
    from: () => ({
      upload: async () => ({ data: null, error: new Error('Supabase not configured') }),
      getPublicUrl: () => ({ data: { publicUrl: '' } }),
      createSignedUrl: async () => ({ data: null, error: new Error('Supabase not configured') }),
    }),
  },
  functions: {
    invoke: async () => ({ data: null, error: new Error('Supabase not configured') }),
  },
} as unknown as SupabaseClient