import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/auth-context'
import { useTheme } from '@/contexts/theme-context'
import { useI18n } from '@/hooks/useI18n'
import { LanguageSelector } from '@/components/language-selector'
import { HelpRequestCounter } from '@/components/help-request-counter'
import { Moon, Sun, LogOut, Menu } from 'lucide-react'

interface HeaderProps {
  onMenuToggle: () => void
}

export function Header({ onMenuToggle }: HeaderProps) {
  const { user, logout } = useAuth()
  const { theme, setTheme } = useTheme()
  const { t } = useI18n()

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light')
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center">
        <Button
          variant="ghost"
          size="sm"
          className="md:hidden mr-2"
          onClick={onMenuToggle}
        >
          <Menu className="h-4 w-4" />
        </Button>

        <div className="mr-4 hidden md:flex">
          <h1 className="text-lg font-semibold">eForm Locker Panel</h1>
        </div>

        <div className="flex flex-1 items-center justify-between space-x-2 md:justify-end">
          <div className="w-full flex-1 md:w-auto md:flex-none">
            <span className="text-sm text-muted-foreground">
              {t('dashboard.welcome')}, {user?.username}
            </span>
          </div>

          <nav className="flex items-center space-x-2">
            <HelpRequestCounter />
            
            <LanguageSelector />
            
            <Button variant="ghost" size="sm" onClick={toggleTheme}>
              {theme === 'light' ? (
                <Moon className="h-4 w-4" />
              ) : (
                <Sun className="h-4 w-4" />
              )}
            </Button>

            <Button variant="ghost" size="sm" onClick={logout}>
              <LogOut className="h-4 w-4" />
              <span className="sr-only">{t('auth.logout')}</span>
            </Button>
          </nav>
        </div>
      </div>
    </header>
  )
}
