import { cn } from '@/lib/utils'

interface WizardProgressProps {
  currentStep: number
  totalSteps: number
  steps: Array<{
    title: string
    description: string
  }>
}

export function WizardProgress({ currentStep, totalSteps, steps }: WizardProgressProps) {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const stepNumber = index + 1
          const isActive = stepNumber === currentStep
          const isCompleted = stepNumber < currentStep
          
          return (
            <div key={stepNumber} className="flex items-center">
              <div className="flex flex-col items-center">
                <div className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-full text-sm font-medium transition-colors",
                  isCompleted 
                    ? "bg-primary text-primary-foreground" 
                    : isActive 
                      ? "bg-primary text-primary-foreground" 
                      : "bg-muted text-muted-foreground"
                )}>
                  {isCompleted ? "✓" : stepNumber}
                </div>
                <div className="mt-2 text-center">
                  <div className={cn(
                    "text-sm font-medium",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )}>
                    {step.title}
                  </div>
                  <div className="text-xs text-muted-foreground max-w-24 truncate">
                    {step.description}
                  </div>
                </div>
              </div>
              
              {stepNumber < totalSteps && (
                <div className={cn(
                  "mx-4 h-0.5 w-16 transition-colors",
                  stepNumber < currentStep ? "bg-primary" : "bg-muted"
                )} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}