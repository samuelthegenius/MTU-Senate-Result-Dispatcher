"use client"

import { useState } from 'react'
import type { ReactNode } from 'react'
import { Menu, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sidebar } from './Sidebar'

interface LayoutProps {
  children: ReactNode
}

export function Layout({ children }: LayoutProps) {
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true)

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Sidebar - handles mobile internally, accepts desktop visibility prop */}
      <Sidebar desktopOpen={desktopSidebarOpen} />

      {/* Desktop Top Header */}
      <header className={`hidden lg:flex fixed top-0 right-0 h-16 bg-white border-b border-mtu-green-100 items-center justify-between z-30 px-4 transition-all duration-300 ${desktopSidebarOpen ? 'left-72' : 'left-0'}`}>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setDesktopSidebarOpen(!desktopSidebarOpen)}
          className="text-slate-600 -ml-2"
        >
          {desktopSidebarOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </Button>
        <div className="flex items-center gap-2 absolute left-1/2 -translate-x-1/2">
          <img
            src="/mtulogo.jpg"
            alt="MTU"
            className="h-8 w-auto object-contain"
          />
          <span className="font-bold text-mtu-green-dark">Senate Dispatch</span>
        </div>
        <div className="w-10" />
      </header>

      {/* Main content area with conditional left margin for desktop sidebar */}
      <main className={`min-h-screen pt-16 transition-all duration-300 ${desktopSidebarOpen ? 'lg:ml-72' : 'lg:ml-0'}`}>
        <div className="p-4 lg:p-8 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  )
}
