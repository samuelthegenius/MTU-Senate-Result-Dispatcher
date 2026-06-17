"use client"

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Shield, Lock, Mail, ArrowRight, Eye, EyeOff } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const { signIn, user } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()

  // Auto-redirect to dashboard if already logged in
  useEffect(() => {
    if (user) {
      navigate('/')
    }
  }, [user, navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const { error } = await signIn(email, password)

    if (error) {
      toast({
        title: 'Sign in failed',
        description: error.message,
        variant: 'destructive',
      })
      setLoading(false)
    } else {
      toast({
        title: 'Welcome back!',
        description: 'You have successfully signed in.',
        variant: 'success',
      })
      navigate('/')
      // Don't set loading false here - let the auth state change handle it
    }
  }

  return (
    <div className="min-h-screen flex bg-white lg:bg-slate-50">
      {/* Left Panel - Branding (hidden on mobile) */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-5/12 bg-gradient-to-br from-mtu-green via-mtu-green to-mtu-green-dark relative overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-mtu-purple/20 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-mtu-gold/20 rounded-full translate-y-1/2 -translate-x-1/2" />
        <div className="absolute top-1/2 left-1/2 w-32 h-32 bg-white/5 rounded-full -translate-x-1/2 -translate-y-1/2" />

        <div className="relative z-10 flex flex-col justify-center px-16 py-12 w-full">
          {/* Logo */}
          <div className="mb-8">
            <img
              src="/mtulogo.jpg"
              alt="Mountain Top University"
              className="h-32 w-auto object-contain drop-shadow-lg"
            />
          </div>

          <h1 className="text-4xl xl:text-5xl font-bold text-white leading-tight mb-6">
            MTU Senate Result Dispatch
          </h1>

          <p className="text-white/80 text-lg mb-8 max-w-md">
            Upload, approve, and dispatch student result statements to parents via Email, WhatsApp, and Telegram
          </p>

          <div className="flex items-center gap-3 text-white/70">
            <Shield className="h-5 w-5" />
            <span className="text-sm">Secure institutional access</span>
          </div>

          <div className="mt-auto pt-12">
            <p className="text-white/60 italic text-sm">
              "Empowered to Excel"
            </p>
          </div>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="flex-1 flex flex-col justify-center items-center p-6 lg:p-12">
        {/* Mobile Logo */}
        <div className="lg:hidden mb-8 text-center">
          <img
            src="/mtulogo.jpg"
            alt="Mountain Top University"
            className="h-24 w-auto object-contain mx-auto mb-4"
          />
          <p className="text-sm text-slate-500">Result Dispatch Portal</p>
        </div>

        <Card className="w-full max-w-md border-slate-200 shadow-lg lg:shadow-xl">
          <CardHeader className="space-y-1 pb-6">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 bg-mtu-green-50 rounded-md">
                <Lock className="h-4 w-4 text-mtu-green" />
              </div>
              <span className="text-xs font-semibold text-mtu-green uppercase tracking-wider">
                Result Dispatch
              </span>
            </div>
            <CardTitle className="text-2xl font-bold text-slate-900">
              Welcome Back
            </CardTitle>
            <CardDescription className="text-slate-500">
              Sign in with your institutional email
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">

              <div className="space-y-2">
                <Label htmlFor="email" className="text-slate-700 font-medium flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5 text-slate-400" />
                  Email Address
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="staff@mtu.edu.ng"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-11 border-slate-200 focus:border-mtu-green focus:ring-mtu-green/20"
                />
                <p className="text-xs text-slate-400">
                  Only @mtu.edu.ng emails are permitted
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-slate-700 font-medium flex items-center gap-2">
                  <Lock className="h-3.5 w-3.5 text-slate-400" />
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="h-11 pr-11 border-slate-200 focus:border-mtu-green focus:ring-mtu-green/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-11 bg-mtu-green hover:bg-mtu-green-dark text-white font-semibold shadow-md hover:shadow-lg transition-all"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Signing in...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    Sign In
                    <ArrowRight className="h-4 w-4" />
                  </span>
                )}
              </Button>
            </form>

            <div className="mt-6 pt-6 border-t border-slate-100 text-center">
              <p className="text-sm text-slate-500">
                Contact administrator for account access
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-xs text-slate-400">
            MTU Senate Result Dispatch System &copy; 2026
          </p>
          <p className="text-[10px] text-slate-300 mt-1">
            "Empowered to Excel"
          </p>
        </div>
      </div>
    </div>
  )
}