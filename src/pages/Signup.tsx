"use client"

import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Loader2, CheckCircle2, UserPlus, ArrowRight } from 'lucide-react'

export default function SignupPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const navigate = useNavigate()

  // Redirect to login if no invitation token
  useEffect(() => {
    if (!token) {
      navigate('/login', { replace: true })
    }
  }, [token, navigate])

  // Show nothing while redirecting
  if (!token) {
    return null
  }

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const { toast } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    if (!token) {
      toast({
        title: 'Invalid invitation',
        description: 'Please contact your administrator.',
        variant: 'destructive',
      })
      setLoading(false)
      return
    }

    const emailDomain = email.split('@')[1]
    if (emailDomain !== 'mtu.edu.ng') {
      toast({
        title: 'Invalid email',
        description: 'Only @mtu.edu.ng emails are allowed.',
        variant: 'destructive',
      })
      setLoading(false)
      return
    }

    try {
      const { data: inviteData, error: inviteError } = await supabase
        .from('invites')
        .select('*')
        .eq('token', token)
        .eq('email', email)
        .gt('expires_at', new Date().toISOString())
        .is('used_at', null)
        .single()

      if (inviteError || !inviteData) {
        toast({
          title: 'Invalid invitation',
          description: 'The invitation token is invalid or has expired.',
          variant: 'destructive',
        })
        setLoading(false)
        return
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/login`,
        },
      })

      if (signUpError) {
        toast({
          title: 'Sign up failed',
          description: signUpError.message,
          variant: 'destructive',
        })
        setLoading(false)
        return
      }

      if (data.user) {
        await supabase.from('staff').insert({
          user_id: data.user.id,
          email,
          full_name: fullName,
          role: inviteData.role,
        })

        await supabase
          .from('invites')
          .update({ used_at: new Date().toISOString() })
          .eq('id', inviteData.id)
      }

      setSuccess(true)
      toast({
        title: 'Account created!',
        description: 'Your staff account has been successfully activated.',
        variant: 'success',
      })
      setLoading(false)
    } catch (err) {
      toast({
        title: 'Error',
        description: 'An unexpected error occurred.',
        variant: 'destructive',
      })
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-md border-mtu-green-100">
          <CardContent className="pt-6 text-center">
            <div className="w-20 h-20 rounded-full bg-mtu-green-50 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="h-10 w-10 text-mtu-green" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Account Created!</h2>
            <p className="text-slate-600 mb-4">
              Your staff account has been successfully activated.
            </p>
            <p className="text-sm text-slate-500 mb-6">
              You can now sign in to access the MTU Result Notification System.
            </p>
            <Button
              onClick={() => navigate('/login')}
              className="w-full h-11 bg-mtu-green hover:bg-mtu-green-dark text-white font-semibold"
            >
              <span className="flex items-center gap-2">
                Go to Login
                <ArrowRight className="h-4 w-4" />
              </span>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex bg-white lg:bg-slate-50">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-5/12 bg-gradient-to-br from-mtu-green via-mtu-green to-mtu-green-dark relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-mtu-purple/20 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-mtu-gold/20 rounded-full translate-y-1/2 -translate-x-1/2" />

        <div className="relative z-10 flex flex-col justify-center px-16 py-12 w-full">
          <div className="mb-8">
            <img
              src="/mtulogo.jpg"
              alt="Mountain Top University"
              className="h-32 w-auto object-contain drop-shadow-lg"
            />
          </div>

          <h1 className="text-4xl xl:text-5xl font-bold text-white leading-tight mb-6">
            Join Senate Result Dispatch
          </h1>

          <p className="text-white/80 text-lg mb-8 max-w-md">
            Help upload, approve, and send student results to parents via Email, WhatsApp, and Telegram
          </p>

          <div className="mt-auto pt-12">
            <p className="text-white/60 italic text-sm">
              "Empowered to Excel"
            </p>
          </div>
        </div>
      </div>

      {/* Right Panel - Signup Form */}
      <div className="flex-1 flex flex-col justify-center items-center p-6 lg:p-12">
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
                <UserPlus className="h-4 w-4 text-mtu-green" />
              </div>
              <span className="text-xs font-semibold text-mtu-green uppercase tracking-wider">
                Result Dispatch Portal
              </span>
            </div>
            <CardTitle className="text-2xl font-bold text-slate-900">
              Create Your Account
            </CardTitle>
            <CardDescription className="text-slate-500">
              Complete your registration to join the system
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">

              <div className="space-y-2">
                <Label htmlFor="fullName" className="text-slate-700 font-medium">Full Name</Label>
                <Input
                  id="fullName"
                  type="text"
                  placeholder="John Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  className="h-11 border-slate-200 focus:border-mtu-green focus:ring-mtu-green/20"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-slate-700 font-medium">Email Address</Label>
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
                  Must match your invited email address
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-slate-700 font-medium">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Create a secure password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="h-11 border-slate-200 focus:border-mtu-green focus:ring-mtu-green/20"
                />
                <p className="text-xs text-slate-400">
                  Minimum 8 characters required
                </p>
              </div>

              <Button
                type="submit"
                disabled={loading || !token}
                className="w-full h-11 bg-mtu-green hover:bg-mtu-green-dark text-white font-semibold shadow-md hover:shadow-lg transition-all"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating account...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    Create Account
                    <ArrowRight className="h-4 w-4" />
                  </span>
                )}
              </Button>

              {!token && (
                <p className="text-xs text-center text-amber-600 bg-amber-50 p-2 rounded">
                  No invitation token found. Please use the link from your invitation email.
                </p>
              )}
            </form>

            <div className="mt-6 pt-6 border-t border-slate-100 text-center">
              <p className="text-sm text-slate-500">
                Already have an account?{' '}
                <Link to="/login" className="text-mtu-purple hover:text-mtu-purple-dark font-medium transition-colors">
                  Sign In
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="mt-8 text-center">
          <p className="text-xs text-slate-400">
            MTU Senate Result Dispatch System © 2026
          </p>
          <p className="text-[10px] text-slate-300 mt-1">
            "Empowered to Excel"
          </p>
        </div>
      </div>
    </div>
  )
}