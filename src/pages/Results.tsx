"use client"

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Loader2, FileText, Inbox, ExternalLink, Download } from 'lucide-react'
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

  const fetchResults = useCallback(async () => {
    const { data, error } = await supabase
      .from('results')
      .select(`
        id,
        student_id,
        pdf_url,
        is_senate_approved,
        created_at,
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
      created_at: r.created_at,
      matric_no: r.student?.matric_no,
      full_name: r.student?.full_name,
    }))

    setResults(mapped)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchResults()
  }, [fetchResults])

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
                              onClick={() => window.open(result.pdf_url!, '_blank')}
                            >
                              <ExternalLink className="h-4 w-4 mr-1" />
                              View
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 text-mtu-purple hover:bg-mtu-purple-50"
                              onClick={() => {
                                const link = document.createElement('a')
                                link.href = result.pdf_url!
                                link.download = `${result.matric_no}_result.pdf`
                                link.click()
                              }}
                            >
                              <Download className="h-4 w-4 mr-1" />
                              Download
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
