import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { useI18n } from '@/hooks/useI18n'
import { apiClient } from '@/services/api-client'

import { WizardProgress } from './wizard-progress'
import { WizardStep } from './wizard-step'
import { WizardNavigation } from './wizard-navigation'
import { StepMemberInfo, type MemberInfo } from './step-member-info'
import { StepPlanSelection, type VipPlan, type PlanSelection } from './step-plan-selection'
import { StepDatesDuration, type DatesDuration } from './step-dates-duration'
import { StepLockerAssignment, type LockerAssignment } from './step-locker-assignment'
import { StepPricing, type PricingData } from './step-pricing'
import { StepConfirmation } from './step-confirmation'
import { StepPrintContract } from './step-print-contract'

interface VipContractWizardProps {
  open: boolean
  onClose: () => void
  onComplete?: (contractId: number) => void
}

interface Contract {
  id: number
  member_name: string
  phone: string
  email?: string
  plan: string
  price: number
  start_at: string
  end_at: string
  status: string
  created_at: string
  kiosk_id: string
  locker_id: number
  rfid_card: string
}

export function VipContractWizard({ open, onClose, onComplete }: VipContractWizardProps) {
  const { t } = useI18n()
  const [currentStep, setCurrentStep] = useState(1)
  const [isStepValid, setIsStepValid] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [createdContract, setCreatedContract] = useState<Contract | null>(null)

  // Step data
  const [memberInfo, setMemberInfo] = useState<MemberInfo>({
    member_name: '',
    phone: '',
    email: '',
    notes: ''
  })

  const [planSelection, setPlanSelection] = useState<PlanSelection>({
    plan: ''
  })

  const [datesDuration, setDatesDuration] = useState<DatesDuration>({
    start_at: '',
    duration_months: 1,
    end_at: ''
  })

  const [lockerAssignment, setLockerAssignment] = useState<LockerAssignment>({
    kiosk_id: '',
    locker_id: 0,
    rfid_card: '',
    backup_card: ''
  })

  const [pricingData, setPricingData] = useState<PricingData>({
    total_price: 0,
    discount_percentage: 0,
    discount_amount: 0,
    final_price: 0
  })

  const [vipPlans, setVipPlans] = useState<VipPlan[]>([])

  // Load VIP plans on mount
  useEffect(() => {
    if (open) {
      loadVipPlans()
      resetWizard()
    }
  }, [open])

  const loadVipPlans = async () => {
    try {
      const response = await apiClient.get('/api/vip/plans')
      if (response.success) {
        setVipPlans(response.data)
        // Set default duration based on first plan
        if (response.data.length > 0) {
          setDatesDuration(prev => ({
            ...prev,
            duration_months: response.data[0].minDuration
          }))
        }
      }
    } catch (error) {
      console.error('Failed to load VIP plans:', error)
      toast.error('Failed to load VIP plans')
    }
  }

  const resetWizard = () => {
    setCurrentStep(1)
    setIsStepValid(false)
    setIsLoading(false)
    setCreatedContract(null)
    setMemberInfo({ member_name: '', phone: '', email: '', notes: '' })
    setPlanSelection({ plan: '' })
    setDatesDuration({ start_at: '', duration_months: 1, end_at: '' })
    setLockerAssignment({ kiosk_id: '', locker_id: 0, rfid_card: '', backup_card: '' })
    setPricingData({ total_price: 0, discount_percentage: 0, discount_amount: 0, final_price: 0 })
  }

  const steps = [
    {
      title: t('vip.wizard.step1'),
      description: t('vip.wizard.memberInfo')
    },
    {
      title: t('vip.wizard.step2'),
      description: t('vip.wizard.planSelection')
    },
    {
      title: t('vip.wizard.step3'),
      description: t('vip.wizard.dateSelection')
    },
    {
      title: 'Locker Assignment',
      description: 'Assign locker and RFID cards'
    },
    {
      title: t('vip.wizard.step4'),
      description: t('vip.wizard.priceCalculation')
    },
    {
      title: t('vip.wizard.step5'),
      description: t('vip.wizard.confirmation')
    },
    {
      title: t('vip.wizard.step6'),
      description: t('vip.wizard.printContract')
    }
  ]

  const selectedPlan = vipPlans.find(p => p.id === planSelection.plan) || null

  const handleNext = async () => {
    if (currentStep < steps.length) {
      if (currentStep === 5) { // Confirmation step - create contract
        await createContract()
      } else {
        setCurrentStep(currentStep + 1)
        setIsStepValid(false)
      }
    }
  }

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
      setIsStepValid(true) // Previous steps are assumed to be valid
    }
  }

  const handleCancel = () => {
    if (currentStep === steps.length && createdContract) {
      // Contract already created, just close
      onClose()
    } else {
      // Confirm cancellation
      if (confirm('Are you sure you want to cancel? All progress will be lost.')) {
        onClose()
      }
    }
  }

  const createContract = async () => {
    setIsLoading(true)
    
    try {
      const contractData = {
        member_name: memberInfo.member_name,
        phone: memberInfo.phone,
        email: memberInfo.email || undefined,
        plan: planSelection.plan,
        duration_months: datesDuration.duration_months,
        start_at: datesDuration.start_at,
        created_by: 'admin', // TODO: Get from auth context
        kiosk_id: lockerAssignment.kiosk_id,
        locker_id: lockerAssignment.locker_id,
        rfid_card: lockerAssignment.rfid_card,
        backup_card: lockerAssignment.backup_card || undefined,
        notes: memberInfo.notes || undefined,
        initial_payment: pricingData.initial_payment
      }

      const response = await apiClient.post('/api/vip', contractData)
      
      if (response.success) {
        setCreatedContract(response.data)
        setCurrentStep(steps.length) // Go to print step
        toast.success(t('vip.contractCreated'))
      } else {
        throw new Error(response.error || 'Failed to create contract')
      }
    } catch (error) {
      console.error('Failed to create contract:', error)
      toast.error(error instanceof Error ? error.message : t('vip.contractError'))
    } finally {
      setIsLoading(false)
    }
  }

  const handleComplete = () => {
    if (createdContract && onComplete) {
      onComplete(createdContract.id)
    }
    onClose()
  }

  const getNextLabel = (): string | undefined => {
    if (currentStep === 5) return 'Create Contract'
    if (currentStep === steps.length) return 'Complete'
    return undefined
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('vip.wizard.title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <WizardProgress
            currentStep={currentStep}
            totalSteps={steps.length}
            steps={steps}
          />

          <div className="min-h-[400px]">
            <WizardStep
              step={1}
              currentStep={currentStep}
              title={steps[0].title}
              description={steps[0].description}
            >
              <StepMemberInfo
                data={memberInfo}
                onChange={setMemberInfo}
                onValidationChange={setIsStepValid}
              />
            </WizardStep>

            <WizardStep
              step={2}
              currentStep={currentStep}
              title={steps[1].title}
              description={steps[1].description}
            >
              <StepPlanSelection
                data={planSelection}
                onChange={setPlanSelection}
                onValidationChange={setIsStepValid}
                plans={vipPlans}
              />
            </WizardStep>

            <WizardStep
              step={3}
              currentStep={currentStep}
              title={steps[2].title}
              description={steps[2].description}
            >
              <StepDatesDuration
                data={datesDuration}
                onChange={setDatesDuration}
                onValidationChange={setIsStepValid}
                selectedPlan={selectedPlan}
              />
            </WizardStep>

            <WizardStep
              step={4}
              currentStep={currentStep}
              title={steps[3].title}
              description={steps[3].description}
            >
              <StepLockerAssignment
                data={lockerAssignment}
                onChange={setLockerAssignment}
                onValidationChange={setIsStepValid}
              />
            </WizardStep>

            <WizardStep
              step={5}
              currentStep={currentStep}
              title={steps[4].title}
              description={steps[4].description}
            >
              <StepPricing
                data={pricingData}
                onChange={setPricingData}
                onValidationChange={setIsStepValid}
                selectedPlan={selectedPlan}
                duration={datesDuration.duration_months}
              />
            </WizardStep>

            <WizardStep
              step={6}
              currentStep={currentStep}
              title={steps[5].title}
              description={steps[5].description}
            >
              <StepConfirmation
                memberInfo={memberInfo}
                selectedPlan={selectedPlan}
                datesDuration={datesDuration}
                lockerAssignment={lockerAssignment}
                pricingData={pricingData}
                onValidationChange={setIsStepValid}
              />
            </WizardStep>

            <WizardStep
              step={7}
              currentStep={currentStep}
              title={steps[6].title}
              description={steps[6].description}
            >
              <StepPrintContract
                contract={createdContract}
                onValidationChange={setIsStepValid}
                onComplete={handleComplete}
              />
            </WizardStep>
          </div>

          {currentStep < steps.length && (
            <WizardNavigation
              currentStep={currentStep}
              totalSteps={steps.length}
              onPrevious={handlePrevious}
              onNext={handleNext}
              onCancel={handleCancel}
              isNextDisabled={!isStepValid}
              isLoading={isLoading}
              nextLabel={getNextLabel()}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}