import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useI18n } from '@/hooks/useI18n'

export interface MemberInfo {
  member_name: string
  phone: string
  email?: string
  notes?: string
}

interface StepMemberInfoProps {
  data: MemberInfo
  onChange: (data: MemberInfo) => void
  onValidationChange: (isValid: boolean) => void
}

export function StepMemberInfo({ data, onChange, onValidationChange }: StepMemberInfoProps) {
  const { t } = useI18n()
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validateField = (field: keyof MemberInfo, value: string) => {
    const newErrors = { ...errors }
    
    switch (field) {
      case 'member_name':
        if (!value.trim()) {
          newErrors.member_name = t('validation.required')
        } else if (value.trim().length < 2) {
          newErrors.member_name = t('validation.minLength', { min: 2 })
        } else {
          delete newErrors.member_name
        }
        break
        
      case 'phone':
        if (!value.trim()) {
          newErrors.phone = t('validation.required')
        } else if (!/^\+?[\d\s\-\(\)]{10,}$/.test(value)) {
          newErrors.phone = t('validation.phone')
        } else {
          delete newErrors.phone
        }
        break
        
      case 'email':
        if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          newErrors.email = t('validation.email')
        } else {
          delete newErrors.email
        }
        break
    }
    
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleChange = (field: keyof MemberInfo, value: string) => {
    const newData = { ...data, [field]: value }
    onChange(newData)
    validateField(field, value)
  }

  useEffect(() => {
    // Validate all required fields
    const isNameValid = data.member_name.trim().length >= 2
    const isPhoneValid = /^\+?[\d\s\-\(\)]{10,}$/.test(data.phone)
    const isEmailValid = !data.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)
    
    const isValid = isNameValid && isPhoneValid && isEmailValid
    onValidationChange(isValid)
  }, [data, onValidationChange])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="member_name">
            {t('vip.memberName')} *
          </Label>
          <Input
            id="member_name"
            value={data.member_name}
            onChange={(e) => handleChange('member_name', e.target.value)}
            placeholder={t('vip.memberName')}
            className={errors.member_name ? 'border-destructive' : ''}
          />
          {errors.member_name && (
            <p className="text-sm text-destructive">{errors.member_name}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">
            {t('vip.memberPhone')} *
          </Label>
          <Input
            id="phone"
            value={data.phone}
            onChange={(e) => handleChange('phone', e.target.value)}
            placeholder="+90 555 123 4567"
            className={errors.phone ? 'border-destructive' : ''}
          />
          {errors.phone && (
            <p className="text-sm text-destructive">{errors.phone}</p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">
          {t('vip.memberEmail')}
        </Label>
        <Input
          id="email"
          type="email"
          value={data.email || ''}
          onChange={(e) => handleChange('email', e.target.value)}
          placeholder="member@example.com"
          className={errors.email ? 'border-destructive' : ''}
        />
        {errors.email && (
          <p className="text-sm text-destructive">{errors.email}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">
          {t('common.notes')}
        </Label>
        <Textarea
          id="notes"
          value={data.notes || ''}
          onChange={(e) => handleChange('notes', e.target.value)}
          placeholder={t('common.notes')}
          rows={3}
        />
      </div>
    </div>
  )
}