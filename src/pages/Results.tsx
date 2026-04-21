"use client"

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Loader2, FileText, Inbox, ExternalLink, Download, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface StudentResult {
  id: string
  student_id: string
  matric_no: string
  full_name: string
  pdf_url: string | null
  is_senate_approved: boolean
  created_at: string
}

export default function ResultsPage() {
  const [results, setResults] = useState<StudentResult[]>([])
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()

  const fetchResults = useCallback(async () => {
    // Fetch results and students separately to avoid foreign key join issues
    const [{ data: resultsData, error: resultsError }, { data: studentsData, error: _studentsError }] = await Promise.all([
      supabase
        .from('results')
        .select('id, student_id, pdf_url, is_senate_approved, created_at')
        .order('created_at', { ascending: false }),
      supabase
        .from('students')
        .select('id, matric_no, full_name')
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
        is_senate_approved: r.is_senate_approved,
        created_at: r.created_at,
        matric_no: student?.matric_no ?? 'N/A',
        full_name: student?.full_name ?? 'Unknown Student',
      }
    })

    setResults(mapped)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchResults()

    // Subscribe to results changes for realtime updates
    const channel = supabase
      .channel('results_changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'results' },
        () => fetchResults()
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [fetchResults])

  const handleView = async (pdfUrl: string | null, _matricNo: string) => {
    if (!pdfUrl) return

    // Extract file path from URL
    const pathMatch = pdfUrl.match(/\/result_pdfs\/(.+)$/)
    if (!pathMatch) {
      toast({
        title: 'Error',
        description: 'Invalid PDF URL',
        variant: 'destructive',
      })
      return
    }

    const filePath = pathMatch[1]
    const { data, error } = await supabase.storage
      .from('result_pdfs')
      .createSignedUrl(filePath, 3600) // 1 hour

    if (error || !data?.signedUrl) {
      toast({
        title: 'Error',
        description: 'Failed to generate view link: ' + (error?.message || 'Unknown error'),
        variant: 'destructive',
      })
      return
    }

    window.open(data.signedUrl, '_blank')
  }

  const handleDownload = async (pdfUrl: string | null, matricNo: string) => {
    if (!pdfUrl) return

    // Extract file path from URL
    const pathMatch = pdfUrl.match(/\/result_pdfs\/(.+)$/)
    if (!pathMatch) {
      toast({
        title: 'Error',
        description: 'Invalid PDF URL',
        variant: 'destructive',
      })
      return
    }

    const filePath = pathMatch[1]
    const { data, error } = await supabase.storage
      .from('result_pdfs')
      .createSignedUrl(filePath, 3600) // 1 hour

    if (error || !data?.signedUrl) {
      toast({
        title: 'Error',
        description: 'Failed to generate download link: ' + (error?.message || 'Unknown error'),
        variant: 'destructive',
      })
      return
    }

    try {
      // Fetch the file as a blob to create a same-origin URL
      const response = await fetch(data.signedUrl)
      const blob = await response.blob()
      const blobUrl = URL.createObjectURL(blob)

      const link = document.createElement('a')
      link.href = blobUrl
      link.download = `${matricNo}_result.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      URL.revokeObjectURL(blobUrl)
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to download file: ' + (err instanceof Error ? err.message : 'Unknown error'),
        variant: 'destructive',
      })
    }
  }

  const handleDelete = async (resultId: string, matricNo: string) => {
    if (!window.confirm(`Are you sure you want to delete the result for student ${matricNo}? This will also delete the PDF file from storage.`)) {
      return
    }

    const { error } = await supabase
      .from('results')
      .delete()
      .eq('id', resultId)

    if (error) {
      toast({
        title: 'Delete failed',
        description: `Failed to delete result: ${error.message || 'Database error occurred'}. Please try again.`,
        variant: 'destructive',
      })
    } else {
      await fetchResults()
      toast({
        title: 'Result deleted',
        description: 'Result and associated PDF deleted successfully.',
        variant: 'success',
      })
    }
  }

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Results</h1>
        <p className="text-slate-500 mt-1">
          View all uploaded student result PDFs
        </p>
      </div>

      {/* Results Table */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="h-5 w-5 text-mtu-green" />
            All Results
          </CardTitle>
          <CardDescription>
            List of all result PDFs in the system
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
                    <TableHead className="font-semibold text-slate-700">Senate Status</TableHead>
                    <TableHead className="font-semibold text-slate-700">Upload Date</TableHead>
                    <TableHead className="font-semibold text-slate-700">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((result) => (
                    <TableRow key={result.id} className="hover:bg-slate-50/50">
                      <TableCell className="font-mono text-sm text-slate-600">
                        {result.matric_no}
                      </TableCell>
                      <TableCell className="font-medium text-slate-900">
                        {result.full_name}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                          result.is_senate_approved
                            ? 'bg-mtu-green-100 text-mtu-green-dark'
                            : 'bg-amber-50 text-amber-600'
                        }`}>
                          {result.is_senate_approved ? 'Approved' : 'Pending'}
                        </span>
                      </TableCell>
                      <TableCell className="text-slate-600 text-sm">
                        {new Date(result.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        {result.pdf_url ? (
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 text-mtu-green hover:bg-mtu-green-50"
                              onClick={() => handleView(result.pdf_url, result.matric_no)}
                            >
                              <ExternalLink className="h-4 w-4 mr-1" />
                              View
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 text-mtu-purple hover:bg-mtu-purple-50"
                              onClick={() => handleDownload(result.pdf_url, result.matric_no)}
                            >
                              <Download className="h-4 w-4 mr-1" />
                              Download
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(result.id, result.matric_no)}
                              className="h-8 text-red-500 hover:text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-sm">No PDF</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {results.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-12">
                        <div className="flex flex-col items-center gap-3">
                          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                            <Inbox className="h-6 w-6 text-slate-400" />
                          </div>
                          <p className="text-slate-500 font-medium">No results found</p>
                          <p className="text-sm text-slate-400">Upload PDF files from the Dashboard</p>
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
