import { useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface VipPlan {
  id: 'basic' | 'premium' | 'executive'
  name: string
  description: string
  basePrice: number
  features: string[]
  maxDuration: number
  minDuration: number
}

export interface PlanSelection {
  plan: 'basic' | 'premium' | 'executive' | ''
}

interface StepPlanSelectionProps {
  data: PlanSelection
  onChange: (data: PlanSelection) => void
  onValidationChange: (isValid: boolean) => void
  plans: VipPlan[]
}

export function StepPlanSelection({ 
  data, 
  onChange, 
  onValidationChange, 
  plans 
}: StepPlanSelectionProps) {


  const handlePlanSelect = (planId: 'basic' | 'premium' | 'executive') => {
    onChange({ plan: planId })
  }

  useEffect(() => {
    onValidationChange(!!data.plan)
  }, [data.plan, onValidationChange])

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {plans.map((plan) => (
          <Card 
            key={plan.id}
            className={cn(
              "cursor-pointer transition-all hover:shadow-md",
              data.plan === plan.id 
                ? "ring-2 ring-primary border-primary" 
                : "hover:border-primary/50"
            )}
            onClick={() => handlePlanSelect(plan.id)}
          >
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{plan.name}</CardTitle>
                {data.plan === plan.id && (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary">
                    <Check className="h-4 w-4 text-primary-foreground" />
                  </div>
                )}
              </div>
              <CardDescription>{plan.description}</CardDescription>
            </CardHeader>
            
            <CardContent className="space-y-4">
              <div className="text-center">
                <div className="text-2xl font-bold">₺{plan.basePrice}</div>
                <div className="text-sm text-muted-foreground">per month</div>
              </div>
              
              <div className="space-y-2">
                <div className="text-sm font-medium">Features:</div>
                <ul className="space-y-1">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-center text-sm">
                      <Check className="mr-2 h-3 w-3 text-primary" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
              
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Min: {plan.minDuration} months</span>
                <span>Max: {plan.maxDuration} months</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {data.plan && (
        <div className="p-4 bg-muted rounded-lg">
          <div className="flex items-center space-x-2">
            <Check className="h-5 w-5 text-primary" />
            <span className="font-medium">
              Selected: {plans.find(p => p.id === data.plan)?.name}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}