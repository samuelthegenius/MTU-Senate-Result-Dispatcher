"use client"

import React from 'react'
import { useState, useEffect, createContext, useContext, type ReactNode } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase, hasSupabase } from '@/lib/supabase'

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const lastFetchedUserId = React.useRef<string | null>(null)
  const hasInitialized = React.useRef(false)
  const pendingRoleFetch = React.useRef<Promise<{ role: string, is_active: boolean, full_name: string | null } | null> | null>(null)

  // Helper to fetch staff data with retry logic and deduplication
  const fetchStaffData = async (userId: string, retryCount = 0): Promise<{ role: string, is_active: boolean, full_name: string | null } | null> => {
    // Return existing pending request if one exists for this user
    if (pendingRoleFetch.current && retryCount === 0) {
      console.log('[Auth] Reusing pending staff data fetch')
      return pendingRoleFetch.current
    }

    console.log('[Auth] fetchStaffData called for userId:', userId, 'retry:', retryCount)

    const doFetch = async (): Promise<{ role: string, is_active: boolean, full_name: string | null } | null> => {
      try {
        // Small delay to ensure auth state is synced
        if (retryCount === 0) {
          await new Promise(resolve => setTimeout(resolve, 100))
        }

        const { data: staffData, error } = await supabase
          .from('staff')
          .select('role, is_active, full_name')
          .eq('user_id', userId)
          .maybeSingle()

        console.log('[Auth] staff query result:', { staffData, error: error?.code || error?.message || null })

        if (error) {
          // Retry on 500 errors up to 2 times
          if ((error.code === '500' || error.message?.includes('500')) && retryCount < 2) {
            console.log('[Auth] Retrying staff query after 500 error...')
            await new Promise(resolve => setTimeout(resolve, 500))
            return fetchStaffData(userId, retryCount + 1)
          }
          console.error('[Auth] Staff query error:', error)
          return null
        }

        if (staffData) {
          console.log('[Auth] Found staff record:', staffData)
          return { role: staffData.role, is_active: staffData.is_active, full_name: staffData.full_name }
        }
      } catch (error: any) {
        console.error('[Auth] Error fetching staff role:', error)
        // Retry on network errors up to 2 times
        if (retryCount < 2) {
          console.log('[Auth] Retrying after error...')
          await new Promise(resolve => setTimeout(resolve, 500))
          return fetchStaffData(userId, retryCount + 1)
        }
      }
      console.log('[Auth] No staff record found for userId:', userId)
      return null
    }

    // Store the promise for deduplication
    if (retryCount === 0) {
      pendingRoleFetch.current = doFetch()
      const result = await pendingRoleFetch.current
      pendingRoleFetch.current = null
      return result
    }

    return doFetch()
  }

  useEffect(() => {
    // Prevent double initialization in React StrictMode
    if (hasInitialized.current) {
      console.log('[Auth] Already initialized, skipping')
      return
    }

    const initAuth = async () => {
      console.log('[Auth] useEffect started, hasSupabase:', hasSupabase())
      hasInitialized.current = true
      
      // Safety timeout - force loading to false after 10 seconds max (must exceed getSession timeout)
      const safetyTimeout = setTimeout(() => {
        console.log('[Auth] Safety timeout triggered')
        setLoading(false)
      }, 10000)

      if (!hasSupabase()) {
        console.log('[Auth] No Supabase config, setting loading false')
        clearTimeout(safetyTimeout)
        setLoading(false)
        return
      }

      let mounted = true

      try {
        // Add timeout for getSession since it can hang (must be > Supabase's 5000ms lock timeout)
        const getSessionWithTimeout = async (attempt = 1): Promise<{ data: { session: any }, error: any }> => {
          const getSessionPromise = supabase.auth.getSession()
          const getSessionTimeout = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('getSession timeout')), 8000)
          )
          
          try {
            return await Promise.race([getSessionPromise, getSessionTimeout]) as { data: { session: any }, error: any }
          } catch (err: any) {
            // Retry once on lock contention errors
            if (attempt === 1 && err?.message?.includes('timeout')) {
              console.log('[Auth] getSession timed out, retrying once after lock contention...')
              await new Promise(r => setTimeout(r, 1000))
              return getSessionWithTimeout(attempt + 1)
            }
            throw err
          }
        }
        
        const sessionResult = await getSessionWithTimeout()
        
        const { data: { session }, error } = sessionResult
        console.log('[Auth] getSession result:', { session: !!session, error })
        if (!mounted) return
        
        if (error) {
          console.error('[Auth] getSession error:', error)
        }
        
        setSession(session)
        const sessionUser = session?.user ?? null

        // If we have a user and haven't fetched their data yet
        if (sessionUser && lastFetchedUserId.current !== sessionUser.id) {
          console.log('[Auth] Fetching staff data for user:', sessionUser.id)
          const staffData = await fetchStaffData(sessionUser.id)
          console.log('[Auth] Staff data:', staffData)
          if (staffData) {
            lastFetchedUserId.current = sessionUser.id
            setUser({
              ...sessionUser,
              user_metadata: {
                ...sessionUser.user_metadata,
                role: staffData.role,
                is_active: staffData.is_active,
                full_name: staffData.full_name
              }
            } as User)
          } else {
            setUser(sessionUser)
          }
        } else {
          setUser(sessionUser)
        }

        clearTimeout(safetyTimeout)
        setLoading(false)
        console.log('[Auth] Initial load complete, loading set to false')
      } catch (err) {
        console.error('[Auth] getSession error:', err)
        clearTimeout(safetyTimeout)
        if (mounted) {
          setUser(null)
          setSession(null)
          setLoading(false)
        }
      }

      // Listen for auth state changes
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
        console.log('[Auth] Auth state changed:', _event, !!session)
        if (!mounted) return
        
        setSession(session)
        const sessionUser = session?.user ?? null

        if (!sessionUser) {
          // User logged out - reset the flag
          lastFetchedUserId.current = null
          setUser(null)
        } else if (lastFetchedUserId.current !== sessionUser.id) {
          // New user logged in - fetch their staff data
          const staffData = await fetchStaffData(sessionUser.id)
          if (staffData) {
            lastFetchedUserId.current = sessionUser.id
            setUser({
              ...sessionUser,
              user_metadata: {
                ...sessionUser.user_metadata,
                role: staffData.role,
                is_active: staffData.is_active,
                full_name: staffData.full_name
              }
            } as User)
          } else {
            setUser(sessionUser)
          }
        }
      })

      return () => {
        console.log('[Auth] Cleanup')
        mounted = false
        clearTimeout(safetyTimeout)
        subscription.unsubscribe()
      }
    }

    initAuth()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const signIn = async (email: string, password: string) => {
    console.log('[Auth] signIn called')
    if (!hasSupabase()) {
      console.error('[Auth] Supabase not configured')
      return { error: new Error('Supabase not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file.') }
    }

    const trimmedEmail = email.trim().toLowerCase()
    const trimmedPassword = password.trim()

    const emailDomain = trimmedEmail.split('@')[1]
    if (emailDomain !== 'mtu.edu.ng') {
      console.error('[Auth] Invalid domain:', emailDomain)
      return { error: new Error('Only @mtu.edu.ng emails are allowed to sign in.') }
    }

    console.log('[Auth] Calling supabase.auth.signInWithPassword...')

    const { data, error } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password: trimmedPassword
    })
    console.log('[Auth] signInWithPassword result:', { hasData: !!data, hasUser: !!data?.user, error: error?.message || null })
    
    if (error) {
      console.error('[Auth] Sign in error:', error.message)
      if (error.message.includes('Invalid login credentials')) {
        return { error: new Error('Invalid email or password. Please check your credentials.') }
      }
      if (error.message.includes('Email not confirmed')) {
        return { error: new Error('Please verify your email before signing in.') }
      }
      return { error: new Error(error.message) }
    }
    
    if (!data.user) {
      console.error('[Auth] No user data returned')
      return { error: new Error('Login failed. User account not found.') }
    }
    
    console.log('[Auth] Sign in successful, user:', data.user.id)
    return { error: null }
  }

  const signOut = async () => {
    if (!hasSupabase()) return
    await supabase.auth.signOut()
  }

  return (
    /* @__PURE__ */ React.createElement(AuthContext.Provider, { value: { user, session, loading, signIn, signOut } }, children)
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}