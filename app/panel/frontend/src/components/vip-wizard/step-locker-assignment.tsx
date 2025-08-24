import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { RefreshCw, MapPin } from 'lucide-react'
import { useI18n } from '@/hooks/useI18n'
import { apiClient } from '@/services/api-client'

export interface LockerAssignment {
  kiosk_id: string
  locker_id: number
  rfid_card: string
  backup_card?: string
}

interface AvailableLocker {
  kiosk_id: string
  locker_id: number
  size: string
}

interface StepLockerAssignmentProps {
  data: LockerAssignment
  onChange: (data: LockerAssignment) => void
  onValidationChange: (isValid: boolean) => void
}

export function StepLockerAssignment({ 
  data, 
  onChange, 
  onValidationChange 
}: StepLockerAssignmentProps) {
  const { t } = useI18n()
  const [availableLockers, setAvailableLockers] = useState<AvailableLocker[]>([])
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const loadAvailableLockers = async () => {
    setLoading(true)
    try {
      const response = await apiClient.get('/api/vip/lockers/available')
      if (response.success) {
        setAvailableLockers(response.data)
      }
    } catch (error) {
      console.error('Failed to load available lockers:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAvailableLockers()
  }, [])

  const validateRfidCard = (card: string): boolean => {
    if (!card.trim()) {
      setErrors(prev => ({ ...prev, rfid_card: t('validation.required') }))
      return false
    }
    
    if (card.length < 8) {
      setErrors(prev => ({ ...prev, rfid_card: t('validation.minLength', { min: 8 }) }))
      return false
    }
    
    setErrors(prev => {
      const newErrors = { ...prev }
      delete newErrors.rfid_card
      return newErrors
    })
    return true
  }

  const validateBackupCard = (card: string): boolean => {
    if (card && card.length > 0 && card.length < 8) {
      setErrors(prev => ({ ...prev, backup_card: t('validation.minLength', { min: 8 }) }))
      return false
    }
    
    if (card && card === data.rfid_card) {
      setErrors(prev => ({ ...prev, backup_card: 'Backup card must be different from main card' }))
      return false
    }
    
    setErrors(prev => {
      const newErrors = { ...prev }
      delete newErrors.backup_card
      return newErrors
    })
    return true
  }

  const handleLockerSelect = (lockerId: string) => {
    const [kioskId, lockerNum] = lockerId.split('-')
    onChange({
      ...data,
      kiosk_id: kioskId,
      locker_id: parseInt(lockerNum)
    })
  }

  const handleRfidCardChange = (card: string) => {
    validateRfidCard(card)
    onChange({ ...data, rfid_card: card })
  }

  const handleBackupCardChange = (card: string) => {
    validateBackupCard(card)
    onChange({ ...data, backup_card: card })
  }

  useEffect(() => {
    const isLockerSelected = data.kiosk_id && data.locker_id
    const isRfidValid = validateRfidCard(data.rfid_card)
    const isBackupValid = validateBackupCard(data.backup_card || '')
    
    onValidationChange(!!isLockerSelected && isRfidValid && isBackupValid)
  }, [data, onValidationChange])

  const groupedLockers = availableLockers.reduce((acc, locker) => {
    if (!acc[locker.kiosk_id]) {
      acc[locker.kiosk_id] = []
    }
    acc[locker.kiosk_id].push(locker)
    return acc
  }, {} as Record<string, AvailableLocker[]>)

  const selectedLocker = availableLockers.find(
    l => l.kiosk_id === data.kiosk_id && l.locker_id === data.locker_id
  )

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Available Lockers *</Label>
            <Button
              variant="outline"
              size="sm"
              onClick={loadAvailableLockers}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          <div className="space-y-3 max-h-64 overflow-y-auto">
            {Object.entries(groupedLockers).map(([kioskId, lockers]) => (
              <div key={kioskId} className="space-y-2">
                <div className="flex items-center space-x-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium text-sm">Kiosk {kioskId}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 ml-6">
                  {lockers.map((locker) => {
                    const lockerId = `${locker.kiosk_id}-${locker.locker_id}`
                    const isSelected = data.kiosk_id === locker.kiosk_id && 
                                     data.locker_id === locker.locker_id
                    
                    return (
                      <Card
                        key={lockerId}
                        className={`cursor-pointer transition-all hover:shadow-sm ${
                          isSelected ? 'ring-2 ring-primary border-primary' : ''
                        }`}
                        onClick={() => handleLockerSelect(lockerId)}
                      >
                        <CardContent className="p-3 text-center">
                          <div className="font-medium">#{locker.locker_id}</div>
                          <Badge variant="secondary" className="text-xs">
                            {locker.size}
                          </Badge>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          {availableLockers.length === 0 && !loading && (
            <div className="text-center text-muted-foreground py-8">
              No available lockers found
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="rfid_card">
              {t('vip.rfidCard')} *
            </Label>
            <Input
              id="rfid_card"
              value={data.rfid_card}
              onChange={(e) => handleRfidCardChange(e.target.value)}
              placeholder="Enter RFID card number"
              className={errors.rfid_card ? 'border-destructive' : ''}
            />
            {errors.rfid_card && (
              <p className="text-sm text-destructive">{errors.rfid_card}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="backup_card">
              Backup RFID Card (Optional)
            </Label>
            <Input
              id="backup_card"
              value={data.backup_card || ''}
              onChange={(e) => handleBackupCardChange(e.target.value)}
              placeholder="Enter backup RFID card number"
              className={errors.backup_card ? 'border-destructive' : ''}
            />
            {errors.backup_card && (
              <p className="text-sm text-destructive">{errors.backup_card}</p>
            )}
          </div>

          {selectedLocker && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Selected Locker</CardTitle>
                <CardDescription>Locker assignment details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Location:</span>
                  <span className="font-medium">Kiosk {selectedLocker.kiosk_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Locker Number:</span>
                  <span className="font-medium">#{selectedLocker.locker_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Size:</span>
                  <Badge variant="secondary">{selectedLocker.size}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">RFID Card:</span>
                  <span className="font-medium font-mono">{data.rfid_card}</span>
                </div>
                {data.backup_card && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Backup Card:</span>
                    <span className="font-medium font-mono">{data.backup_card}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}