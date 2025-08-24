import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useI18n } from '@/hooks/useI18n'
import type { VipPlan } from './step-plan-selection'

export interface DatesDuration {
  start_at: string
  duration_months: number
  end_at: string
}

interface StepDatesDurationProps {
  data: DatesDuration
  onChange: (data: DatesDuration) => void
  onValidationChange: (isValid: boolean) => void
  selectedPlan: VipPlan | null
}

export function StepDatesDuration({ 
  data, 
  onChange, 
  onValidationChange, 
  selectedPlan 
}: StepDatesDurationProps) {
  const { t } = useI18n()
  const [errors, setErrors] = useState<Record<string, string>>({})

  const calculateEndDate = (startDate: string, months: number): string => {
    if (!startDate) return ''
    
    const start = new Date(startDate)
    const end = new Date(start)
    end.setMonth(end.getMonth() + months)
    
    return end.toISOString().split('T')[0]
  }

  const validateStartDate = (dateStr: string): boolean => {
    if (!dateStr) {
      setErrors(prev => ({ ...prev, start_at: t('validation.required') }))
      return false
    }
    
    const startDate = new Date(dateStr)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    if (startDate < today) {
      setErrors(prev => ({ ...prev, start_at: t('validation.futureDate') }))
      return false
    }
    
    setErrors(prev => {
      const newErrors = { ...prev }
      delete newErrors.start_at
      return newErrors
    })
    return true
  }

  const validateDuration = (duration: number): boolean => {
    if (!selectedPlan) return false
    
    if (duration < selectedPlan.minDuration) {
      setErrors(prev => ({ 
        ...prev, 
        duration_months: t('validation.minLength', { min: selectedPlan.minDuration })
      }))
      return false
    }
    
    if (duration > selectedPlan.maxDuration) {
      setErrors(prev => ({ 
        ...prev, 
        duration_months: t('validation.maxLength', { max: selectedPlan.maxDuration })
      }))
      return false
    }
    
    setErrors(prev => {
      const newErrors = { ...prev }
      delete newErrors.duration_months
      return newErrors
    })
    return true
  }

  const handleStartDateChange = (dateStr: string) => {
    validateStartDate(dateStr)
    const endDate = calculateEndDate(dateStr, data.duration_months)
    
    onChange({
      ...data,
      start_at: dateStr,
      end_at: endDate
    })
  }

  const handleDurationChange = (duration: number) => {
    validateDuration(duration)
    const endDate = calculateEndDate(data.start_at, duration)
    
    onChange({
      ...data,
      duration_months: duration,
      end_at: endDate
    })
  }

  useEffect(() => {
    const isStartDateValid = validateStartDate(data.start_at)
    const isDurationValid = validateDuration(data.duration_months)
    
    onValidationChange(isStartDateValid && isDurationValid)
  }, [data, selectedPlan, onValidationChange])

  if (!selectedPlan) {
    return (
      <div className="text-center text-muted-foreground">
        Please select a plan first
      </div>
    )
  }

  const today = new Date().toISOString().split('T')[0]
  const maxDate = new Date()
  maxDate.setDate(maxDate.getDate() + 30)
  const maxDateStr = maxDate.toISOString().split('T')[0]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="start_at">
              {t('vip.startDate')} *
            </Label>
            <Input
              id="start_at"
              type="date"
              value={data.start_at}
              onChange={(e) => handleStartDateChange(e.target.value)}
              min={today}
              max={maxDateStr}
              className={errors.start_at ? 'border-destructive' : ''}
            />
            {errors.start_at && (
              <p className="text-sm text-destructive">{errors.start_at}</p>
            )}
          </div>

          <div className="space-y-4">
            <Label>
              {t('time.duration')}: {data.duration_months} months *
            </Label>
            <div className="px-2">
              <Slider
                value={[data.duration_months]}
                onValueChange={([value]) => handleDurationChange(value)}
                min={selectedPlan.minDuration}
                max={selectedPlan.maxDuration}
                step={1}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>{selectedPlan.minDuration} months</span>
                <span>{selectedPlan.maxDuration} months</span>
              </div>
            </div>
            {errors.duration_months && (
              <p className="text-sm text-destructive">{errors.duration_months}</p>
            )}
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Contract Summary</CardTitle>
            <CardDescription>Review your contract dates</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Plan:</span>
              <span className="font-medium">{selectedPlan.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Start Date:</span>
              <span className="font-medium">
                {data.start_at ? new Date(data.start_at).toLocaleDateString() : '-'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Duration:</span>
              <span className="font-medium">{data.duration_months} months</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">End Date:</span>
              <span className="font-medium">
                {data.end_at ? new Date(data.end_at).toLocaleDateString() : '-'}
              </span>
            </div>
            <div className="pt-2 border-t">
              <div className="flex justify-between font-medium">
                <span>Monthly Rate:</span>
                <span>₺{selectedPlan.basePrice}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}