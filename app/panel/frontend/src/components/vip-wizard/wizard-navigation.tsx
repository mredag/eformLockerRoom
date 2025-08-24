import { Button } from '@/components/ui/button'
import { useI18n } from '@/hooks/useI18n'

interface WizardNavigationProps {
  currentStep: number
  totalSteps: number
  onPrevious: () => void
  onNext: () => void
  onCancel: () => void
  isNextDisabled?: boolean
  isLoading?: boolean
  nextLabel?: string | undefined
}

export function WizardNavigation({
  currentStep,
  totalSteps,
  onPrevious,
  onNext,
  onCancel,
  isNextDisabled = false,
  isLoading = false,
  nextLabel
}: WizardNavigationProps) {
  const { t } = useI18n()
  
  const isFirstStep = currentStep === 1
  const isLastStep = currentStep === totalSteps

  return (
    <div className="flex justify-between pt-6 border-t">
      <div className="flex space-x-2">
        <Button
          variant="outline"
          onClick={onCancel}
          disabled={isLoading}
        >
          {t('common.cancel')}
        </Button>
        
        {!isFirstStep && (
          <Button
            variant="outline"
            onClick={onPrevious}
            disabled={isLoading}
          >
            {t('common.previous')}
          </Button>
        )}
      </div>

      <Button
        onClick={onNext}
        disabled={isNextDisabled || isLoading}
      >
        {isLoading ? (
          <>
            <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent" />
            {t('common.loading')}
          </>
        ) : (
          nextLabel || (isLastStep ? t('common.confirm') : t('common.next'))
        )}
      </Button>
    </div>
  )
}