"use client"

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Loader2,
  Users,
  Inbox,
  Plus,
  Upload,
  X,
  FileText,
  CheckCircle2,
  Clock,
  Mail,
  AlertCircle,
  Search,
  Trash2,
  Download,
  Pencil
} from 'lucide-react'

interface Student {
  id: string
  matric_no: string
  full_name: string
  programme?: string
  level?: number
  created_at: string
  has_result?: boolean
  has_parent_contact?: boolean
}

interface UploadProgress {
  file: string
  status: 'parsing' | 'complete' | 'error'
  progress: number
  message?: string
}

export default function StudentsPage() {
  const { toast } = useToast()
  const [students, setStudents] = useState<Student[]>([])
  const [filteredStudents, setFilteredStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [showBulkForm, setShowBulkForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([])
  const [searchQuery, setSearchQuery] = useState('')

  // Form state
  const [matricNo, setMatricNo] = useState('')
  const [fullName, setFullName] = useState('')
  const [programme, setProgramme] = useState('')
  const [level, setLevel] = useState('')
  const [editingStudent, setEditingStudent] = useState<Student | null>(null)

  const fetchStudents = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('students')
        .select('id, matric_no, full_name, programme, level, created_at')
        .order('created_at', { ascending: false })

      if (error) {
        toast({
          title: 'Error loading students',
          description: error.message || 'Failed to fetch students. Please try again.',
          variant: 'destructive',
        })
        return
      }

      // Fetch results to check which students have results
      const { data: resultsData } = await supabase
        .from('results')
        .select('student_id')

      // Fetch parent contacts to check which students have contacts
      const { data: contactsData } = await supabase
        .from('parent_contacts')
        .select('student_id')

      const studentsWithStatus = (data || []).map((student: Student) => ({
        ...student,
        has_result: resultsData?.some(r => r.student_id === student.id) || false,
        has_parent_contact: contactsData?.some(c => c.student_id === student.id) || false,
      }))

      setStudents(studentsWithStatus)
      setFilteredStudents(studentsWithStatus)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStudents()

    // Subscribe to students changes for realtime updates
    const channel = supabase
      .channel('students_changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'students' },
        () => fetchStudents()
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [fetchStudents])

  useEffect(() => {
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      setFilteredStudents(
        students.filter(
          s =>
            s.matric_no.toLowerCase().includes(query) ||
            s.full_name.toLowerCase().includes(query) ||
            (s.programme && s.programme.toLowerCase().includes(query)) ||
            (s.level && s.level.toString().includes(query))
        )
      )
    } else {
      setFilteredStudents(students)
    }
  }, [searchQuery, students])

  const handleSave = async () => {
    if (!matricNo.trim() || !fullName.trim()) {
      toast({
        title: 'Missing fields',
        description: 'Please fill in all fields.',
        variant: 'destructive',
      })
      return
    }

    // Validate matric number format (11 digits)
    if (!/^\d{11}$/.test(matricNo.trim())) {
      toast({
        title: 'Invalid matric number',
        description: 'Matric number must be 11 digits (e.g., 19010301081).',
        variant: 'destructive',
      })
      return
    }

    setSaving(true)

    if (editingStudent) {
      // Update existing student
      const { error } = await supabase
        .from('students')
        .update({
          matric_no: matricNo.trim(),
          full_name: fullName.trim(),
          programme: programme.trim() || null,
          level: level ? parseInt(level, 10) : null,
        })
        .eq('id', editingStudent.id)

      if (error) {
        console.error('Error updating student:', error)
        if (error.code === '23505') {
          toast({
            title: 'Duplicate entry',
            description: 'A student with this matric number already exists.',
            variant: 'destructive',
          })
        } else {
          toast({
            title: 'Error',
            description: 'Failed to update student. Please try again.',
            variant: 'destructive',
          })
        }
      } else {
        setShowForm(false)
        resetForm()
        await fetchStudents()
        toast({
          title: 'Student updated',
          description: 'Student updated successfully!',
          variant: 'success',
        })
      }
    } else {
      // Insert new student
      const { error } = await supabase
        .from('students')
        .insert({
          matric_no: matricNo.trim(),
          full_name: fullName.trim(),
          programme: programme.trim() || null,
          level: level ? parseInt(level, 10) : null,
        })

      if (error) {
        if (error.code === '23505') {
          toast({
            title: 'Duplicate entry',
            description: 'A student with this matric number already exists.',
            variant: 'destructive',
          })
        } else {
          toast({
            title: 'Error',
            description: 'Failed to save student. Please try again.',
            variant: 'destructive',
          })
        }
      } else {
        setShowForm(false)
        resetForm()
        await fetchStudents()
        toast({
          title: 'Student added',
          description: 'Student added successfully!',
          variant: 'success',
        })
      }
    }
    setSaving(false)
  }

  const handleDelete = async (studentId: string, matricNo: string) => {
    if (!window.confirm(`Are you sure you want to delete student ${matricNo}? This will also delete their results and parent contacts.`)) {
      return
    }

    // Clean up PDF files from storage before deleting the student
    // This prevents orphaned files in storage
    try {
      const { error: cleanupError } = await supabase.functions.invoke('cleanup-storage', {
        body: { studentId, mode: 'single' }
      })
      if (cleanupError) {
        toast({
          title: 'Storage cleanup warning',
          description: 'Could not clean up associated PDF files from storage. The student record will still be deleted, but some files may remain in storage.',
          variant: 'destructive',
        })
      }
    } catch {
      toast({
        title: 'Storage service unavailable',
        description: 'The storage cleanup service is currently unavailable (CORS or network error). The student record will still be deleted.',
        variant: 'destructive',
      })
    }

    const { error } = await supabase
      .from('students')
      .delete()
      .eq('id', studentId)

    if (error) {
      toast({
        title: 'Delete failed',
        description: `Failed to delete student: ${error.message || 'Database error occurred'}. Please try again.`,
        variant: 'destructive',
      })
    } else {
      await fetchStudents()
      toast({
        title: 'Student deleted',
        description: 'Student deleted successfully.',
        variant: 'success',
      })
    }
  }

  const resetForm = () => {
    setMatricNo('')
    setFullName('')
    setProgramme('')
    setLevel('')
    setEditingStudent(null)
  }

  const handleEdit = (student: Student) => {
    setEditingStudent(student)
    setMatricNo(student.matric_no)
    setFullName(student.full_name)
    setProgramme(student.programme || '')
    setLevel(student.level?.toString() || '')
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
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
      const students: { matric_no: string; full_name: string; programme?: string; level?: number }[] = []
      const errors: string[] = []

      // Skip header if present
      const startIndex = lines[0]?.toLowerCase().includes('matric') ? 1 : 0

      for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i].trim()
        if (!line) continue

        // Handle both comma and tab separated
        const parts = line.includes('\t') ? line.split('\t') : line.split(',')

        if (parts.length >= 2) {
          const matric = parts[0].trim()
          const name = parts[1].trim()
          const programmeName = parts[2]?.trim() || undefined
          const levelValue = parts[3]?.trim()

          if (matric && name && /^\d{11}$/.test(matric)) {
            const studentData: { matric_no: string; full_name: string; programme?: string; level?: number } = {
              matric_no: matric,
              full_name: name
            }
            if (programmeName) {
              studentData.programme = programmeName
            }
            if (levelValue && /^\d{3,4}$/.test(levelValue)) {
              studentData.level = parseInt(levelValue, 10)
            }
            students.push(studentData)
          } else if (matric) {
            errors.push(`Line ${i + 1}: Invalid matric number "${matric}"`)
          }
        } else {
          errors.push(`Line ${i + 1}: Invalid format`)
        }

        const progress = Math.round(((i - startIndex + 1) / (lines.length - startIndex)) * 50)
        setUploadProgress([{ file: file.name, status: 'parsing', progress }])
      }

      if (students.length === 0) {
        setUploadProgress([{ file: file.name, status: 'error', progress: 100, message: `No valid students found. ${errors.slice(0, 3).join('; ')}` }])
        return
      }

      // Insert students
      let inserted = 0
      let duplicates = 0

      for (let i = 0; i < students.length; i++) {
        const { error } = await supabase.from('students').insert(students[i])
        if (error) {
          if (error.code === '23505') {
            duplicates++
          } else {
            errors.push(`${students[i].matric_no}: ${error.message}`)
          }
        } else {
          inserted++
        }

        const progress = 50 + Math.round(((i + 1) / students.length) * 50)
        setUploadProgress([{ file: file.name, status: 'parsing', progress }])
      }

      setUploadProgress([{
        file: file.name,
        status: errors.length > 0 && inserted === 0 ? 'error' : 'complete',
        progress: 100,
        message: `Inserted: ${inserted}, Duplicates: ${duplicates}${errors.length > 0 ? ', Errors: ' + errors.length : ''}`
      }])

      await fetchStudents()

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
    const csvContent = 'matric_no,full_name,programme,level\n19010301081,John Doe,B.Sc. Computer Science,400\n19010301082,Jane Smith,B.Eng. Electrical Engineering,300'
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'students_template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const stats = {
    total: students.length,
    withResults: students.filter(s => s.has_result).length,
    withContacts: students.filter(s => s.has_parent_contact).length,
    pending: students.filter(s => !s.has_result || !s.has_parent_contact).length,
  }

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Student Management</h1>
          <p className="text-slate-500 mt-1">
            Add and manage students in the system
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
            {showForm ? 'Cancel' : 'Add Student'}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-mtu-green-100">
          <CardContent className="p-4">
            <p className="text-sm font-medium text-slate-500">Total Students</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{stats.total}</p>
          </CardContent>
        </Card>
        <Card className="border-mtu-purple-100">
          <CardContent className="p-4">
            <p className="text-sm font-medium text-slate-500">With Results</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{stats.withResults}</p>
          </CardContent>
        </Card>
        <Card className="border-blue-100">
          <CardContent className="p-4">
            <p className="text-sm font-medium text-slate-500">With Parent Contacts</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{stats.withContacts}</p>
          </CardContent>
        </Card>
        <Card className="border-amber-100">
          <CardContent className="p-4">
            <p className="text-sm font-medium text-slate-500">Pending Setup</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{stats.pending}</p>
          </CardContent>
        </Card>
      </div>

      {/* Add Student Form */}
      {showForm && (
        <Card className="border-mtu-green-200">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              {editingStudent ? (
                <Pencil className="h-5 w-5 text-mtu-green" />
              ) : (
                <Plus className="h-5 w-5 text-mtu-green" />
              )}
              {editingStudent ? 'Edit Student' : 'Add New Student'}
            </CardTitle>
            <CardDescription>
              {editingStudent
                ? 'Update the student\'s matriculation number and full name'
                : "Enter the student's matriculation number and full name"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Matric Number</label>
                <Input
                  type="text"
                  placeholder="19010301081"
                  value={matricNo}
                  onChange={(e) => setMatricNo(e.target.value)}
                  className="h-11"
                  maxLength={11}
                />
                <p className="text-xs text-slate-400">11 digits required (e.g., 19010301081)</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Full Name</label>
                <Input
                  type="text"
                  placeholder="John Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Programme (Optional)</label>
                <Input
                  type="text"
                  placeholder="B.Sc. Computer Science"
                  value={programme}
                  onChange={(e) => setProgramme(e.target.value)}
                  className="h-11"
                  maxLength={100}
                />
                <p className="text-xs text-slate-400">e.g., B.Sc. Computer Science, B.Eng. Electrical Engineering</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Level (Optional)</label>
                <Input
                  type="number"
                  placeholder="400"
                  value={level}
                  onChange={(e) => setLevel(e.target.value)}
                  className="h-11"
                  min={100}
                  max={900}
                  step={100}
                />
                <p className="text-xs text-slate-400">e.g., 100, 200, 300, 400, 500</p>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-4">
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
                disabled={!matricNo.trim() || !fullName.trim() || saving}
                className="bg-mtu-green hover:bg-mtu-green-dark text-white"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {editingStudent ? 'Updating...' : 'Saving...'}
                  </>
                ) : editingStudent ? (
                  'Update Student'
                ) : (
                  'Save Student'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bulk Import Form */}
      {showBulkForm && (
        <Card className="border-mtu-purple-200">
          <CardHeader className="pb-4">
            <CardTitle>Bulk Import Students</CardTitle>
            <div className="text-sm text-slate-600 mt-2">
              <p className="mb-2">Upload a CSV file with the following format:</p>
              <ul className="list-disc list-inside space-y-1 text-xs text-slate-500">
                <li>First column: Matric number (11 digits)</li>
                <li>Second column: Full name</li>
                <li>Third column (optional): Programme (e.g., B.Sc. Computer Science)</li>
                <li>Fourth column (optional): Level (e.g., 400)</li>
                <li>Header row is optional</li>
                <li>Comma or tab separated values</li>
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
          </CardHeader>
          <CardContent className="pt-0">
            <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-mtu-purple transition-colors">
                <input
                  type="file"
                  id="csv-upload"
                  accept=".csv,.txt"
                  className="hidden"
                  onChange={handleCSVUpload}
                />
                <label htmlFor="csv-upload" className="cursor-pointer block">
                  <Upload className="h-10 w-10 text-slate-400 mx-auto mb-3" />
                  <p className="text-slate-700 font-medium">Click to upload CSV file</p>
                  <p className="text-sm text-slate-400 mt-1">or drag and drop here</p>
                </label>
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

      {/* Search and Table */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Users className="h-5 w-5 text-mtu-green" />
                All Students
              </CardTitle>
              <CardDescription>
                {filteredStudents.length} of {students.length} students
              </CardDescription>
            </div>
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                type="text"
                placeholder="Search students..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-10 w-full sm:w-64"
              />
            </div>
          </div>
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
                    <TableHead className="font-semibold text-slate-700">Full Name</TableHead>
                    <TableHead className="font-semibold text-slate-700">Programme</TableHead>
                    <TableHead className="font-semibold text-slate-700">Level</TableHead>
                    <TableHead className="font-semibold text-slate-700">Result</TableHead>
                    <TableHead className="font-semibold text-slate-700">Parent Contact</TableHead>
                    <TableHead className="font-semibold text-slate-700 w-20">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStudents.map((student) => (
                    <TableRow key={student.id} className="hover:bg-slate-50/50">
                      <TableCell className="font-mono text-sm text-slate-600">
                        {student.matric_no}
                      </TableCell>
                      <TableCell className="font-medium text-slate-900">
                        {student.full_name}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {student.programme || '-'}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {student.level ? `${student.level}L` : '-'}
                      </TableCell>
                      <TableCell>
                        {student.has_result ? (
                          <span className="inline-flex items-center gap-1 text-mtu-green text-sm">
                            <CheckCircle2 className="h-4 w-4" />
                            Uploaded
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-slate-400 text-sm">
                            <Clock className="h-4 w-4" />
                            Pending
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {student.has_parent_contact ? (
                          <span className="inline-flex items-center gap-1 text-mtu-green text-sm">
                            <Mail className="h-4 w-4" />
                            Added
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-slate-400 text-sm">
                            <Clock className="h-4 w-4" />
                            Pending
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(student)}
                            className="text-mtu-purple hover:text-mtu-purple-dark"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(student.id, student.matric_no)}
                            className="text-red-500 hover:text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredStudents.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12">
                        <div className="flex flex-col items-center gap-3">
                          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                            <Inbox className="h-6 w-6 text-slate-400" />
                          </div>
                          <p className="text-slate-500 font-medium">
                            {searchQuery ? 'No students match your search' : 'No students found'}
                          </p>
                          <p className="text-sm text-slate-400">
                            {searchQuery ? 'Try a different search term' : 'Add students using the button above'}
                          </p>
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
