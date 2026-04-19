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
  Ban
} from 'lucide-react'
import type { ResultWithDetails } from '@/types'

interface StudentResult extends ResultWithDetails {
  full_name: string
  matric_no: string
}

interface UploadProgress {
  file: string
  status: 'uploading' | 'complete' | 'error'
  progress: number
  message?: string
}

interface UploadResult {
  success: boolean
  matricNo?: string
  error?: string
}

function parseMatricFromFilename(filename: string): UploadResult {
  // Case-insensitive extension check
  const ext = filename.split('.').pop()?.toLowerCase()
  if (ext !== 'pdf') {
    return { success: false, error: 'Not a PDF file' }
  }

  // Support patterns: 19010301081_S2.pdf, 19010301081.pdf, 19010301081-S2.pdf
  const patterns = [
    /^(\d{11})[_-]/,           // 19010301081_ or 19010301081-
    /^(\d{11})(?=\.pdf$)/i,    // 19010301081.pdf (just the number)
  ]

  for (const pattern of patterns) {
    const match = filename.match(pattern)
    if (match) {
      return { success: true, matricNo: match[1] }
    }
  }

  return { success: false, error: 'Filename must start with 11-digit matric number (e.g., 19010301081_S2.pdf)' }
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

  const fetchResults = useCallback(async () => {
    const { data, error } = await supabase
      .from('results')
      .select(`
        id,
        student_id,
        pdf_url,
        is_senate_approved,
        dispatch_status,
        created_at,
        updated_at,
        student:student_id (matric_no, full_name)
      `)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching results:', error)
      return
    }

    const mapped = (data || []).map((r: any) => ({
      id: r.id,
      student_id: r.student_id,
      pdf_url: r.pdf_url,
      is_senate_approved: r.is_senate_approved,
      dispatch_status: r.dispatch_status,
      created_at: r.created_at,
      updated_at: r.updated_at,
      matric_no: r.student?.matric_no,
      full_name: r.student?.full_name,
    }))

    setResults(mapped)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchResults()
  }, [fetchResults])

  // Calculate stats
  const stats = {
    total: results.length,
    dispatched: results.filter(r => {
      const status = r.dispatch_status
      return status && (status.email?.success || status.telegram?.success)
    }).length,
    pendingSenate: results.filter(r => !r.is_senate_approved).length,
    failed: results.filter(r => {
      const status = r.dispatch_status
      return status && !status.email?.success && !status.telegram?.success
    }).length,
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
        console.warn(`${file.name}: ${errorMsg}`)
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
        console.warn(errorMsg)
        setUploadProgress(prev => prev.map((p, idx) => idx === i ? { ...p, status: 'error', progress: 100, message: errorMsg } : p))
        errors.push(errorMsg)
        continue
      }

      const filePath = `${matricNo}/${file.name}`
      const { error: uploadError } = await supabase.storage
        .from('result_pdfs')
        .upload(filePath, file, { upsert: true })

      if (uploadError) {
        console.error(`Upload error for ${file.name}:`, uploadError)
        setUploadProgress(prev => prev.map((p, idx) => idx === i ? { ...p, status: 'error', progress: 100 } : p))
        continue
      }

      const { data: urlData } = supabase.storage
        .from('result_pdfs')
        .getPublicUrl(filePath)

      const { error: resultError } = await supabase.from('results').upsert({
        student_id: studentData.id,
        pdf_url: urlData.publicUrl,
        is_senate_approved: false,
        dispatch_status: null,
      }, { onConflict: 'student_id' })

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
        } else if (data?.status?.email?.success === false) {
          dispatchErrorMsg = data.status.email.message || 'Email failed'
        } else if (data?.status?.telegram?.success === false) {
          dispatchErrorMsg = data.status.telegram.message || 'Telegram failed'
        } else if (data?.status?.whatsapp?.success === false) {
          dispatchErrorMsg = data.status.whatsapp.message || 'WhatsApp failed'
        } else {
          dispatched++
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
    if (!status || !status[channel]) return 'pending'
    return status[channel]?.success ? 'success' : 'failed'
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
      </div>

      {/* Upload Dropzone */}
      <Card className="border-mtu-green-200">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <CloudUpload className="h-5 w-5 text-mtu-green" />
            Upload Result PDFs
          </CardTitle>
          <CardDescription>
            Drag and drop PDF files or click to browse. Files must follow naming convention: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">19010301081_S2.pdf</code>
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
                      <TableCell colSpan={8} className="text-center py-12">
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