"use client"

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Loader2,
  Settings,
  Cloud,
  CloudOff,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Clock,
  Shield,
  History,
  Save,
  Link2
} from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'

export interface PortalConfig {
  id: string
  base_url: string
  api_endpoint: string
  encrypted_username?: string
  encrypted_password?: string
  api_key?: string
  sync_enabled: boolean
  sync_interval_minutes: number
  auto_dispatch_enabled: boolean
  last_sync_at: string | null
  last_sync_status: string | null
  last_sync_message: string | null
}

interface SyncLog {
  id: string
  started_at: string
  completed_at: string | null
  status: 'running' | 'success' | 'partial' | 'error'
  students_fetched: number
  results_fetched: number
  results_new: number
  results_dispatched: number
  errors: string | null
}

export default function PortalSettingsPage() {
  const { toast } = useToast()
  const { user } = useAuth()
  const isAdmin = user?.user_metadata?.role === 'admin'

  const [config, setConfig] = useState<PortalConfig | null>(null)
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)

  // Form state
  const [baseUrl, setBaseUrl] = useState('https://student.mtu.edu.ng')
  const [apiEndpoint, setApiEndpoint] = useState('/api/results')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [syncEnabled, setSyncEnabled] = useState(false)
  const [syncInterval, setSyncInterval] = useState(60)
  const [autoDispatch, setAutoDispatch] = useState(true)

  const fetchConfig = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('portal_config')
        .select('*')
        .single()

      if (error) {
        console.error('Error fetching portal config:', error)
        toast({
          title: 'Error loading config',
          description: error.message,
          variant: 'destructive',
        })
        return
      }

      if (data) {
        setConfig(data)
        setBaseUrl(data.base_url)
        setApiEndpoint(data.api_endpoint)
        setApiKey(data.api_key || '')
        setSyncEnabled(data.sync_enabled)
        setSyncInterval(data.sync_interval_minutes)
        setAutoDispatch(data.auto_dispatch_enabled)
      }
    } catch (err) {
      console.error('Error fetching config:', err)
    }
  }, [toast])

  const fetchSyncLogs = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('portal_sync_logs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(10)

      if (error) {
        console.error('Error fetching sync logs:', error)
        return
      }

      setSyncLogs(data || [])
    } catch (err) {
      console.error('Error fetching sync logs:', err)
    }
  }, [])

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      await Promise.all([fetchConfig(), fetchSyncLogs()])
      setLoading(false)
    }
    loadData()
  }, [fetchConfig, fetchSyncLogs])

  const handleSave = async () => {
    if (!isAdmin) {
      toast({
        title: 'Access denied',
        description: 'Only admins can modify portal settings.',
        variant: 'destructive',
      })
      return
    }

    setSaving(true)

    try {
      // Get encryption key from env (in production, this would be handled securely)
      const { data: encryptionData } = await supabase.functions.invoke('get-encryption-key', {
        body: {}
      }).catch(() => ({ data: null }))

      const encryptionKey = encryptionData?.key || ''

      // Encrypt credentials if provided
      let encryptedUsername = config?.encrypted_username
      let encryptedPassword = config?.encrypted_password

      if (username && encryptionKey) {
        const { data: encrypted } = await supabase.rpc('encrypt_credential', {
          credential: username,
          key: encryptionKey
        })
        encryptedUsername = encrypted
      }

      if (password && encryptionKey) {
        const { data: encrypted } = await supabase.rpc('encrypt_credential', {
          credential: password,
          key: encryptionKey
        })
        encryptedPassword = encrypted
      }

      const { error } = await supabase
        .from('portal_config')
        .update({
          base_url: baseUrl,
          api_endpoint: apiEndpoint,
          encrypted_username: encryptedUsername,
          encrypted_password: encryptedPassword,
          api_key: apiKey || null,
          sync_enabled: syncEnabled,
          sync_interval_minutes: syncInterval,
          auto_dispatch_enabled: autoDispatch,
          updated_at: new Date().toISOString(),
        })
        .eq('id', config?.id)

      if (error) {
        throw error
      }

      toast({
        title: 'Settings saved',
        description: 'Portal configuration has been updated.',
        variant: 'success',
      })

      // Clear password field after save
      setPassword('')
      await fetchConfig()
    } catch (error: any) {
      console.error('Error saving config:', error)
      toast({
        title: 'Error saving settings',
        description: error.message || 'Failed to save configuration.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleManualSync = async () => {
    setSyncing(true)

    try {
      const { data, error } = await supabase.functions.invoke('fetch-portal-data', {
        body: {}
      })

      if (error) {
        throw new Error(error.message)
      }

      toast({
        title: data.success ? 'Sync completed' : 'Sync failed',
        description: data.stats
          ? `Fetched ${data.stats.studentsFetched} students, ${data.stats.newResults} new results, ${data.stats.dispatched} dispatched`
          : data.message || data.error,
        variant: data.success ? 'success' : 'destructive',
      })

      await fetchSyncLogs()
      await fetchConfig()
    } catch (error: any) {
      console.error('Error during sync:', error)
      toast({
        title: 'Sync failed',
        description: error.message || 'Failed to sync with portal.',
        variant: 'destructive',
      })
    } finally {
      setSyncing(false)
    }
  }

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case 'success':
        return <Badge className="bg-mtu-green-100 text-mtu-green-dark"><CheckCircle2 className="h-3 w-3 mr-1" />Success</Badge>
      case 'partial':
        return <Badge className="bg-amber-100 text-amber-700"><AlertCircle className="h-3 w-3 mr-1" />Partial</Badge>
      case 'error':
        return <Badge className="bg-red-100 text-red-700"><AlertCircle className="h-3 w-3 mr-1" />Error</Badge>
      case 'running':
        return <Badge className="bg-blue-100 text-blue-700"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Running</Badge>
      default:
        return <Badge variant="secondary">Never</Badge>
    }
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never'
    return new Date(dateStr).toLocaleString()
  }

  const formatRelativeTime = (dateStr: string | null) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-mtu-purple" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Settings className="h-6 w-6 text-mtu-green" />
            Portal Integration
          </h1>
          <p className="text-slate-500 mt-1">
            Configure automatic fetching from MTU student portal
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            onClick={handleManualSync}
            disabled={syncing || !syncEnabled}
            variant="outline"
            className="border-mtu-green text-mtu-green hover:bg-mtu-green-50"
          >
            {syncing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            {syncing ? 'Syncing...' : 'Sync Now'}
          </Button>
        </div>
      </div>

      {/* Sync Status Card */}
      <Card className="border-mtu-green-100">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Cloud className="h-5 w-5 text-mtu-green" />
            Sync Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 bg-slate-50 rounded-lg">
              <p className="text-sm font-medium text-slate-500">Status</p>
              <div className="mt-1">
                {syncEnabled ? (
                  <span className="inline-flex items-center gap-1.5 text-mtu-green font-medium">
                    <Cloud className="h-4 w-4" />
                    Enabled
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-slate-500 font-medium">
                    <CloudOff className="h-4 w-4" />
                    Disabled
                  </span>
                )}
              </div>
            </div>
            <div className="p-4 bg-slate-50 rounded-lg">
              <p className="text-sm font-medium text-slate-500">Last Sync</p>
              <p className="mt-1 font-medium text-slate-900">
                {formatDate(config?.last_sync_at ?? null)}
              </p>
              {config?.last_sync_at && (
                <p className="text-xs text-slate-400">{formatRelativeTime(config?.last_sync_at ?? null)}</p>
              )}
            </div>
            <div className="p-4 bg-slate-50 rounded-lg">
              <p className="text-sm font-medium text-slate-500">Result</p>
              <div className="mt-1">
                {getStatusBadge(config?.last_sync_status ?? null)}
              </div>
            </div>
            <div className="p-4 bg-slate-50 rounded-lg">
              <p className="text-sm font-medium text-slate-500">Auto Dispatch</p>
              <p className="mt-1 font-medium text-slate-900">
                {autoDispatch ? 'Enabled' : 'Disabled'}
              </p>
              <p className="text-xs text-slate-400">
                {autoDispatch ? 'Results sent immediately' : 'Manual dispatch only'}
              </p>
            </div>
          </div>
          {config?.last_sync_message && (
            <div className="mt-4 p-3 bg-slate-50 rounded-lg text-sm text-slate-600">
              <span className="font-medium">Last message:</span> {config.last_sync_message}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Configuration Form */}
      <Card className={isAdmin ? 'border-mtu-purple-200' : 'border-slate-200'}>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Shield className="h-5 w-5 text-mtu-purple" />
            Portal Configuration
            {!isAdmin && (
              <Badge variant="secondary" className="ml-2 text-xs">View Only</Badge>
            )}
          </CardTitle>
          <CardDescription>
            Configure connection to MTU student portal. Only administrators can modify these settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Portal URL Settings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Portal Base URL</label>
              <Input
                type="url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                disabled={!isAdmin}
                placeholder="https://student.mtu.edu.ng"
                className="h-11"
              />
              <p className="text-xs text-slate-400">The base URL of the MTU student portal</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Results API Endpoint</label>
              <Input
                type="text"
                value={apiEndpoint}
                onChange={(e) => setApiEndpoint(e.target.value)}
                disabled={!isAdmin}
                placeholder="/api/results"
                className="h-11"
              />
              <p className="text-xs text-slate-400">API endpoint for fetching results</p>
            </div>
          </div>

          {/* Credentials */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Portal Username</label>
              <Input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={!isAdmin}
                placeholder={config?.encrypted_username ? '••••••••' : 'Enter username'}
                className="h-11"
              />
              <p className="text-xs text-slate-400">Leave blank to keep existing</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Portal Password</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={!isAdmin}
                placeholder={config?.encrypted_password ? '••••••••' : 'Enter password'}
                className="h-11"
              />
              <p className="text-xs text-slate-400">Leave blank to keep existing</p>
            </div>
          </div>

          {/* API Key (optional) */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">API Key (Optional)</label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              disabled={!isAdmin}
              placeholder="Enter API key if required by portal"
              className="h-11"
            />
            <p className="text-xs text-slate-400">Some portals require an API key for access</p>
          </div>

          {/* Sync Settings */}
          <div className="border-t pt-6 space-y-4">
            <h3 className="font-medium text-slate-900">Sync Settings</h3>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-slate-700">Enable Automatic Sync</p>
                <p className="text-sm text-slate-500">Automatically fetch data from portal</p>
              </div>
              <Switch
                checked={syncEnabled}
                onCheckedChange={setSyncEnabled}
                disabled={!isAdmin}
              />
            </div>

            {syncEnabled && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-4 border-l-2 border-mtu-green-200">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Sync Interval (minutes)</label>
                  <Input
                    type="number"
                    min={5}
                    max={1440}
                    value={syncInterval}
                    onChange={(e) => setSyncInterval(parseInt(e.target.value) || 60)}
                    disabled={!isAdmin}
                    className="h-11"
                  />
                  <p className="text-xs text-slate-400">How often to check for new results (min: 5)</p>
                </div>

                <div className="flex items-center justify-between py-2">
                  <div>
                    <p className="font-medium text-slate-700">Auto Dispatch Results</p>
                    <p className="text-sm text-slate-500">Send to parents immediately when found</p>
                  </div>
                  <Switch
                    checked={autoDispatch}
                    onCheckedChange={setAutoDispatch}
                    disabled={!isAdmin}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Save Button */}
          {isAdmin && (
            <div className="flex justify-end pt-4">
              <Button
                onClick={handleSave}
                disabled={saving}
                className="bg-mtu-green hover:bg-mtu-green-dark text-white"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Configuration
                  </>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sync History */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <History className="h-5 w-5 text-mtu-purple" />
            Sync History
          </CardTitle>
          <CardDescription>
            Recent portal synchronization attempts
          </CardDescription>
        </CardHeader>
        <CardContent>
          {syncLogs.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <Clock className="h-12 w-12 mx-auto mb-3 text-slate-300" />
              <p>No sync history yet</p>
              <p className="text-sm text-slate-400">Sync operations will appear here</p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 hover:bg-slate-50">
                    <TableHead className="font-semibold text-slate-700">Time</TableHead>
                    <TableHead className="font-semibold text-slate-700">Status</TableHead>
                    <TableHead className="font-semibold text-slate-700">Students</TableHead>
                    <TableHead className="font-semibold text-slate-700">Results</TableHead>
                    <TableHead className="font-semibold text-slate-700">Dispatched</TableHead>
                    <TableHead className="font-semibold text-slate-700">Duration</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {syncLogs.map((log) => (
                    <TableRow key={log.id} className="hover:bg-slate-50/50">
                      <TableCell className="text-slate-600 text-sm">
                        {new Date(log.started_at).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(log.status)}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {log.students_fetched}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        <span className={log.results_new > 0 ? 'font-medium text-mtu-green' : ''}>
                          {log.results_new > 0 ? `${log.results_new} new / ` : ''}
                          {log.results_fetched}
                        </span>
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {log.results_dispatched > 0 ? (
                          <span className="inline-flex items-center gap-1 text-mtu-green">
                            <CheckCircle2 className="h-3 w-3" />
                            {log.results_dispatched}
                          </span>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell className="text-slate-600 text-sm">
                        {log.completed_at ? (
                          `${Math.round((new Date(log.completed_at).getTime() - new Date(log.started_at).getTime()) / 1000)}s`
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="bg-blue-50 border-blue-100">
        <CardContent className="p-4">
          <div className="flex gap-3">
            <Link2 className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-blue-900">How it works</p>
              <ul className="mt-2 text-sm text-blue-700 space-y-1">
                <li>• The system periodically checks the MTU student portal for new results</li>
                <li>• Only senate-approved results are fetched (they're already approved on the portal)</li>
                <li>• When auto-dispatch is enabled, results are immediately sent to parents</li>
                <li>• You can always trigger a manual sync using the &quot;Sync Now&quot; button</li>
                <li>• Results are tagged with source=&quot;portal&quot; for tracking</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
