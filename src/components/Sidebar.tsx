"use client"

import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import {
  LayoutDashboard,
  FileText,
  Users,
  LogOut,
  Menu,
  X,
  ChevronRight,
  GraduationCap,
  User,
  Cloud
} from 'lucide-react'
import { Button } from '@/components/ui/button'

interface NavItem {
  label: string
  icon: React.ElementType
  href: string
  adminOnly?: boolean
}

const navItems: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, href: '/' },
  { label: 'Results', icon: FileText, href: '/results' },
  { label: 'Students', icon: User, href: '/students' },
  { label: 'Parent Directory', icon: GraduationCap, href: '/parents' },
  { label: 'Portal Integration', icon: Cloud, href: '/portal', adminOnly: true },
  { label: 'Staff Management', icon: Users, href: '/admin', adminOnly: true },
]

export function Sidebar() {
  const { user, signOut } = useAuth()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)

  const isAdmin = user?.user_metadata?.role === 'admin'

  const filteredNavItems = navItems.filter(
    item => !item.adminOnly || isAdmin
  )

  const navContent = (
    <>
      {/* Logo Section */}
      <div className="p-4 border-b border-mtu-green-100">
        <div className="flex flex-col items-center">
          <img
            src="/mtulogo.jpg"
            alt="Mountain Top University"
            className="h-24 w-auto object-contain"
          />
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {filteredNavItems.map((item) => {
          const Icon = item.icon
          const isActive = location.pathname === item.href

          return (
            <NavLink
              key={item.href}
              to={item.href}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 group ${
                  isActive
                    ? 'bg-mtu-green text-white shadow-md'
                    : 'text-slate-600 hover:bg-mtu-green-50 hover:text-mtu-green'
                }`
              }
            >
              <Icon className={`h-5 w-5 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-mtu-green'}`} />
              <span>{item.label}</span>
              {isActive && <ChevronRight className="h-4 w-4 ml-auto" />}
            </NavLink>
          )
        })}
      </nav>

      {/* User Section */}
      <div className="p-4 border-t border-mtu-green-100">
        <div className="mb-4 px-4 py-3 bg-mtu-purple-50 rounded-lg">
          <p className="text-xs text-mtu-purple font-medium uppercase tracking-wider">Signed in as</p>
          <p className="text-sm text-slate-700 font-medium truncate mt-1">
            {user?.user_metadata?.full_name || user?.email}
          </p>
          <p className="text-xs text-slate-500 truncate">
            {user?.user_metadata?.full_name ? user?.email : ''}
          </p>
          <span className={`inline-flex items-center gap-1 mt-2 px-2 py-0.5 text-xs rounded-full ${
            isAdmin
              ? 'bg-mtu-purple text-white'
              : 'bg-mtu-green-100 text-mtu-green-dark'
          }`}>
            {isAdmin ? 'Administrator' : 'Staff'}
          </span>
        </div>

        <Button
          variant="outline"
          onClick={signOut}
          className="w-full justify-start gap-2 border-slate-200 text-slate-600 hover:bg-red-50 hover:text-red-600 hover:border-red-200"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </Button>
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-mtu-green-100 bg-slate-50">
        <p className="text-xs text-slate-400 text-center">
          Result Notification System
        </p>
        <p className="text-[10px] text-slate-300 text-center mt-1">
          © 2025 MTU Senate
        </p>
      </div>
    </>
  )

  return (
    <>
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-white border-b border-mtu-green-100 px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img
              src="/mtulogo.jpg"
              alt="MTU"
              className="h-10 w-auto object-contain"
            />
            <span className="font-bold text-mtu-green-dark text-sm">Staff Portal</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileOpen(!mobileOpen)}
            className="text-slate-600"
          >
            {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </Button>
        </div>
      </div>

      {/* Mobile Sidebar Overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile Sidebar */}
      <aside className={`
        lg:hidden fixed top-0 left-0 z-50 h-full w-72 bg-white shadow-xl flex flex-col
        transform transition-transform duration-300 ease-in-out
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {navContent}
      </aside>

      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex fixed left-0 top-0 h-full w-72 bg-white shadow-lg flex-col z-40">
        {navContent}
      </aside>
    </>
  )
}
