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
  matric_no: string
  full_name: string
  email: string | null
  telegram_chat_id: string | null
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
  const [email, setEmail] = useState('')
  const [whatsappNo, setWhatsappNo] = useState('')

  const fetchData = useCallback(async () => {
    const [contactsRes, studentsRes] = await Promise.all([
      supabase
        .from('parent_contacts')
        .select(`
          id,
          student_id,
          email,
          telegram_chat_id,
          whatsapp_no,
          verification_token,
          student:student_id (matric_no, full_name)
        `)
        .order('created_at', { ascending: false }),
      supabase
        .from('students')
        .select('id, matric_no, full_name')
        .order('matric_no', { ascending: true })
    ])

    if (contactsRes.error) {
      console.error('Error fetching contacts:', contactsRes.error)
      toast({
        title: 'Error loading contacts',
        description: contactsRes.error.message || 'Failed to fetch parent contacts',
        variant: 'destructive',
      })
    } else {
      const mapped = (contactsRes.data || []).map((c: any) => ({
        id: c.id,
        student_id: c.student_id,
        email: c.email,
        telegram_chat_id: c.telegram_chat_id,
        whatsapp_no: c.whatsapp_no,
        verification_token: c.verification_token,
        matric_no: c.student?.matric_no,
        full_name: c.student?.full_name,
      }))
      setContacts(mapped)
    }

    if (studentsRes.error) {
      console.error('Error fetching students:', studentsRes.error)
    } else {
      setStudents(studentsRes.data || [])
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleSave = async () => {
    if (!selectedStudentId) return

    // Validate at least one contact method is provided
    if (!email && !whatsappNo) {
      toast({
        title: 'Validation Error',
        description: 'Please provide at least one contact method (email or WhatsApp). Telegram will be linked via bot.',
        variant: 'destructive',
      })
      return
    }

    setSaving(true)
    const { error } = await supabase
      .from('parent_contacts')
      .upsert({
        student_id: selectedStudentId,
        email: email || null,
        whatsapp_no: whatsappNo || null,
      }, { onConflict: 'student_id' })

    if (error) {
      console.error('Error saving contact:', error)
      toast({
        title: 'Error',
        description: 'Failed to save contact. Please try again.',
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
    setEmail('')
    setWhatsappNo('')
    setEditingContact(null)
  }

  const handleEdit = (contact: ParentContact) => {
    setEditingContact(contact)
    setSelectedStudentId(contact.student_id)
    setEmail(contact.email || '')
    setWhatsappNo(contact.whatsapp_no || '')
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDelete = async (contact: ParentContact) => {
    if (!confirm(`Delete contact for ${contact.full_name} (${contact.matric_no})?`)) {
      return
    }

    const { error } = await supabase
      .from('parent_contacts')
      .delete()
      .eq('id', contact.id)

    if (error) {
      console.error('Error deleting contact:', error)
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
      const newContacts: { matric_no: string; email?: string }[] = []
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
          if (matric && /^\d{11}$/.test(matric)) {
            const studentId = studentMap.get(matric)
            if (studentId) {
              newContacts.push({
                matric_no: matric,
                email,
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

      // Insert contacts
      let inserted = 0
      let updated = 0
      let failed = 0

      for (let i = 0; i < newContacts.length; i++) {
        const contact = newContacts[i]
        const studentId = studentMap.get(contact.matric_no)
        if (!studentId) continue

        const { error } = await supabase
          .from('parent_contacts')
          .upsert({
            student_id: studentId,
            email: contact.email || null,
            telegram_id: contact.telegram_id || null,
          }, { onConflict: 'student_id' })

        if (error) {
          failed++
          errors.push(`${contact.matric_no}: ${error.message}`)
        } else {
          // Check if it was an insert or update by checking if contact already existed
          const existingContact = contacts.find(c => c.student_id === studentId)
          if (existingContact) {
            updated++
          } else {
            inserted++
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

      if (errors.length > 0) {
        console.error('CSV import errors:', errors)
      }

      setTimeout(() => setUploadProgress([]), 5000)
    }

    reader.onerror = () => {
      setUploadProgress([{ file: file.name, status: 'error', progress: 100, message: 'Failed to read file' }])
    }

    reader.readAsText(file)
    e.target.value = ''
  }

  const downloadTemplate = () => {
    const csvContent = 'matric_no,email,telegram_id\n19010301081,parent@email.com,@telegramuser'
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
                  <li>Header row is optional</li>
                </ul>
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
                <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                  <Mail className="h-4 w-4 text-mtu-purple" />
                  Email
                </label>
                <Input
                  type="email"
                  placeholder="parent@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11"
                />
                <p className="text-xs text-slate-500">Telegram will be linked via bot invitation link</p>
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
                <p className="text-xs text-slate-500">Include country code (e.g., +234 for Nigeria)</p>
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
                    <TableHead className="font-semibold text-slate-700">Email</TableHead>
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
                        {getChannelIcon(contact.email, 'email')}
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
                      <TableCell colSpan={6} className="text-center py-12">
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
