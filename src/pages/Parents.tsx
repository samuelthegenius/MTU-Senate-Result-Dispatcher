"use client"

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Loader2, Users, Inbox, Plus, Mail, Send, X, Upload, FileText, CheckCircle2, AlertCircle, Download, Pencil, Copy, Check, ExternalLink, Trash2 } from 'lucide-react'

interface ParentContact {
  id: string
  student_id: string
  parent_type: 'father' | 'mother'
  matric_no: string
  full_name: string
  email: string | null
  telegram_chat_id: string | null
  phone: string | null
  whatsapp_no: string | null
  verification_token: string | null
}

interface Student {
  id: string
  matric_no: string
  full_name: string
}

interface UploadProgress {
  file: string
  status: 'parsing' | 'complete' | 'error'
  progress: number
  message?: string
}

export default function ParentsPage() {
  const { toast } = useToast()
  const [contacts, setContacts] = useState<ParentContact[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showBulkForm, setShowBulkForm] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([])
  const [editingContact, setEditingContact] = useState<ParentContact | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Form state
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [parentType, setParentType] = useState<'father' | 'mother'>('father')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [whatsappNo, setWhatsappNo] = useState('')

  const fetchData = useCallback(async () => {
    // Fetch contacts and students separately to avoid foreign key join issues
    const [contactsRes, studentsRes] = await Promise.all([
      supabase
        .from('parent_contacts')
        .select('id, student_id, parent_type, email, phone, telegram_chat_id, whatsapp_no, verification_token, created_at')
        .order('created_at', { ascending: false }),
      supabase
        .from('students')
        .select('id, matric_no, full_name')
        .order('matric_no', { ascending: true })
    ])

    if (contactsRes.error) {
      toast({
        title: 'Error loading contacts',
        description: contactsRes.error.message || 'Failed to fetch parent contacts',
        variant: 'destructive',
      })
    } else {
      // Create a lookup map for students
      const studentMap = new Map((studentsRes.data || []).map(s => [s.id, s]))

      const mapped = (contactsRes.data || []).map((c: any) => {
        const student = studentMap.get(c.student_id)
        return {
          id: c.id,
          student_id: c.student_id,
          parent_type: c.parent_type || 'father',
          email: c.email,
          phone: c.phone,
          telegram_chat_id: c.telegram_chat_id,
          whatsapp_no: c.whatsapp_no,
          verification_token: c.verification_token,
          matric_no: student?.matric_no,
          full_name: student?.full_name,
        }
      })
      setContacts(mapped)
    }

    setStudents(studentsRes.data || [])

    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()

    // Subscribe to parent_contacts changes for realtime updates
    const channel = supabase
      .channel('parent_contacts_changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'parent_contacts' },
        () => fetchData()
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [fetchData])

  const handleSave = async () => {
    if (!selectedStudentId) return

    // Validate at least one contact method is provided
    if (!email && !phone && !whatsappNo) {
      toast({
        title: 'Validation Error',
        description: 'Please provide at least one contact method (email, phone, or WhatsApp).',
        variant: 'destructive',
      })
      return
    }

    setSaving(true)
    const { error } = await supabase
      .from('parent_contacts')
      .upsert({
        student_id: selectedStudentId,
        parent_type: parentType,
        email: email || null,
        phone: phone || null,
        whatsapp_no: whatsappNo || null,
      }, { onConflict: 'student_id,parent_type' })

    if (error) {
      // Handle specific error cases
      let errorMessage = 'Failed to save contact. Please try again.'

      if (error.code === '23503') {
        // Foreign key violation - student was deleted
        errorMessage = 'The selected student no longer exists. Please refresh the page and try again.'
      } else if (error.code === '23505') {
        // Unique constraint violation
        errorMessage = `A ${parentType} contact for this student already exists.`
      } else if (error.message?.includes('student_id')) {
        errorMessage = 'Invalid student selected. The student may have been deleted.'
      }

      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      })
    } else {
      setShowForm(false)
      resetForm()
      toast({
        title: 'Contact saved',
        description: 'Parent contact saved successfully!',
        variant: 'success',
      })
      await fetchData()
    }
    setSaving(false)
  }

  const resetForm = () => {
    setSelectedStudentId('')
    setParentType('father')
    setEmail('')
    setPhone('')
    setWhatsappNo('')
    setEditingContact(null)
  }

  const handleEdit = (contact: ParentContact) => {
    setEditingContact(contact)
    setSelectedStudentId(contact.student_id)
    setParentType(contact.parent_type)
    setEmail(contact.email || '')
    setPhone(contact.phone || '')
    setWhatsappNo(contact.whatsapp_no || '')
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDelete = async (contact: ParentContact) => {
    const parentTypeLabel = contact.parent_type === 'mother' ? 'Mother' : 'Father'
    if (!confirm(`Delete ${parentTypeLabel} contact for ${contact.full_name} (${contact.matric_no})?`)) {
      return
    }

    const { error } = await supabase
      .from('parent_contacts')
      .delete()
      .eq('id', contact.id)

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete contact. Please try again.',
        variant: 'destructive',
      })
    } else {
      toast({
        title: 'Contact deleted',
        description: 'Parent contact removed successfully.',
        variant: 'success',
      })
      await fetchData()
    }
  }

  const handleCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setShowBulkForm(false)
    setUploadProgress([{ file: file.name, status: 'parsing', progress: 0 }])

    const reader = new FileReader()
    reader.onload = async (event) => {
      const csvText = event.target?.result as string
      if (!csvText) {
        setUploadProgress([{ file: file.name, status: 'error', progress: 100, message: 'Failed to read file' }])
        return
      }

      // Parse CSV
      const lines = csvText.split('\n').filter(line => line.trim())
      const newContacts: { matric_no: string; email?: string; parent_type: 'father' | 'mother' }[] = []
      const errors: string[] = []

      // Skip header if present
      const startIndex = lines[0]?.toLowerCase().includes('matric') ? 1 : 0

      // Build student lookup map
      const studentMap = new Map(students.map(s => [s.matric_no, s.id]))

      for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i].trim()
        if (!line) continue

        // Handle both comma and tab separated
        const parts = line.includes('\t') ? line.split('\t') : line.split(',')

        if (parts.length >= 2) {
          const matric = parts[0].trim()
          const email = parts[1]?.trim() || undefined
          const parentTypeRaw = parts[2]?.trim().toLowerCase() || 'father'
          const parent_type: 'father' | 'mother' = parentTypeRaw === 'mother' ? 'mother' : 'father'
          if (matric && /^\d{11}$/.test(matric)) {
            const studentId = studentMap.get(matric)
            if (studentId) {
              newContacts.push({
                matric_no: matric,
                email,
                parent_type,
              })
            } else {
              errors.push(`Line ${i + 1}: Student with matric "${matric}" not found`)
            }
          } else if (matric) {
            errors.push(`Line ${i + 1}: Invalid matric number "${matric}"`)
          }
        } else {
          errors.push(`Line ${i + 1}: Invalid format`)
        }

        const progress = Math.round(((i - startIndex + 1) / (lines.length - startIndex)) * 50)
        setUploadProgress([{ file: file.name, status: 'parsing', progress }])
      }

      if (newContacts.length === 0) {
        setUploadProgress([{ file: file.name, status: 'error', progress: 100, message: `No valid contacts found. ${errors.slice(0, 3).join('; ')}` }])
        return
      }

      // Insert contacts - track existing contacts before batch to distinguish insert vs update
      let inserted = 0
      let updated = 0
      let failed = 0

      // Create a set of existing contact keys (student_id + parent_type) before any upserts
      const existingContactKeys = new Set(
        contacts.map(c => `${c.student_id}:${c.parent_type}`)
      )

      for (let i = 0; i < newContacts.length; i++) {
        const contact = newContacts[i]
        const studentId = studentMap.get(contact.matric_no)
        if (!studentId) continue

        const contactKey = `${studentId}:${contact.parent_type}`
        const wasExisting = existingContactKeys.has(contactKey)

        const { error } = await supabase
          .from('parent_contacts')
          .upsert({
            student_id: studentId,
            parent_type: contact.parent_type,
            email: contact.email || null,
            // Note: telegram_chat_id cannot be set via CSV - parents must use the bot invitation link
          }, { onConflict: 'student_id,parent_type' })

        if (error) {
          failed++
          // Provide better error messages for common issues
          let errorMsg = error.message
          if (error.code === '23503' || error.message?.includes('student_id')) {
            errorMsg = 'Student no longer exists (may have been deleted)'
          } else if (error.code === '23505') {
            errorMsg = 'Contact already exists for this student and parent type'
          }
          errors.push(`${contact.matric_no}: ${errorMsg}`)
        } else {
          // Check if it was an insert or update based on pre-batch state
          if (wasExisting) {
            updated++
          } else {
            inserted++
            // Add to set so duplicates in same batch are counted as updates
            existingContactKeys.add(contactKey)
          }
        }

        const progress = 50 + Math.round(((i + 1) / newContacts.length) * 50)
        setUploadProgress([{ file: file.name, status: 'parsing', progress }])
      }

      setUploadProgress([{
        file: file.name,
        status: errors.length > 0 && inserted === 0 && updated === 0 ? 'error' : 'complete',
        progress: 100,
        message: `Inserted: ${inserted}, Updated: ${updated}${failed > 0 ? ', Failed: ' + failed : ''}`
      }])

      await fetchData()

      setTimeout(() => setUploadProgress([]), 5000)
    }

    reader.onerror = () => {
      setUploadProgress([{ file: file.name, status: 'error', progress: 100, message: 'Failed to read file' }])
    }

    reader.readAsText(file)
    e.target.value = ''
  }

  const downloadTemplate = () => {
    const csvContent = 'matric_no,email,parent_type\n19010301081,father@email.com,father\n19010301082,mother@email.com,mother'
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'parent_contacts_template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const getTelegramBotUsername = () => {
    // Get bot username from env or return placeholder
    return import.meta.env.VITE_TELEGRAM_BOT_USERNAME || 'MTUResultsBot'
  }

  const generateDeepLink = (token: string | null) => {
    if (!token) return null
    const botUsername = getTelegramBotUsername()
    return `https://t.me/${botUsername}?start=${token}`
  }

  const handleCopyLink = async (contact: ParentContact) => {
    const link = generateDeepLink(contact.verification_token)
    if (!link) {
      toast({
        title: 'Error',
        description: 'No verification token available.',
        variant: 'destructive',
      })
      return
    }

    try {
      await navigator.clipboard.writeText(link)
      setCopiedId(contact.id)
      toast({
        title: 'Link copied!',
        description: 'Telegram onboarding link copied to clipboard.',
        variant: 'success',
      })
      setTimeout(() => setCopiedId(null), 2000)
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to copy link.',
        variant: 'destructive',
      })
    }
  }

  const getChannelIcon = (value: string | null, type: 'email' | 'telegram' | 'whatsapp') => {
    if (!value) return <span className="text-slate-300">-</span>

    const icons = {
      email: <Mail className="h-4 w-4 text-mtu-purple" />,
      telegram: <Send className="h-4 w-4 text-blue-500" />,
      whatsapp: (
        <svg className="h-4 w-4 text-green-600" fill="currentColor" viewBox="0 0 24 24">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
      ),
    }

    return (
      <div className="flex items-center gap-2">
        {icons[type]}
        <span className="text-sm text-slate-600">{value}</span>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Parent Directory</h1>
          <p className="text-slate-500 mt-1">
            Manage parent/guardian contact information for result dispatch
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            onClick={() => setShowBulkForm(!showBulkForm)}
            variant="outline"
            className="border-mtu-green text-mtu-green hover:bg-mtu-green-50"
          >
            {showBulkForm ? <X className="h-4 w-4 mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
            {showBulkForm ? 'Cancel' : 'Bulk Import'}
          </Button>
          <Button
            onClick={() => {
              if (showForm) {
                resetForm()
              }
              setShowForm(!showForm)
            }}
            className="bg-mtu-green hover:bg-mtu-green-dark text-white"
          >
            {showForm ? <X className="h-4 w-4 mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
            {showForm ? 'Cancel' : 'Add Contact'}
          </Button>
        </div>
      </div>

      {/* Bulk Import Form */}
      {showBulkForm && (
        <Card className="border-mtu-purple-200">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Upload className="h-5 w-5 text-mtu-purple" />
              Bulk Import Parent Contacts
            </CardTitle>
            <CardDescription>
              Upload a CSV file with parent contact data linked by matric number
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="bg-slate-50 p-4 rounded-lg">
                <p className="text-sm font-medium text-slate-700 mb-2">CSV Format Requirements:</p>
                <ul className="text-sm text-slate-600 list-disc list-inside space-y-1">
                  <li>Column 1: Matric number (11 digits) - must exist in students table</li>
                  <li>Column 2: Email address (optional)</li>
                  <li>Column 3: Parent type - 'father' or 'mother' (defaults to 'father' if empty)</li>
                  <li>Header row is optional</li>
                </ul>
                <p className="text-xs text-amber-600 mt-2">
                  <strong>Note:</strong> Telegram must be linked separately via the bot invitation link after import.
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={downloadTemplate}
                  className="mt-3 text-mtu-green hover:text-mtu-green-dark"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download Template
                </Button>
              </div>
              <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-mtu-purple transition-colors">
                <input
                  type="file"
                  id="csv-upload-contacts"
                  accept=".csv,.txt"
                  className="hidden"
                  onChange={handleCSVUpload}
                />
                <label htmlFor="csv-upload-contacts" className="cursor-pointer block">
                  <Upload className="h-10 w-10 text-slate-400 mx-auto mb-3" />
                  <p className="text-slate-700 font-medium">Click to upload CSV file</p>
                  <p className="text-sm text-slate-400 mt-1">or drag and drop here</p>
                </label>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upload Progress */}
      {uploadProgress.length > 0 && (
        <Card className="border-slate-200">
          <CardContent className="p-4">
            {uploadProgress.map((item, idx) => (
              <div key={idx} className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-slate-400" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-700">{item.file}</p>
                  <div className="mt-1.5 h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        item.status === 'error' ? 'bg-red-500' : 'bg-mtu-purple'
                      }`}
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                </div>
                {item.status === 'parsing' && <Loader2 className="h-4 w-4 animate-spin text-mtu-purple" />}
                {item.status === 'complete' && <CheckCircle2 className="h-4 w-4 text-mtu-green" />}
                {item.status === 'error' && <AlertCircle className="h-4 w-4 text-red-500" />}
              </div>
            ))}
            {uploadProgress[0]?.message && (
              <p className={`text-sm mt-2 ${uploadProgress[0].status === 'error' ? 'text-red-600' : 'text-mtu-green'}`}>
                {uploadProgress[0].message}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Add Contact Form */}
      {showForm && (
        <Card className="border-mtu-green-200">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Plus className="h-5 w-5 text-mtu-green" />
              {editingContact ? 'Edit Parent Contact' : 'Add Parent Contact'}
            </CardTitle>
            <CardDescription>
              Add or update contact information for a student's parent/guardian
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Student</label>
                <select
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  disabled={!!editingContact}
                  className="w-full h-11 px-3 rounded-md border border-slate-200 focus:border-mtu-green focus:ring-mtu-green/20 bg-white disabled:bg-slate-100 disabled:text-slate-500"
                >
                  <option value="">Select a student...</option>
                  {students.map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.matric_no} - {student.full_name}
                    </option>
                  ))}
                </select>
                {editingContact && (
                  <p className="text-xs text-slate-500">Student cannot be changed when editing</p>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Parent Type</label>
                <select
                  value={parentType}
                  onChange={(e) => setParentType(e.target.value as 'father' | 'mother')}
                  disabled={!!editingContact}
                  className="w-full h-11 px-3 rounded-md border border-slate-200 focus:border-mtu-green focus:ring-mtu-green/20 bg-white disabled:bg-slate-100 disabled:text-slate-500"
                >
                  <option value="father">Father</option>
                  <option value="mother">Mother</option>
                </select>
                {editingContact && (
                  <p className="text-xs text-slate-500">Parent type cannot be changed when editing. Delete and recreate to change type.</p>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                  <Mail className="h-4 w-4 text-mtu-purple" />
                  Email
                </label>
                <p className="text-xs text-slate-500 mb-1">
                  Used to dispatch results. The Telegram deep link can also be sent via email.
                </p>
                <Input
                  type="email"
                  placeholder="parent@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                  <svg className="h-4 w-4 text-blue-500" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.19 13.9l-2.965-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.963.659z"/>
                  </svg>
                  Telegram Phone Number
                </label>
                <Input
                  type="tel"
                  placeholder="+2348012345678"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="h-11"
                />
                <p className="text-xs text-slate-500">The phone number this parent uses on Telegram. This is how they verify their identity with the bot. Include country code (e.g., +234 for Nigeria).</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                  <svg className="h-4 w-4 text-green-600" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  WhatsApp Number
                </label>
                <Input
                  type="tel"
                  placeholder="+2348012345678"
                  value={whatsappNo}
                  onChange={(e) => setWhatsappNo(e.target.value)}
                  className="h-11"
                />
                <p className="text-xs text-slate-500">Used for WhatsApp result notifications. Include country code (e.g., +234 for Nigeria).</p>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowForm(false)
                    resetForm()
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={!selectedStudentId || saving}
                  className="bg-mtu-green hover:bg-mtu-green-dark text-white"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : editingContact ? (
                    'Update Contact'
                  ) : (
                    'Save Contact'
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Contacts Table */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5 text-mtu-green" />
            Parent Contacts
          </CardTitle>
          <CardDescription>
            All registered parent/guardian contacts
          </CardDescription>
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
                    <TableHead className="font-semibold text-slate-700">Matric No.</TableHead>
                    <TableHead className="font-semibold text-slate-700">Student Name</TableHead>
                    <TableHead className="font-semibold text-slate-700">Parent Type</TableHead>
                    <TableHead className="font-semibold text-slate-700">Email</TableHead>
                    <TableHead className="font-semibold text-slate-700">Telegram Phone</TableHead>
                    <TableHead className="font-semibold text-slate-700">Telegram</TableHead>
                    <TableHead className="font-semibold text-slate-700">WhatsApp</TableHead>
                    <TableHead className="font-semibold text-slate-700">Telegram Link</TableHead>
                    <TableHead className="font-semibold text-slate-700">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contacts.map((contact) => (
                    <TableRow key={contact.id} className="hover:bg-slate-50/50">
                      <TableCell className="font-mono text-sm text-slate-600">
                        {contact.matric_no}
                      </TableCell>
                      <TableCell className="font-medium text-slate-900">
                        {contact.full_name}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          contact.parent_type === 'mother'
                            ? 'bg-pink-100 text-pink-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}>
                          {contact.parent_type === 'mother' ? 'Mother' : 'Father'}
                        </span>
                      </TableCell>
                      <TableCell>
                        {getChannelIcon(contact.email, 'email')}
                      </TableCell>
                      <TableCell>
                        {contact.phone ? (
                          <div className="flex items-center gap-2">
                            <svg className="h-4 w-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                            </svg>
                            <span className="text-sm text-slate-600">{contact.phone}</span>
                          </div>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {getChannelIcon(contact.telegram_chat_id, 'telegram')}
                      </TableCell>
                      <TableCell>
                        {getChannelIcon(contact.whatsapp_no, 'whatsapp')}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {contact.telegram_chat_id ? (
                            <>
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                              <span className="text-sm text-green-600">Connected</span>
                            </>
                          ) : (
                            <span className="text-sm text-slate-400">Not connected</span>
                          )}
                          {contact.verification_token && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleCopyLink(contact)}
                                className="text-mtu-purple hover:text-mtu-purple-dark h-8 px-2"
                              >
                                {copiedId === contact.id ? (
                                  <Check className="h-4 w-4 mr-1" />
                                ) : (
                                  <Copy className="h-4 w-4 mr-1" />
                                )}
                                <span className="text-xs">{copiedId === contact.id ? 'Copied!' : 'Copy Link'}</span>
                              </Button>
                              <a
                                href={generateDeepLink(contact.verification_token) || '#'}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-500 hover:text-blue-600"
                                title="Open in Telegram"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(contact)}
                            className="text-mtu-purple hover:text-mtu-purple-dark"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(contact)}
                            className="text-red-500 hover:text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {contacts.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-12">
                        <div className="flex flex-col items-center gap-3">
                          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                            <Inbox className="h-6 w-6 text-slate-400" />
                          </div>
                          <p className="text-slate-500 font-medium">No contacts found</p>
                          <p className="text-sm text-slate-400">Add parent contacts using the button above</p>
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
