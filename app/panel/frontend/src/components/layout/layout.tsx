import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Header } from './header'
import { Sidebar } from './sidebar'
import { Footer } from './footer'

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const toggleSidebar = () => setSidebarOpen(!sidebarOpen)
  const closeSidebar = () => setSidebarOpen(false)

  return (
    <div className="min-h-screen bg-background">
      <div className="flex h-screen">
        <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} />

        <div className="flex flex-1 flex-col overflow-hidden">
          <Header onMenuToggle={toggleSidebar} />

          <main className="flex-1 overflow-y-auto p-4">
            <Outlet />
          </main>

          <Footer />
        </div>
      </div>
    </div>
  )
}
