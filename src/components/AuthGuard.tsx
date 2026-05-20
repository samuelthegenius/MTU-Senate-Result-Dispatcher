"use client"

import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

interface AuthGuardProps {
  children: ReactNode
  requireAdmin?: boolean
}

export function AuthGuard({ children, requireAdmin = false }: AuthGuardProps) {
  const { user, isActive, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
      </div>
    )
  }

  // Not logged in at all
  if (!user) {
    return <Navigate to="/login" replace />
  }

  // Logged in but account is deactivated
  if (!isActive) {
    return <Navigate to="/login" replace />
  }

  // Admin-only route but user is not admin
  if (requireAdmin && user.user_metadata?.role !== 'admin') {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}