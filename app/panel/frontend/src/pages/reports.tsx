import { useState, useEffect } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Download, Calendar, BarChart3, Package } from 'lucide-react'
import { useI18n } from '@/hooks/useI18n'
import { apiClient } from '@/services/api-client'

interface DailyUsageStats {
  date: string;
  total_opens: number;
  rfid_opens: number;
  qr_opens: number;
  staff_opens: number;
  unique_users: number;
}

interface LockerStatusOverview {
  total_lockers: number;
  free_lockers: number;
  owned_lockers: number;
  blocked_lockers: number;
  vip_lockers: number;
  utilization_rate: number;
}

export function Reports() {
  const { t } = useI18n()
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [dailyUsage, setDailyUsage] = useState<DailyUsageStats | null>(null)
  const [lockerStatus, setLockerStatus] = useState<LockerStatusOverview | null>(null)
  const [loading, setLoading] = useState(false)
  const [exportLoading, setExportLoading] = useState(false)

  useEffect(() => {
    fetchReportData()
  }, [selectedDate])

  const fetchReportData = async () => {
    try {
      setLoading(true)
      const [dailyResponse, statusResponse] = await Promise.all([
        apiClient.get(`/api/reports/daily-usage?date=${selectedDate}`),
        apiClient.get('/api/reports/locker-status')
      ])
      
      setDailyUsage(dailyResponse.data.data)
      setLockerStatus(statusResponse.data.data)
    } catch (error) {
      console.error('Failed to fetch report data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleExportCSV = async () => {
    try {
      setExportLoading(true)
      const response = await fetch(`/api/reports/export/daily-events?date=${selectedDate}`)
      
      if (!response.ok) {
        throw new Error('Export failed')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `daily-events-${selectedDate}.csv`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('Failed to export CSV:', error)
    } finally {
      setExportLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {t('reports.title')}
        </h1>
        <p className="text-muted-foreground">
          {t('reports.description')}
        </p>
      </div>

      {/* Date Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            {t('reports.dateSelection')}
          </CardTitle>
          <CardDescription>
            {t('reports.selectDateDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-end gap-4">
          <div className="flex-1">
            <Label htmlFor="report-date">{t('reports.date')}</Label>
            <Input
              id="report-date"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
            />
          </div>
          <Button onClick={fetchReportData} disabled={loading}>
            {loading ? t('common.loading') : t('reports.refresh')}
          </Button>
        </CardContent>
      </Card>

      {/* Daily Usage Statistics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            {t('reports.dailyUsage')}
          </CardTitle>
          <CardDescription>
            {t('reports.usageStatsFor')} {selectedDate}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">{t('common.loading')}</p>
          ) : dailyUsage ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{dailyUsage.total_opens}</div>
                <p className="text-sm text-muted-foreground">{t('reports.totalOpens')}</p>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{dailyUsage.rfid_opens}</div>
                <p className="text-sm text-muted-foreground">{t('reports.rfidOpens')}</p>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">{dailyUsage.qr_opens}</div>
                <p className="text-sm text-muted-foreground">{t('reports.qrOpens')}</p>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">{dailyUsage.staff_opens}</div>
                <p className="text-sm text-muted-foreground">{t('reports.staffOpens')}</p>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground">{t('reports.noData')}</p>
          )}
        </CardContent>
      </Card>

      {/* Locker Status Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            {t('reports.lockerStatus')}
          </CardTitle>
          <CardDescription>
            {t('reports.currentLockerStatus')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">{t('common.loading')}</p>
          ) : lockerStatus ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
              <div className="text-center">
                <div className="text-2xl font-bold">{lockerStatus.total_lockers}</div>
                <p className="text-sm text-muted-foreground">{t('reports.totalLockers')}</p>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{lockerStatus.free_lockers}</div>
                <p className="text-sm text-muted-foreground">{t('reports.freeLockers')}</p>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{lockerStatus.owned_lockers}</div>
                <p className="text-sm text-muted-foreground">{t('reports.ownedLockers')}</p>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">{lockerStatus.blocked_lockers}</div>
                <p className="text-sm text-muted-foreground">{t('reports.blockedLockers')}</p>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">{lockerStatus.vip_lockers}</div>
                <p className="text-sm text-muted-foreground">{t('reports.vipLockers')}</p>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground">{t('reports.noData')}</p>
          )}
        </CardContent>
      </Card>

      {/* Export Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            {t('reports.export')}
          </CardTitle>
          <CardDescription>
            {t('reports.exportDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={handleExportCSV} 
            disabled={exportLoading}
            className="flex items-center gap-2"
          >
            <Download className="h-4 w-4" />
            {exportLoading ? t('reports.exporting') : t('reports.exportCSV')}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
