import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface WizardStepProps {
  step: number
  currentStep: number
  title: string
  description: string
  children: ReactNode
  className?: string
}

export function WizardStep({ 
  step, 
  currentStep, 
  title, 
  description, 
  children, 
  className 
}: WizardStepProps) {
  const isActive = step === currentStep
  const isCompleted = step < currentStep
  
  if (!isActive) {
    return null
  }

  return (
    <div className={cn("space-y-6", className)}>
      <div className="space-y-2">
        <div className="flex items-center space-x-2">
          <div className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium",
            isCompleted 
              ? "bg-primary text-primary-foreground" 
              : isActive 
                ? "bg-primary text-primary-foreground" 
                : "bg-muted text-muted-foreground"
          )}>
            {isCompleted ? "✓" : step}
          </div>
          <h2 className="text-xl font-semibold">{title}</h2>
        </div>
        <p className="text-muted-foreground">{description}</p>
      </div>
      
      <div className="space-y-4">
        {children}
      </div>
    </div>
  )
}