import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { User, MapPin, Calendar, CreditCard, FileText } from 'lucide-react'
import { useI18n } from '@/hooks/useI18n'
import type { MemberInfo } from './step-member-info'
import type { VipPlan } from './step-plan-selection'
import type { DatesDuration } from './step-dates-duration'
import type { LockerAssignment } from './step-locker-assignment'
import type { PricingData } from './step-pricing'

interface StepConfirmationProps {
  memberInfo: MemberInfo
  selectedPlan: VipPlan | null
  datesDuration: DatesDuration
  lockerAssignment: LockerAssignment
  pricingData: PricingData
  onValidationChange: (isValid: boolean) => void
}

export function StepConfirmation({
  memberInfo,
  selectedPlan,
  datesDuration,
  lockerAssignment,
  pricingData,
  onValidationChange
}: StepConfirmationProps) {
  const { t } = useI18n()

  // Always valid since this is just a confirmation step
  React.useEffect(() => {
    onValidationChange(true)
  }, [onValidationChange])

  if (!selectedPlan) {
    return (
      <div className="text-center text-muted-foreground">
        Contract data incomplete
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h3 className="text-lg font-semibold">Review Contract Details</h3>
        <p className="text-muted-foreground">
          Please review all information before creating the contract
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <User className="h-5 w-5" />
                <span>Member Information</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Name:</span>
                <span className="font-medium">{memberInfo.member_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Phone:</span>
                <span className="font-medium">{memberInfo.phone}</span>
              </div>
              {memberInfo.email && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Email:</span>
                  <span className="font-medium">{memberInfo.email}</span>
                </div>
              )}
              {memberInfo.notes && (
                <div className="space-y-1">
                  <span className="text-muted-foreground text-sm">Notes:</span>
                  <p className="text-sm bg-muted p-2 rounded">{memberInfo.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <MapPin className="h-5 w-5" />
                <span>Locker Assignment</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Location:</span>
                <span className="font-medium">Kiosk {lockerAssignment.kiosk_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Locker:</span>
                <span className="font-medium">#{lockerAssignment.locker_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">RFID Card:</span>
                <span className="font-medium font-mono">{lockerAssignment.rfid_card}</span>
              </div>
              {lockerAssignment.backup_card && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Backup Card:</span>
                  <span className="font-medium font-mono">{lockerAssignment.backup_card}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Calendar className="h-5 w-5" />
                <span>Contract Details</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Plan:</span>
                <Badge variant="secondary">{selectedPlan.name}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Duration:</span>
                <span className="font-medium">{datesDuration.duration_months} months</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Start Date:</span>
                <span className="font-medium">
                  {new Date(datesDuration.start_at).toLocaleDateString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">End Date:</span>
                <span className="font-medium">
                  {new Date(datesDuration.end_at).toLocaleDateString()}
                </span>
              </div>
              <Separator />
              <div className="space-y-2">
                <h4 className="font-medium">Plan Features:</h4>
                <ul className="space-y-1">
                  {selectedPlan.features.map((feature, index) => (
                    <li key={index} className="text-sm text-muted-foreground flex items-center">
                      <span className="w-2 h-2 bg-primary rounded-full mr-2" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <CreditCard className="h-5 w-5" />
                <span>Pricing & Payment</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Monthly Rate:</span>
                <span className="font-medium">₺{selectedPlan.basePrice}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal:</span>
                <span className="font-medium">₺{pricingData.total_price}</span>
              </div>
              {pricingData.discount_amount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Discount ({pricingData.discount_percentage}%):</span>
                  <span>-₺{pricingData.discount_amount}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between text-lg font-bold">
                <span>Total Contract Value:</span>
                <span>₺{pricingData.final_price}</span>
              </div>
              
              {pricingData.initial_payment && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <h4 className="font-medium">Initial Payment:</h4>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Amount:</span>
                      <span className="font-medium">₺{pricingData.initial_payment.amount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Method:</span>
                      <Badge variant="outline">
                        {t(`vip.paymentMethods.${pricingData.initial_payment.method}`)}
                      </Badge>
                    </div>
                    {pricingData.initial_payment.reference && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Reference:</span>
                        <span className="font-medium font-mono">
                          {pricingData.initial_payment.reference}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Remaining Balance:</span>
                      <span className="font-medium">
                        ₺{pricingData.final_price - pricingData.initial_payment.amount}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2 text-primary">
            <FileText className="h-5 w-5" />
            <span>Contract Summary</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            By clicking "Create Contract", you confirm that all information is correct and 
            agree to create a VIP contract for <strong>{memberInfo.member_name}</strong> with 
            the <strong>{selectedPlan.name}</strong> plan for <strong>{datesDuration.duration_months} months</strong>, 
            starting on <strong>{new Date(datesDuration.start_at).toLocaleDateString()}</strong> 
            for a total value of <strong>₺{pricingData.final_price}</strong>.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}