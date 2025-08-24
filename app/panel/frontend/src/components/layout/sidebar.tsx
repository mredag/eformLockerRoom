import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Package,
  HelpCircle,
  Crown,
  BarChart3,
  Settings,
  Users,
  X,
  LogOut,
  User,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/hooks/useI18n'
import { useAuth } from '@/contexts/auth-context'
import { toast } from 'sonner'
import { useState } from 'react'

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { t } = useI18n()
  const { user, logout } = useAuth()
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const navigation = [
    { name: t('navigation.dashboard'), href: '/', icon: LayoutDashboard },
    { name: t('navigation.lockers'), href: '/lockers', icon: Package },
    { name: t('navigation.help'), href: '/help', icon: HelpCircle },
    { name: t('navigation.vip'), href: '/vip', icon: Crown },
    { name: t('navigation.reports'), href: '/reports', icon: BarChart3 },
    { name: t('navigation.settings'), href: '/settings', icon: Settings },
    { name: t('navigation.users'), href: '/users', icon: Users },
  ]

  const handleLogout = async () => {
    setIsLoggingOut(true)
    try {
      await logout()
      toast.success(t('auth.logoutSuccess'))
      onClose()
    } catch (error) {
      toast.error(t('auth.logoutError'))
    } finally {
      setIsLoggingOut(false)
    }
  }

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm md:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          'fixed left-0 top-0 z-50 h-full w-64 transform border-r bg-background transition-transform duration-200 ease-in-out md:relative md:translate-x-0 flex flex-col',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-14 items-center justify-between border-b px-4 md:justify-center">
          <h2 className="text-lg font-semibold md:hidden">{t('app.title')}</h2>
          <Button
            variant="ghost"
            size="sm"
            className="md:hidden"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <nav className="flex-1 space-y-1 p-4">
          {navigation.map(item => (
            <NavLink
              key={item.href}
              to={item.href}
              onClick={onClose}
              className={({ isActive }) =>
                cn(
                  'flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )
              }
            >
              <item.icon className="mr-3 h-4 w-4" />
              {item.name}
            </NavLink>
          ))}
        </nav>

        {/* User info and logout */}
        <div className="border-t p-4 space-y-2">
          {user && (
            <div className="flex items-center space-x-3 px-3 py-2 text-sm">
              <User className="h-4 w-4 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{user.username}</p>
                <p className="text-xs text-muted-foreground capitalize">{user.role}</p>
              </div>
            </div>
          )}
          
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-muted-foreground hover:text-accent-foreground"
            onClick={handleLogout}
            disabled={isLoggingOut}
          >
            <LogOut className="mr-3 h-4 w-4" />
            {isLoggingOut ? t('auth.loggingOut') : t('auth.logout')}
          </Button>
        </div>
      </div>
    </>
  )
}
