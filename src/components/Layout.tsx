"use client"

import { useState } from 'react'
import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sidebar } from './Sidebar'

interface LayoutProps {
  children: ReactNode
}

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/results': 'Results',
  '/students': 'Students',
  '/parents': 'Parent Directory',
  '/portal': 'Portal Integration',
  '/admin': 'Staff Management',
}

export function Layout({ children }: LayoutProps) {
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true)
  const location = useLocation()
  const pageTitle = PAGE_TITLES[location.pathname] || 'Dashboard'

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar desktopOpen={desktopSidebarOpen} />

      {/* Desktop Top Header */}
      <header className={`hidden lg:flex fixed top-0 right-0 h-16 bg-white border-b border-mtu-green-100 items-center z-30 px-6 gap-4 transition-all duration-300 ${desktopSidebarOpen ? 'left-72' : 'left-0'}`}>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setDesktopSidebarOpen(!desktopSidebarOpen)}
          className="text-slate-500 hover:text-slate-700 shrink-0"
        >
          {desktopSidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
        <div className="h-5 w-px bg-slate-200" />
        <h2 className="text-base font-semibold text-slate-800">{pageTitle}</h2>
      </header>

      <main className={`min-h-screen pt-16 transition-all duration-300 ${desktopSidebarOpen ? 'lg:ml-72' : 'lg:ml-0'}`}>
        <div className="p-4 lg:p-8 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  )
}
