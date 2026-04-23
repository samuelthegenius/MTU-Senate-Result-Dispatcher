"use client"

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Upload,
  FileText,
  CheckCircle2,
  XCircle,
  Loader2,
  TrendingUp,
  Clock,
  AlertCircle,
  CheckCheck,
  CloudUpload,
  Send,
  Inbox,
  Ban,
  Cloud,
  CloudOff
} from 'lucide-react'
import type { ResultWithDetails } from '@/types'

interface StudentResult extends ResultWithDetails {
  full_name: string
  matric_no: string
  level?: number
  semester?: number
  programme?: string
  source?: string
  auto_dispatched_at?: string
  student_level?: number
}

interface UploadProgress {
  file: string
  status: 'uploading' | 'complete' | 'error'
  progress: number
  message?: string
}

interface PortalConfig {
  sync_enabled: boolean
  last_sync_at: string | null
  last_sync_status: string | null
  auto_dispatch_enabled: boolean
}

interface UploadResult {
  success: boolean
  matricNo?: string
  level?: number
  semester?: number
  resultType?: 'regular' | 'supplementary'
  error?: string
}

// Helper function to get ordinal suffix (st, nd, rd, th)
function getOrdinalSuffix(n: number): string {
  const lastDigit = n % 10
  const lastTwoDigits = n % 100

  if (lastTwoDigits >= 11 && lastTwoDigits <= 13) {
    return "th"
  }

  switch (lastDigit) {
    case 1:
      return "st"
    case 2:
      return "nd"
    case 3:
      return "rd"
    default:
      return "th"
  }
}

function parseMatricFromFilename(filename: string): UploadResult {
  // Case-insensitive extension check
  const ext = filename.split('.').pop()?.toLowerCase()
  if (ext !== 'pdf') {
    return { success: false, error: 'Not a PDF file' }
  }

  // Support patterns:
  // - 19010301081.pdf (just matric)
  // - 19010301081_S1.pdf (matric + 1st semester)
  // - 19010301081_S2.pdf (matric + 2nd semester)
  // - 19010301081_400_S2.pdf (matric + level + semester)
  // - 19010301081_400.pdf (matric + level)
  // - 19010301081_SUP.pdf (matric + supplementary, no semester - happens after S2)
  // - 19010301081_400_SUP.pdf (matric + level + supplementary, no semester)
  const patterns = [
    // Pattern: MATRIC_LEVEL_SEMESTER_SUPP (e.g., 19010301081_400_S2_SUP.pdf)
    { regex: /^(\d{11})[_-](\d{3})[_-]S(\d)[_-]SUP\.(pdf|PDF)$/i, hasLevel: true, hasSemester: true, hasSupplementary: true },
    // Pattern: MATRIC_SEMESTER_SUPP (e.g., 19010301081_S2_SUP.pdf)
    { regex: /^(\d{11})[_-]S(\d)[_-]SUP\.(pdf|PDF)$/i, hasLevel: false, hasSemester: true, hasSupplementary: true },
    // Pattern: MATRIC_LEVEL_SUPP (e.g., 19010301081_400_SUP.pdf)
    { regex: /^(\d{11})[_-](\d{3})[_-]SUP\.(pdf|PDF)$/i, hasLevel: true, hasSemester: false, hasSupplementary: true },
    // Pattern: MATRIC_SUPP only (e.g., 19010301081_SUP.pdf)
    { regex: /^(\d{11})[_-]SUP\.(pdf|PDF)$/i, hasLevel: false, hasSemester: false, hasSupplementary: true },
    // Pattern: MATRIC_LEVEL_SEMESTER (e.g., 19010301081_400_S2.pdf)
    { regex: /^(\d{11})[_-](\d{3})[_-]S(\d)\.(pdf|PDF)$/i, hasLevel: true, hasSemester: true, hasSupplementary: false },
    // Pattern: MATRIC_SEMESTER (e.g., 19010301081_S2.pdf)
    { regex: /^(\d{11})[_-]S(\d)\.(pdf|PDF)$/i, hasLevel: false, hasSemester: true, hasSupplementary: false },
    // Pattern: MATRIC_LEVEL (e.g., 19010301081_400.pdf)
    { regex: /^(\d{11})[_-](\d{3})\.(pdf|PDF)$/i, hasLevel: true, hasSemester: false, hasSupplementary: false },
    // Pattern: MATRIC only (e.g., 19010301081.pdf)
    { regex: /^(\d{11})\.(pdf|PDF)$/i, hasLevel: false, hasSemester: false, hasSupplementary: false },
    // Pattern: MATRIC with any suffix before .pdf (fallback)
    { regex: /^(\d{11})[_-]/, hasLevel: false, hasSemester: false, hasSupplementary: false },
  ]

  for (const pattern of patterns) {
    const match = filename.match(pattern.regex)
    if (match) {
      const result: UploadResult = { success: true, matricNo: match[1] }
      if (pattern.hasLevel) {
        result.level = parseInt(match[2], 10)
      }
      if (pattern.hasSemester) {
        // Match position depends on whether level is present
        const semesterIndex = pattern.hasLevel ? 3 : 2
        result.semester = parseInt(match[semesterIndex], 10)
      }
      if (pattern.hasSupplementary) {
        result.resultType = 'supplementary'
      } else {
        result.resultType = 'regular'
      }
      return result
    }
  }

  return { success: false, error: 'Filename must start with 11-digit matric number (e.g., 19010301081_400_S2.pdf)' }
}

// Status Badge Component
function StatusBadge({ status, type }: { status: string; type: 'pdf' | 'senate' | 'dispatch' }) {
  const variants = {
    pdf: {
      uploaded: { bg: 'bg-mtu-green-100', text: 'text-mtu-green-dark', icon: FileText, label: 'Uploaded' },
      pending: { bg: 'bg-slate-100', text: 'text-slate-500', icon: Clock, label: 'Pending' },
    },
    senate: {
      approved: { bg: 'bg-mtu-green-100', text: 'text-mtu-green-dark', icon: CheckCircle2, label: 'Approved' },
      pending: { bg: 'bg-amber-50', text: 'text-amber-600', icon: Clock, label: 'Pending' },
    },
    dispatch: {
      success: { bg: 'bg-mtu-green-100', text: 'text-mtu-green-dark', icon: CheckCircle2, label: 'Sent' },
      failed: { bg: 'bg-red-50', text: 'text-red-600', icon: Ban, label: 'Failed' },
      pending: { bg: 'bg-slate-100', text: 'text-slate-400', icon: Clock, label: '-' },
    }
  }

  const variant = variants[type][status as keyof typeof variants[typeof type]] || variants[type].pending
  const Icon = variant.icon

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${variant.bg} ${variant.text}`}>
      <Icon className="h-3.5 w-3.5" />
      {variant.label}
    </span>
  )
}

// Stat Card Component
function StatCard({ title, value, subtitle, icon: Icon, trend, color }: {
  title: string
  value: number
  subtitle: string
  icon: React.ElementType
  trend?: string
  color: 'green' | 'purple' | 'gold' | 'slate'
}) {
  const colorStyles = {
    green: { bg: 'bg-mtu-green-50', icon: 'text-mtu-green', border: 'border-mtu-green-100' },
    purple: { bg: 'bg-mtu-purple-50', icon: 'text-mtu-purple', border: 'border-mtu-purple-100' },
    gold: { bg: 'bg-amber-50', icon: 'text-amber-600', border: 'border-amber-100' },
    slate: { bg: 'bg-slate-50', icon: 'text-slate-500', border: 'border-slate-200' },
  }

  const style = colorStyles[color]

  return (
    <Card className={`border ${style.border} overflow-hidden`}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">{title}</p>
            <p className="text-3xl font-bold text-slate-900 mt-2">{value.toLocaleString()}</p>
            <p className="text-xs text-slate-400 mt-1">{subtitle}</p>
          </div>
          <div className={`p-3 rounded-xl ${style.bg}`}>
            <Icon className={`h-5 w-5 ${style.icon}`} />
          </div>
        </div>
        {trend && (
          <div className="mt-4 flex items-center gap-1 text-xs">
            <TrendingUp className="h-3 w-3 text-mtu-green" />
            <span className="text-mtu-green font-medium">{trend}</span>
            <span className="text-slate-400">vs last month</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function DashboardPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [results, setResults] = useState<StudentResult[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [approving, setApproving] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([])
  const [portalConfig, setPortalConfig] = useState<PortalConfig | null>(null)

  const fetchPortalConfig = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('portal_config')
        .select('sync_enabled, last_sync_at, last_sync_status, auto_dispatch_enabled')
        .maybeSingle()

      if (error) {
        return
      }

      setPortalConfig(data)
    } catch {
      // Config fetch failed - silent
    }
  }, [])

  const fetchResults = useCallback(async () => {
    // Fetch results and students separately to avoid foreign key join issues
    const [{ data: resultsData, error: resultsError }, { data: studentsData, error: _studentsError }] = await Promise.all([
      supabase
        .from('results')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase
        .from('students')
        .select('id, matric_no, full_name, programme, level')
    ])

    if (resultsError) {
      toast({
        title: 'Error loading results',
        description: resultsError.message || 'Failed to fetch results. Please try again.',
        variant: 'destructive',
      })
      setLoading(false)
      return
    }

    // Create a lookup map for students (convert UUIDs to strings for consistent comparison)
    const studentMap = new Map((studentsData || []).map(s => [String(s.id), s]))

    const mapped = (resultsData || []).map((r: any) => {
      const student = studentMap.get(String(r.student_id))
      return {
        id: r.id,
        student_id: r.student_id,
        pdf_url: r.pdf_url,
        level: r.level,
        semester: r.semester,
        result_type: r.result_type,
        is_senate_approved: r.is_senate_approved,
        dispatch_status: r.dispatch_status,
        created_at: r.created_at,
        updated_at: r.updated_at,
        source: r.source,
        auto_dispatched_at: r.auto_dispatched_at,
        matric_no: student?.matric_no,
        full_name: student?.full_name,
        programme: student?.programme,
        student_level: student?.level,
      }
    })

    setResults(mapped)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchResults()
    fetchPortalConfig()

    // Subscribe to parent_contacts changes for realtime updates to Telegram status
    const parentContactsChannel = supabase
      .channel('parent_contacts_changes_dashboard')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'parent_contacts' },
        () => fetchResults()
      )
      .subscribe()

    // Subscribe to results changes for realtime updates to dispatch status
    const resultsChannel = supabase
      .channel('results_changes_dashboard')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'results' },
        () => fetchResults()
      )
      .subscribe()

    return () => {
      parentContactsChannel.unsubscribe()
      resultsChannel.unsubscribe()
    }
  }, [fetchResults, fetchPortalConfig])

  // Calculate stats - check all parent types for dispatch status
  const isDispatched = (status: any) => {
    if (!status) return false
    // Check all parent types
    for (const parentType of ['father', 'mother', 'parent']) {
      const parentStatus = status[parentType]
      if (parentStatus && (parentStatus.email?.success || parentStatus.telegram?.success || parentStatus.whatsapp?.success)) {
        return true
      }
    }
    // Also check legacy format (direct email/telegram keys)
    return status.email?.success || status.telegram?.success || status.whatsapp?.success
  }

  const isFailed = (status: any) => {
    if (!status) return false
    let hasAny = false
    let allFailed = true
    // Check all parent types
    for (const parentType of ['father', 'mother', 'parent']) {
      const parentStatus = status[parentType]
      if (parentStatus) {
        hasAny = true
        const hasSuccess = parentStatus.email?.success || parentStatus.telegram?.success || parentStatus.whatsapp?.success
        if (hasSuccess) allFailed = false
      }
    }
    // Also check legacy format
    if (status.email || status.telegram || status.whatsapp) {
      hasAny = true
      if (status.email?.success || status.telegram?.success || status.whatsapp?.success) allFailed = false
    }
    return hasAny && allFailed
  }

  const stats = {
    total: results.length,
    dispatched: results.filter(r => isDispatched(r.dispatch_status)).length,
    pendingSenate: results.filter(r => !r.is_senate_approved).length,
    failed: results.filter(r => isFailed(r.dispatch_status)).length,
    portalResults: results.filter(r => r.source === 'portal').length,
    autoDispatched: results.filter(r => r.auto_dispatched_at).length,
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    const files = Array.from(e.dataTransfer.files)
    const pdfFiles = files.filter(f => f.type === 'application/pdf')

    if (pdfFiles.length === 0) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload PDF files only.',
        variant: 'destructive',
      })
      return
    }

    await uploadFiles(pdfFiles)
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return

    const files = Array.from(e.target.files)
    await uploadFiles(files)
    e.target.value = ''
  }

  const uploadFiles = async (files: File[]) => {
    setUploading(true)
    const progress: UploadProgress[] = files.map(f => ({ file: f.name, status: 'uploading', progress: 0 }))
    setUploadProgress(progress)

    const uploaded: { matricNo: string; path: string }[] = []
    const errors: string[] = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const parseResult = parseMatricFromFilename(file.name)

      if (!parseResult.success) {
        const errorMsg = parseResult.error || 'Invalid filename'
        setUploadProgress(prev => prev.map((p, idx) => idx === i ? { ...p, status: 'error', progress: 100, message: errorMsg } : p))
        errors.push(`${file.name}: ${errorMsg}`)
        continue
      }

      const matricNo = parseResult.matricNo!

      const { data: studentData } = await supabase
        .from('students')
        .select('id, full_name')
        .eq('matric_no', matricNo)
        .single()

      if (!studentData) {
        const errorMsg = `Student not found for matric: ${matricNo}`
        toast({
          title: 'Student not found',
          description: `No student record found for matric number "${matricNo}". Please add the student in the Students page before uploading their result.`,
          variant: 'destructive',
        })
        setUploadProgress(prev => prev.map((p, idx) => idx === i ? { ...p, status: 'error', progress: 100, message: errorMsg } : p))
        errors.push(errorMsg)
        continue
      }

      const filePath = `${matricNo}/${file.name}`
      const { error: uploadError } = await supabase.storage
        .from('result_pdfs')
        .upload(filePath, file, { upsert: true })

      if (uploadError) {
        setUploadProgress(prev => prev.map((p, idx) => idx === i ? { ...p, status: 'error', progress: 100 } : p))
        continue
      }

      const { data: urlData } = supabase.storage
        .from('result_pdfs')
        .getPublicUrl(filePath)

      const { error: resultError } = await supabase.from('results').upsert({
        student_id: studentData.id,
        pdf_url: urlData.publicUrl,
        level: parseResult.level || null,
        semester: parseResult.semester || null,
        result_type: parseResult.resultType || 'regular',
        is_senate_approved: false,
        dispatch_status: null,
      }, { onConflict: 'student_id,level,semester,result_type' })

      if (resultError) {
        console.error(`Result error for ${matricNo}:`, resultError)
        setUploadProgress(prev => prev.map((p, idx) => idx === i ? { ...p, status: 'error', progress: 100 } : p))
        continue
      }

      uploaded.push({ matricNo, path: filePath })
      setUploadProgress(prev => prev.map((p, idx) => idx === i ? { ...p, status: 'complete', progress: 100 } : p))
    }

    setUploading(false)
    if (uploaded.length > 0) {
      await fetchResults()
    }

    // Detailed summary
    if (errors.length > 0) {
      toast({
        title: `Uploaded ${uploaded.length}/${files.length} files`,
        description: `${errors.length} error(s) occurred. Check console for details.`,
        variant: 'destructive',
      })
    } else {
      toast({
        title: 'Upload successful!',
        description: `Successfully uploaded all ${uploaded.length} file(s).`,
        variant: 'success',
      })
    }

    setTimeout(() => setUploadProgress([]), 5000)
  }

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedIds(newSelected)
  }

  const selectAll = () => {
    if (selectedIds.size === results.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(results.map(r => r.id)))
    }
  }

  const handleApprove = async () => {
    if (selectedIds.size === 0) {
      toast({
        title: 'No selection',
        description: 'Please select at least one result to approve.',
        variant: 'destructive',
      })
      return
    }

    setApproving(true)

    // Get the current session for authorization header
    const { data: { session } } = await supabase.auth.getSession()
    const accessToken = session?.access_token

    const ids = Array.from(selectedIds)
    let approved = 0
    let dispatched = 0
    let failed = 0
    let dispatchErrorMsg = ''

    for (const id of ids) {
      // 1. Approve
      const { error: approveError } = await supabase
        .from('results')
        .update({ is_senate_approved: true })
        .eq('id', id)

      if (approveError) {
        console.error(`Failed to approve result ${id}:`, approveError)
        failed++
        continue
      }
      approved++

      // 2. Dispatch via Edge Function
      dispatchErrorMsg = ''
      try {
        const { data, error } = await supabase.functions.invoke('process-dispatch', {
          body: { resultId: id },
          headers: accessToken ? {
            'Authorization': `Bearer ${accessToken}`
          } : undefined
        })

        if (error) {
          console.error(`Dispatch failed for result ${id}:`, error)
          dispatchErrorMsg = error.message || 'Edge Function error'
        } else {
          // Check dispatch status for all parent types
          const status = data?.status || {}
          let hasFailure = false
          let hasSuccess = false

          for (const parentType of ['father', 'mother', 'parent']) {
            const parentStatus = status[parentType]
            if (parentStatus) {
              if (parentStatus.email?.success === false) {
                hasFailure = true
                dispatchErrorMsg = parentStatus.email.message || 'Email failed'
              } else if (parentStatus.telegram?.success === false) {
                hasFailure = true
                dispatchErrorMsg = parentStatus.telegram.message || 'Telegram failed'
              } else if (parentStatus.whatsapp?.success === false) {
                hasFailure = true
                dispatchErrorMsg = parentStatus.whatsapp.message || 'WhatsApp failed'
              } else if (parentStatus.email?.success || parentStatus.telegram?.success || parentStatus.whatsapp?.success) {
                hasSuccess = true
              }
            }
          }

          // Check legacy format
          if (status.email?.success === false) {
            hasFailure = true
            dispatchErrorMsg = status.email.message || 'Email failed'
          } else if (status.telegram?.success === false) {
            hasFailure = true
            dispatchErrorMsg = status.telegram.message || 'Telegram failed'
          } else if (status.whatsapp?.success === false) {
            hasFailure = true
            dispatchErrorMsg = status.whatsapp.message || 'WhatsApp failed'
          } else if (status.email?.success || status.telegram?.success || status.whatsapp?.success) {
            hasSuccess = true
          }

          if (!hasFailure || hasSuccess) {
            dispatched++
          }
        }
      } catch (e: any) {
        console.error(`Dispatch error for result ${id}:`, e)
        dispatchErrorMsg = e.message || 'Network error'
      }
      if (dispatchErrorMsg) break
    }

    setApproving(false)
    setSelectedIds(new Set())
    await fetchResults()

    const totalFailed = failed + (approved - dispatched)
    if (totalFailed > 0) {
      toast({
        title: 'Partial completion',
        description: `Approved ${approved}, dispatched ${dispatched}, ${totalFailed} failed. ${dispatchErrorMsg}`,
        variant: 'destructive',
      })
    } else {
      toast({
        title: 'Approval complete',
        description: `Approved and dispatched ${dispatched} result(s).`,
        variant: 'success',
      })
    }
  }

  const getChannelStatus = (status: any, channel: string) => {
    if (!status) return 'pending'

    // Check all parent types for any success
    let hasSuccess = false
    let hasAttempt = false

    for (const parentType of ['father', 'mother', 'parent']) {
      const parentStatus = status[parentType]
      if (parentStatus && parentStatus[channel]) {
        hasAttempt = true
        if (parentStatus[channel].success) {
          hasSuccess = true
        }
      }
    }

    // Also check legacy format
    if (status[channel]) {
      hasAttempt = true
      if (status[channel].success) {
        hasSuccess = true
      }
    }

    if (!hasAttempt) return 'pending'
    return hasSuccess ? 'success' : 'failed'
  }

  const StatusIcon = ({ status }: { status: string }) => {
    if (status === 'pending') return <Clock className="h-4 w-4 text-slate-300" />
    if (status === 'success') return <CheckCircle2 className="h-4 w-4 text-mtu-green" />
    if (status === 'failed') return <XCircle className="h-4 w-4 text-red-500" />
    return null
  }

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-500 mt-1">
          Welcome back, <span className="text-mtu-green font-medium">{user?.user_metadata?.full_name || user?.email?.split('@')[0]}</span>
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          title="Total Results"
          value={stats.total}
          subtitle="All uploaded results"
          icon={Inbox}
          color="slate"
        />
        <StatCard
          title="Dispatched"
          value={stats.dispatched}
          subtitle="Successfully delivered"
          icon={Send}
          trend={`${stats.total > 0 ? Math.round((stats.dispatched / stats.total) * 100) : 0}% rate`}
          color="green"
        />
        <StatCard
          title="Pending Approval"
          value={stats.pendingSenate}
          subtitle="Awaiting senate review"
          icon={Clock}
          color="gold"
        />
        <StatCard
          title="Failed Deliveries"
          value={stats.failed}
          subtitle="Requires attention"
          icon={AlertCircle}
          color="purple"
        />
        <Card className={`border overflow-hidden ${portalConfig?.sync_enabled ? 'border-blue-200' : 'border-slate-200'}`}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Portal Sync</p>
                <p className="text-3xl font-bold text-slate-900 mt-2">
                  {portalConfig?.sync_enabled ? (
                    <span className="inline-flex items-center gap-1.5 text-mtu-green">
                      <Cloud className="h-6 w-6" />
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-slate-400">
                      <CloudOff className="h-6 w-6" />
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  {portalConfig?.sync_enabled
                    ? `Last: ${portalConfig?.last_sync_at ? new Date(portalConfig.last_sync_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Never'}`
                    : 'Automatic sync disabled'}
                </p>
              </div>
              <div className={`p-3 rounded-xl ${portalConfig?.sync_enabled ? 'bg-blue-50' : 'bg-slate-50'}`}>
                {portalConfig?.sync_enabled ? (
                  <Cloud className="h-5 w-5 text-blue-500" />
                ) : (
                  <CloudOff className="h-5 w-5 text-slate-400" />
                )}
              </div>
            </div>
            {stats.portalResults > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">From portal:</span>
                  <span className="font-medium text-slate-700">{stats.portalResults} results</span>
                </div>
                {stats.autoDispatched > 0 && (
                  <div className="flex items-center justify-between text-xs mt-1">
                    <span className="text-slate-500">Auto-dispatched:</span>
                    <span className="font-medium text-mtu-green">{stats.autoDispatched}</span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Upload Dropzone */}
      <Card className="border-mtu-green-200">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <CloudUpload className="h-5 w-5 text-mtu-green" />
            Upload Result PDFs
          </CardTitle>
          <CardDescription>
            Drag and drop PDF files or click to browse. Naming: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">19010301081_400_S1.pdf</code> (1st sem), <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">19010301081_400_S2.pdf</code> (2nd sem), <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">19010301081_400_SUP.pdf</code> (supplementary)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 cursor-pointer ${
              dragActive
                ? 'border-mtu-green bg-mtu-green-50'
                : 'border-slate-300 hover:border-mtu-green-200 hover:bg-slate-50'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <input
              type="file"
              id="file-upload"
              multiple
              accept=".pdf"
              className="hidden"
              onChange={handleFileSelect}
            />
            <label htmlFor="file-upload" className="cursor-pointer block">
              <div className={`w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center transition-colors ${
                dragActive ? 'bg-mtu-green text-white' : 'bg-mtu-green-100 text-mtu-green'
              }`}>
                <Upload className="h-8 w-8" />
              </div>
              <p className="text-slate-700 font-semibold text-lg">
                {uploading ? 'Uploading files...' : 'Drop PDF files here'}
              </p>
              <p className="text-sm text-slate-500 mt-2">
                or click to browse from your computer
              </p>
            </label>
          </div>

          {/* Upload Progress */}
          {uploadProgress.length > 0 && (
            <div className="mt-6 space-y-3">
              {uploadProgress.map((item, idx) => (
                <div key={idx} className={`flex items-start gap-3 p-3 rounded-lg ${item.status === 'error' ? 'bg-red-50' : 'bg-slate-50'}`}>
                  <FileText className={`h-5 w-5 mt-0.5 ${item.status === 'error' ? 'text-red-400' : 'text-slate-400'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">{item.file}</p>
                    {item.message && (
                      <p className="text-xs text-red-600 mt-1">{item.message}</p>
                    )}
                    <div className="mt-1.5 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          item.status === 'error' ? 'bg-red-500' :
                          item.status === 'complete' ? 'bg-mtu-green' : 'bg-mtu-purple'
                        }`}
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                  </div>
                  {item.status === 'uploading' && <Loader2 className="h-4 w-4 animate-spin text-mtu-purple mt-0.5" />}
                  {item.status === 'complete' && <CheckCircle2 className="h-4 w-4 text-mtu-green mt-0.5" />}
                  {item.status === 'error' && <XCircle className="h-4 w-4 text-red-500 mt-0.5" />}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results Table */}
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CheckCheck className="h-5 w-5 text-mtu-green" />
              Result Management
            </CardTitle>
            <CardDescription className="mt-1">
              Select results for senate approval and dispatch
            </CardDescription>
          </div>
          <Button
            onClick={handleApprove}
            disabled={approving || selectedIds.size === 0}
            className="bg-mtu-green hover:bg-mtu-green-dark text-white shadow-md"
          >
            {approving ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Send className="h-4 w-4" />
                Approve & Dispatch ({selectedIds.size})
              </span>
            )}
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-mtu-purple" />
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 hover:bg-slate-50">
                    <TableHead className="w-12 border-b">
                      <Checkbox
                        checked={selectedIds.size === results.length && results.length > 0}
                        onCheckedChange={selectAll}
                      />
                    </TableHead>
                    <TableHead className="font-semibold text-slate-700">Matric No.</TableHead>
                    <TableHead className="font-semibold text-slate-700">Student Name</TableHead>
                    <TableHead className="font-semibold text-slate-700">Programme</TableHead>
                    <TableHead className="font-semibold text-slate-700">Level</TableHead>
                    <TableHead className="font-semibold text-slate-700">Semester</TableHead>
                    <TableHead className="font-semibold text-slate-700">Type</TableHead>
                    <TableHead className="font-semibold text-slate-700">PDF</TableHead>
                    <TableHead className="font-semibold text-slate-700">Senate</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-center">Email</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-center">Telegram</TableHead>
                    <TableHead className="font-semibold text-slate-700 text-center">WhatsApp</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((result) => (
                    <TableRow key={result.id} className="hover:bg-slate-50/50">
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(result.id)}
                          onCheckedChange={() => toggleSelect(result.id)}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-sm text-slate-600">
                        {result.matric_no}
                      </TableCell>
                      <TableCell className="font-medium text-slate-900">
                        {result.full_name}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {result.programme || '-'}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {result.level ? `${result.level}L` : '-'}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {result.semester
                          ? `${result.semester}${getOrdinalSuffix(result.semester)}`
                          : result.result_type === 'supplementary'
                            ? 'Supplementary'
                            : '-'}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          result.result_type === 'supplementary'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}>
                          {result.result_type === 'supplementary' ? 'Supplementary' : 'Regular'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          status={result.pdf_url ? 'uploaded' : 'pending'}
                          type="pdf"
                        />
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          status={result.is_senate_approved ? 'approved' : 'pending'}
                          type="senate"
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <StatusIcon status={getChannelStatus(result.dispatch_status, 'email')} />
                      </TableCell>
                      <TableCell className="text-center">
                        <StatusIcon status={getChannelStatus(result.dispatch_status, 'telegram')} />
                      </TableCell>
                      <TableCell className="text-center">
                        <StatusIcon status={getChannelStatus(result.dispatch_status, 'whatsapp')} />
                      </TableCell>
                    </TableRow>
                  ))}
                  {results.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center py-12">
                        <div className="flex flex-col items-center gap-3">
                          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                            <Inbox className="h-6 w-6 text-slate-400" />
                          </div>
                          <p className="text-slate-500 font-medium">No results found</p>
                          <p className="text-sm text-slate-400">Upload PDF files to get started</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}