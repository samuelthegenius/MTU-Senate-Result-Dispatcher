"use client"

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AlertCircle, AlertTriangle, CheckCircle, Loader2, Users, UserPlus, Mail, Shield, Crown } from 'lucide-react'
import type { Staff, Invite } from '@/types'

export default function AdminPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [staff, setStaff] = useState<Staff[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [loading, setLoading] = useState(true)
  const [newStaffEmail, setNewStaffEmail] = useState('')
  const [newStaffRole, setNewStaffRole] = useState<'admin' | 'staff'>('staff')
  const [inviteFormLoading, setInviteFormLoading] = useState(false)
  const [managingStaffLoading, setManagingStaffLoading] = useState<Record<string, boolean>>({})

  // Check if user is admin
  const isAdmin = user?.user_metadata?.role === 'admin' || 
                  staff.some(staffMember => staffMember.email === user?.email && staffMember.role === 'admin')

  // Check if current user is the only active admin (prevents self-lockout)
  const isOnlyActiveAdmin = (staffEmail: string) => {
    if (staffEmail !== user?.email) return false
    const activeAdmins = staff.filter(s => s.role === 'admin' && s.is_active)
    return activeAdmins.length === 1
  }

  useEffect(() => {
    if (isAdmin) {
      fetchStaff()
      fetchInvites()
    }
  }, [isAdmin])

  const fetchStaff = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('staff')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setStaff(data || [])
    } catch (error: any) {
      console.error('Error fetching staff:', error)
      toast({
        title: 'Error loading staff',
        description: error?.message || 'Failed to fetch staff data. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchInvites = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('invites')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setInvites(data || [])
    } catch (error: any) {
      console.error('Error fetching invites:', error)
      toast({
        title: 'Error loading invites',
        description: error?.message || 'Failed to fetch invitations. Please try again.',
        variant: 'destructive',
      })
    }
  }, [])

  const handleCreateInvite = async () => {
    if (!newStaffEmail.trim()) return

    setInviteFormLoading(true)
    try {
      const { data, error } = await supabase
        .from('invites')
        .insert({
          email: newStaffEmail.toLowerCase().trim(),
          role: newStaffRole,
          created_by: user?.id
        })
        .select()
        .single()

      if (error) throw error

      // Reset form
      setNewStaffEmail('')
      setNewStaffRole('staff')
      
      // Refresh invites
      await fetchInvites()
      
      toast({
        title: 'Invitation sent',
        description: `Invitation sent to ${newStaffEmail}`,
        variant: 'success',
      })
    } catch (error) {
      console.error('Error creating invite:', error)
      toast({
        title: 'Error',
        description: 'Failed to create invitation. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setInviteFormLoading(false)
    }
  }

  const handleToggleStaffStatus = async (staffId: string, isActive: boolean) => {
    setManagingStaffLoading(prev => ({
      ...prev,
      [staffId]: true
    }))

    try {
      const { error } = await supabase
        .from('staff')
        .update({ is_active: !isActive })
        .eq('id', staffId)

      if (error) throw error
      
      // Update local state
      setStaff(prev => 
        prev.map(staffMember => 
          staffMember.id === staffId ? { ...staffMember, is_active: !isActive } : staffMember
        )
      )
    } catch (error) {
      console.error('Error updating staff status:', error)
      toast({
        title: 'Error',
        description: 'Failed to update staff status. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setManagingStaffLoading(prev => ({
        ...prev,
        [staffId]: false
      }))
    }
  }

  const handleChangeStaffRole = async (staffId: string, newRole: 'admin' | 'staff') => {
    setManagingStaffLoading(prev => ({
      ...prev,
      [staffId]: true
    }))

    try {
      const { error } = await supabase
        .from('staff')
        .update({ role: newRole })
        .eq('id', staffId)

      if (error) throw error
      
      // Update local state
      setStaff(prev => 
        prev.map(staffMember => 
          staffMember.id === staffId ? { ...staffMember, role: newRole } : staffMember
        )
      )
    } catch (error) {
      console.error('Error updating staff role:', error)
      toast({
        title: 'Error',
        description: 'Failed to update staff role. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setManagingStaffLoading(prev => ({
        ...prev,
        [staffId]: false
      }))
    }
  }

  const handleRevokeInvite = async (inviteId: string) => {
    if (!window.confirm('Are you sure you want to revoke this invitation?')) return

    try {
      const { error } = await supabase
        .from('invites')
        .delete()
        .eq('id', inviteId)

      if (error) throw error
      
      // Update local state
      setInvites(prev => prev.filter(invite => invite.id !== inviteId))
      
      toast({
        title: 'Invitation revoked',
        description: 'Invitation revoked successfully.',
        variant: 'success',
      })
    } catch (error) {
      console.error('Error revoking invite:', error)
      toast({
        title: 'Error',
        description: 'Failed to revoke invitation. Please try again.',
        variant: 'destructive',
      })
    }
  }

  if (!isAdmin) {
    return (
      <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-20 h-20 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
            <Shield className="h-10 w-10 text-red-500" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Access Denied</h2>
          <p className="mt-2 text-slate-600">You don't have permission to access the admin panel.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Shield className="h-6 w-6 text-mtu-purple" />
          Staff Management
        </h1>
        <p className="text-slate-500 mt-1">Manage system access and staff invitations</p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-mtu-green-100">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Total Staff</p>
                <p className="text-3xl font-bold text-slate-900 mt-1">{staff.length}</p>
              </div>
              <div className="p-3 rounded-xl bg-mtu-green-50">
                <Users className="h-5 w-5 text-mtu-green" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-mtu-purple-100">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Administrators</p>
                <p className="text-3xl font-bold text-slate-900 mt-1">
                  {staff.filter(s => s.role === 'admin').length}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-mtu-purple-50">
                <Crown className="h-5 w-5 text-mtu-purple" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-amber-100">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Pending Invites</p>
                <p className="text-3xl font-bold text-slate-900 mt-1">
                  {invites.filter(i => !i.used_at && new Date(i.expires_at) > new Date()).length}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-amber-50">
                <Mail className="h-5 w-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Staff Management Card */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="h-5 w-5 text-mtu-green" />
              All Staff Members
            </CardTitle>
            <CardDescription>View and manage staff accounts and permissions</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-mtu-purple" />
              </div>
            ) : staff.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                  <Users className="h-6 w-6 text-slate-400" />
                </div>
                <p className="text-slate-500 font-medium">No staff members found</p>
                <p className="text-sm text-slate-400 mt-1">Create invitations to add staff</p>
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 hover:bg-slate-50">
                      <TableHead className="font-semibold text-slate-700">Name</TableHead>
                      <TableHead className="font-semibold text-slate-700">Email</TableHead>
                      <TableHead className="font-semibold text-slate-700">Role</TableHead>
                      <TableHead className="font-semibold text-slate-700">Status</TableHead>
                      <TableHead className="font-semibold text-slate-700">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {staff.map((staffMember) => (
                      <TableRow key={staffMember.id} className="hover:bg-slate-50/50">
                        <TableCell className="font-medium text-slate-900">
                          {staffMember.full_name || 'No name provided'}
                        </TableCell>
                        <TableCell className="text-slate-600 text-sm">
                          {staffMember.email}
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full ${
                            staffMember.role === 'admin'
                              ? 'bg-mtu-purple-100 text-mtu-purple-dark'
                              : 'bg-mtu-green-100 text-mtu-green-dark'
                          }`}>
                            {staffMember.role === 'admin' ? (
                              <><Crown className="h-3 w-3" /> Admin</>
                            ) : (
                              <><Users className="h-3 w-3" /> Staff</>
                            )}
                          </span>
                        </TableCell>
                        <TableCell>
                          {staffMember.is_active ? (
                            <span className="inline-flex items-center gap-1 text-mtu-green text-sm">
                              <CheckCircle className="h-4 w-4" /> Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-red-500 text-sm">
                              <AlertCircle className="h-4 w-4" /> Inactive
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {!managingStaffLoading[staffMember.id] ? (
                            <div className="flex gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleChangeStaffRole(staffMember.id, staffMember.role === 'admin' ? 'staff' : 'admin')}
                                disabled={isOnlyActiveAdmin(staffMember.email) && staffMember.role === 'admin'}
                                className={`text-xs h-8 ${
                                  staffMember.role === 'admin'
                                    ? 'text-amber-600 hover:bg-amber-50'
                                    : 'text-mtu-purple hover:bg-mtu-purple-50'
                                }`}
                                title={isOnlyActiveAdmin(staffMember.email) && staffMember.role === 'admin' ? 'Cannot demote yourself as the only active admin' : ''}
                              >
                                {staffMember.role === 'admin' ? 'Demote' : 'Promote'}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleToggleStaffStatus(staffMember.id, staffMember.is_active)}
                                disabled={isOnlyActiveAdmin(staffMember.email)}
                                className={`text-xs h-8 ${
                                  staffMember.is_active
                                    ? 'text-red-500 hover:bg-red-50'
                                    : 'text-mtu-green hover:bg-mtu-green-50'
                                }`}
                                title={isOnlyActiveAdmin(staffMember.email) ? 'Cannot deactivate yourself as the only active admin' : ''}
                              >
                                {staffMember.is_active ? 'Deactivate' : 'Activate'}
                              </Button>
                            </div>
                          ) : (
                            <Loader2 className="h-4 w-4 animate-spin text-mtu-purple" />
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

        {/* Invite Creation Card */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <UserPlus className="h-5 w-5 text-mtu-green" />
              Create Invitation
            </CardTitle>
            <CardDescription>Send access invitation to new staff member</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => {
              e.preventDefault()
              handleCreateInvite()
            }} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="invite-email" className="block text-sm font-medium text-slate-700">
                  Email Address
                </Label>
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="staff@mtu.edu.ng"
                  value={newStaffEmail}
                  onChange={(e) => setNewStaffEmail(e.target.value)}
                  required
                  className="h-11 border-slate-200 focus:border-mtu-green focus:ring-mtu-green/20"
                />
              </div>
              <div className="space-y-2">
                <Label className="block text-sm font-medium text-slate-700">
                  Role
                </Label>
                <div className="grid grid-cols-2 gap-3">
                  <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                    newStaffRole === 'staff'
                      ? 'border-mtu-green bg-mtu-green-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}>
                    <input
                      type="radio"
                      name="invite-role"
                      value="staff"
                      checked={newStaffRole === 'staff'}
                      onChange={(e) => setNewStaffRole(e.target.value as 'staff')}
                      className="sr-only"
                    />
                    <Users className={`h-5 w-5 ${newStaffRole === 'staff' ? 'text-mtu-green' : 'text-slate-400'}`} />
                    <div>
                      <p className={`font-medium text-sm ${newStaffRole === 'staff' ? 'text-mtu-green-dark' : 'text-slate-700'}`}>
                        Staff
                      </p>
                      <p className="text-xs text-slate-400">Standard access</p>
                    </div>
                  </label>
                  <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                    newStaffRole === 'admin'
                      ? 'border-mtu-purple bg-mtu-purple-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}>
                    <input
                      type="radio"
                      name="invite-role"
                      value="admin"
                      checked={newStaffRole === 'admin'}
                      onChange={(e) => setNewStaffRole(e.target.value as 'admin')}
                      className="sr-only"
                    />
                    <Crown className={`h-5 w-5 ${newStaffRole === 'admin' ? 'text-mtu-purple' : 'text-slate-400'}`} />
                    <div>
                      <p className={`font-medium text-sm ${newStaffRole === 'admin' ? 'text-mtu-purple-dark' : 'text-slate-700'}`}>
                        Admin
                      </p>
                      <p className="text-xs text-slate-400">Full control</p>
                    </div>
                  </label>
                </div>
              </div>
              <Button
                type="submit"
                disabled={inviteFormLoading}
                className="w-full h-11 bg-mtu-green hover:bg-mtu-green-dark text-white shadow-md"
              >
                {inviteFormLoading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Send Invitation
                  </span>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Pending Invitations Card */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Mail className="h-5 w-5 text-amber-600" />
              Pending Invitations
            </CardTitle>
            <CardDescription>Active invitations awaiting acceptance</CardDescription>
          </CardHeader>
          <CardContent>
            {invites.filter(invite => !invite.used_at && new Date(invite.expires_at) > new Date()).length === 0 ? (
              <div className="text-center py-8">
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
                  <Mail className="h-5 w-5 text-slate-400" />
                </div>
                <p className="text-slate-500 font-medium">No pending invitations</p>
                <p className="text-sm text-slate-400 mt-1">Create a new invitation above</p>
              </div>
            ) : (
              <div className="space-y-3">
                {invites
                  .filter(invite => !invite.used_at && new Date(invite.expires_at) > new Date())
                  .map((invite) => {
                    const expiresDate = new Date(invite.expires_at)
                    const daysLeft = Math.ceil((expiresDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))

                    return (
                      <div key={invite.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-700 truncate">{invite.email}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              invite.role === 'admin'
                                ? 'bg-mtu-purple-100 text-mtu-purple-dark'
                                : 'bg-mtu-green-100 text-mtu-green-dark'
                            }`}>
                              {invite.role === 'admin' ? 'Admin' : 'Staff'}
                            </span>
                            <span className={`text-xs ${daysLeft <= 1 ? 'text-red-500 font-medium' : 'text-slate-400'}`}>
                              {daysLeft} day{daysLeft === 1 ? '' : 's'} left
                            </span>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRevokeInvite(invite.id)}
                          className="text-red-500 hover:bg-red-50 ml-2"
                        >
                          Revoke
                        </Button>
                      </div>
                    )
                  })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// Helper component for labels (since we don't have Label component from shadcn)
function Label({ htmlFor, ...props }: { htmlFor: string } & React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label htmlFor={htmlFor} {...props} />
}