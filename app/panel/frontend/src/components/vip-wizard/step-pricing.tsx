import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Calculator, CreditCard } from 'lucide-react'
import { useI18n } from '@/hooks/useI18n'
import { apiClient } from '@/services/api-client'
import type { VipPlan } from './step-plan-selection'

export interface PricingData {
  total_price: number
  discount_percentage: number
  discount_amount: number
  final_price: number
  initial_payment?: {
    amount: number
    method: 'cash' | 'card' | 'transfer' | 'other'
    reference?: string
    notes?: string
  }
}

interface StepPricingProps {
  data: PricingData
  onChange: (data: PricingData) => void
  onValidationChange: (isValid: boolean) => void
  selectedPlan: VipPlan | null
  duration: number
}

export function StepPricing({ 
  data, 
  onChange, 
  onValidationChange, 
  selectedPlan,
  duration 
}: StepPricingProps) {
  const { t } = useI18n()
  const [, setLoading] = useState(false)
  const [includeInitialPayment, setIncludeInitialPayment] = useState(!!data.initial_payment)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const calculatePrice = async () => {
    if (!selectedPlan || duration <= 0) return

    setLoading(true)
    try {
      const response = await apiClient.post('/api/vip/calculate-price', {
        plan: selectedPlan.id,
        duration
      })
      
      if (response.success) {
        const totalPrice = selectedPlan.basePrice * duration
        const finalPrice = response.data.price
        const discountAmount = totalPrice - finalPrice
        const discountPercentage = totalPrice > 0 ? (discountAmount / totalPrice) * 100 : 0

        onChange({
          ...data,
          total_price: totalPrice,
          discount_percentage: Math.round(discountPercentage * 100) / 100,
          discount_amount: discountAmount,
          final_price: finalPrice
        })
      }
    } catch (error) {
      console.error('Failed to calculate price:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    calculatePrice()
  }, [selectedPlan, duration])

  const validateInitialPayment = (payment: PricingData['initial_payment']): boolean => {
    if (!includeInitialPayment) return true
    
    if (!payment) {
      setErrors(prev => ({ ...prev, payment: 'Payment details required' }))
      return false
    }
    
    if (!payment.amount || payment.amount <= 0) {
      setErrors(prev => ({ ...prev, payment_amount: t('validation.positive') }))
      return false
    }
    
    if (payment.amount > data.final_price) {
      setErrors(prev => ({ 
        ...prev, 
        payment_amount: `Amount cannot exceed contract value (₺${data.final_price})` 
      }))
      return false
    }
    
    if (!payment.method) {
      setErrors(prev => ({ ...prev, payment_method: t('validation.required') }))
      return false
    }
    
    setErrors(prev => {
      const newErrors = { ...prev }
      delete newErrors.payment
      delete newErrors.payment_amount
      delete newErrors.payment_method
      return newErrors
    })
    return true
  }

  const handleInitialPaymentToggle = (checked: boolean) => {
    setIncludeInitialPayment(checked)
    
    if (checked) {
      onChange({
        ...data,
        initial_payment: {
          amount: data.final_price,
          method: 'cash',
          reference: '',
          notes: ''
        }
      })
    } else {
      const newData = { ...data }
      delete newData.initial_payment
      onChange(newData)
    }
  }

  const handlePaymentChange = (field: keyof NonNullable<PricingData['initial_payment']>, value: any) => {
    if (!data.initial_payment) return
    
    const updatedPayment = {
      ...data.initial_payment,
      [field]: value
    }
    
    onChange({
      ...data,
      initial_payment: updatedPayment
    })
  }

  useEffect(() => {
    const isPaymentValid = validateInitialPayment(data.initial_payment)
    onValidationChange(isPaymentValid)
  }, [data, includeInitialPayment, onValidationChange])

  if (!selectedPlan) {
    return (
      <div className="text-center text-muted-foreground">
        Please complete previous steps first
      </div>
    )
  }

  const getDiscountDescription = () => {
    if (duration >= 12) return '10% discount for 12+ months'
    if (duration >= 6) return '5% discount for 6+ months'
    return 'No discount applied'
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Calculator className="h-5 w-5" />
              <span>Price Calculation</span>
            </CardTitle>
            <CardDescription>Contract pricing breakdown</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Plan:</span>
                <span className="font-medium">{selectedPlan.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Monthly Rate:</span>
                <span className="font-medium">₺{selectedPlan.basePrice}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Duration:</span>
                <span className="font-medium">{duration} months</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal:</span>
                <span className="font-medium">₺{data.total_price}</span>
              </div>
              
              {data.discount_amount > 0 && (
                <>
                  <div className="flex justify-between text-green-600">
                    <span>Discount ({data.discount_percentage}%):</span>
                    <span>-₺{data.discount_amount}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {getDiscountDescription()}
                  </div>
                </>
              )}
              
              <div className="pt-3 border-t">
                <div className="flex justify-between text-lg font-bold">
                  <span>Total:</span>
                  <span>₺{data.final_price}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <CreditCard className="h-5 w-5" />
              <span>Payment Options</span>
            </CardTitle>
            <CardDescription>Configure initial payment</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="include-payment"
                checked={includeInitialPayment}
                onCheckedChange={handleInitialPaymentToggle}
              />
              <Label htmlFor="include-payment">
                Record initial payment
              </Label>
            </div>

            {includeInitialPayment && data.initial_payment && (
              <div className="space-y-4 pt-4 border-t">
                <div className="space-y-2">
                  <Label htmlFor="payment-amount">
                    Payment Amount *
                  </Label>
                  <Input
                    id="payment-amount"
                    type="number"
                    min="0"
                    max={data.final_price}
                    step="0.01"
                    value={data.initial_payment.amount}
                    onChange={(e) => handlePaymentChange('amount', parseFloat(e.target.value) || 0)}
                    className={errors.payment_amount ? 'border-destructive' : ''}
                  />
                  {errors.payment_amount && (
                    <p className="text-sm text-destructive">{errors.payment_amount}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Payment Method *</Label>
                  <Select
                    value={data.initial_payment.method}
                    onValueChange={(value: any) => handlePaymentChange('method', value)}
                  >
                    <SelectTrigger className={errors.payment_method ? 'border-destructive' : ''}>
                      <SelectValue placeholder="Select payment method" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">{t('vip.paymentMethods.cash')}</SelectItem>
                      <SelectItem value="card">{t('vip.paymentMethods.card')}</SelectItem>
                      <SelectItem value="transfer">{t('vip.paymentMethods.transfer')}</SelectItem>
                      <SelectItem value="other">{t('vip.paymentMethods.other')}</SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.payment_method && (
                    <p className="text-sm text-destructive">{errors.payment_method}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="payment-reference">
                    Reference Number
                  </Label>
                  <Input
                    id="payment-reference"
                    value={data.initial_payment.reference || ''}
                    onChange={(e) => handlePaymentChange('reference', e.target.value)}
                    placeholder="Transaction reference"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="payment-notes">
                    Payment Notes
                  </Label>
                  <Input
                    id="payment-notes"
                    value={data.initial_payment.notes || ''}
                    onChange={(e) => handlePaymentChange('notes', e.target.value)}
                    placeholder="Additional payment notes"
                  />
                </div>

                <div className="p-3 bg-muted rounded-lg">
                  <div className="flex justify-between text-sm">
                    <span>Payment Amount:</span>
                    <span className="font-medium">₺{data.initial_payment.amount}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Remaining Balance:</span>
                    <span className="font-medium">₺{data.final_price - data.initial_payment.amount}</span>
                  </div>
                </div>
              </div>
            )}

            {!includeInitialPayment && (
              <div className="p-3 bg-muted rounded-lg text-sm text-muted-foreground">
                No initial payment will be recorded. Payment can be added later.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}