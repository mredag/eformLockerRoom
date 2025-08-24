import { useState, useEffect } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, Users, DollarSign, Calendar, TrendingUp } from 'lucide-react'
import { useI18n } from '@/hooks/useI18n'
import { apiClient } from '@/services/api-client'
import { VipContractWizard } from '@/components/vip-wizard/vip-contract-wizard'

interface ContractStats {
  total_contracts: number
  active_contracts: number
  expired_contracts: number
  cancelled_contracts: number
  expiring_soon: number
  revenue: {
    total: number
    this_month: number
    last_month: number
  }
  by_plan: {
    basic: { count: number; revenue: number }
    premium: { count: number; revenue: number }
    executive: { count: number; revenue: number }
  }
}

export function VIP() {
  const { t } = useI18n()
  const [wizardOpen, setWizardOpen] = useState(false)
  const [stats, setStats] = useState<ContractStats | null>(null)
  const [, setLoading] = useState(true)

  useEffect(() => {
    loadStats()
  }, [])

  const loadStats = async () => {
    try {
      const response = await apiClient.get('/api/vip/stats/overview')
      if (response.success) {
        setStats(response.data)
      }
    } catch (error) {
      console.error('Failed to load VIP stats:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleWizardComplete = (contractId: number) => {
    console.log('Contract created:', contractId)
    loadStats() // Refresh stats
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('vip.title')}</h1>
          <p className="text-muted-foreground">
            Create and manage VIP contracts and premium services.
          </p>
        </div>
        <Button onClick={() => setWizardOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t('vip.newContract')}
        </Button>
      </div>

      {/* Stats Overview */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Contracts</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.active_contracts}</div>
              <p className="text-xs text-muted-foreground">
                {stats.expiring_soon} expiring soon
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">₺{stats.revenue.total}</div>
              <p className="text-xs text-muted-foreground">
                ₺{stats.revenue.this_month} this month
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Contracts</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total_contracts}</div>
              <p className="text-xs text-muted-foreground">
                {stats.cancelled_contracts} cancelled, {stats.expired_contracts} expired
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Growth</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {Math.round((stats.active_contracts / Math.max(stats.total_contracts, 1)) * 100)}%
              </div>
              <p className="text-xs text-muted-foreground">
                Active rate
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Plan Distribution */}
      {stats && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Plan Distribution</CardTitle>
              <CardDescription>Active contracts by plan type</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Badge variant="secondary">Basic</Badge>
                  <span className="text-sm text-muted-foreground">
                    {stats.by_plan.basic.count} contracts
                  </span>
                </div>
                <span className="font-medium">₺{stats.by_plan.basic.revenue}</span>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Badge variant="secondary">Premium</Badge>
                  <span className="text-sm text-muted-foreground">
                    {stats.by_plan.premium.count} contracts
                  </span>
                </div>
                <span className="font-medium">₺{stats.by_plan.premium.revenue}</span>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Badge variant="secondary">Executive</Badge>
                  <span className="text-sm text-muted-foreground">
                    {stats.by_plan.executive.count} contracts
                  </span>
                </div>
                <span className="font-medium">₺{stats.by_plan.executive.revenue}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Common VIP management tasks</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button 
                variant="outline" 
                className="w-full justify-start"
                onClick={() => setWizardOpen(true)}
              >
                <Plus className="mr-2 h-4 w-4" />
                Create New Contract
              </Button>
              
              <Button variant="outline" className="w-full justify-start" disabled>
                <Calendar className="mr-2 h-4 w-4" />
                View Expiring Contracts
              </Button>
              
              <Button variant="outline" className="w-full justify-start" disabled>
                <DollarSign className="mr-2 h-4 w-4" />
                Payment Management
              </Button>
              
              <Button variant="outline" className="w-full justify-start" disabled>
                <TrendingUp className="mr-2 h-4 w-4" />
                Generate Reports
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      <VipContractWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onComplete={handleWizardComplete}
      />
    </div>
  )
}
