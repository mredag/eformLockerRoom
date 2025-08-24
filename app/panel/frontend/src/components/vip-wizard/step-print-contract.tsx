import React, { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CheckCircle, Download, Printer, FileText, AlertCircle } from 'lucide-react'
import { useI18n } from '@/hooks/useI18n'

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

interface StepPrintContractProps {
  contract: Contract | null
  onValidationChange: (isValid: boolean) => void
  onComplete: () => void
}

export function StepPrintContract({ 
  contract, 
  onValidationChange, 
  onComplete 
}: StepPrintContractProps) {
  const { t } = useI18n()
  const [pdfGenerating, setPdfGenerating] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)

  React.useEffect(() => {
    onValidationChange(true)
  }, [onValidationChange])

  const handlePreviewPDF = async () => {
    if (!contract) return

    setPdfGenerating(true)
    setPdfError(null)

    try {
      // Open PDF in new tab for preview
      const url = `/api/vip/${contract.id}/pdf?includePayments=true&includeTerms=true`
      window.open(url, '_blank')
      console.log('PDF preview opened successfully')
    } catch (error) {
      console.error('Failed to preview PDF:', error)
      setPdfError(error instanceof Error ? error.message : 'Failed to preview contract PDF')
    } finally {
      setPdfGenerating(false)
    }
  }

  const handleGeneratePDF = async () => {
    if (!contract) return

    setPdfGenerating(true)
    setPdfError(null)

    try {
      // Generate and download PDF
      const response = await fetch(`/api/vip/${contract.id}/pdf?download=true&includePayments=true&includeTerms=true`, {
        method: 'GET',
        credentials: 'include'
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to generate PDF')
      }

      // Create blob and download
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `contract-${contract.id}-${contract.member_name.replace(/\s+/g, '-')}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)

      console.log('PDF generated and downloaded successfully')
    } catch (error) {
      console.error('Failed to generate PDF:', error)
      setPdfError(error instanceof Error ? error.message : 'Failed to generate contract PDF')
    } finally {
      setPdfGenerating(false)
    }
  }

  const handlePrintContract = () => {
    // For now, just show completion
    onComplete()
  }

  if (!contract) {
    return (
      <div className="text-center space-y-4">
        <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
        <div>
          <h3 className="text-lg font-semibold">Contract Creation Failed</h3>
          <p className="text-muted-foreground">
            Unable to create the contract. Please try again.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-4">
        <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
        <div>
          <h3 className="text-xl font-semibold text-green-700">Contract Created Successfully!</h3>
          <p className="text-muted-foreground">
            VIP contract #{contract.id} has been created for {contract.member_name}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <FileText className="h-5 w-5" />
            <span>Contract Details</span>
          </CardTitle>
          <CardDescription>Contract #{contract.id}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Member:</span>
                <span className="font-medium">{contract.member_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Phone:</span>
                <span className="font-medium">{contract.phone}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Plan:</span>
                <Badge variant="secondary">{contract.plan}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status:</span>
                <Badge variant="default">{contract.status}</Badge>
              </div>
            </div>
            
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Start Date:</span>
                <span className="font-medium">
                  {new Date(contract.start_at).toLocaleDateString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">End Date:</span>
                <span className="font-medium">
                  {new Date(contract.end_at).toLocaleDateString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Locker:</span>
                <span className="font-medium">
                  Kiosk {contract.kiosk_id} - #{contract.locker_id}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Value:</span>
                <span className="font-medium text-lg">₺{contract.price}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contract Actions</CardTitle>
          <CardDescription>Generate and print the contract document</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              onClick={handlePreviewPDF}
              disabled={pdfGenerating}
              variant="outline"
              className="flex-1"
            >
              {pdfGenerating ? (
                <>
                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent" />
                  Loading Preview...
                </>
              ) : (
                <>
                  <FileText className="mr-2 h-4 w-4" />
                  Preview Contract
                </>
              )}
            </Button>

            <Button
              onClick={handleGeneratePDF}
              disabled={pdfGenerating}
              variant="outline"
              className="flex-1"
            >
              {pdfGenerating ? (
                <>
                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent" />
                  Generating PDF...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  {t('vip.generatePdf')}
                </>
              )}
            </Button>
            
            <Button
              onClick={handlePrintContract}
              className="flex-1"
            >
              <Printer className="mr-2 h-4 w-4" />
              {t('vip.printContract')}
            </Button>
          </div>

          {pdfError && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-center space-x-2">
                <AlertCircle className="h-4 w-4 text-yellow-600" />
                <span className="text-sm text-yellow-800">{pdfError}</span>
              </div>
            </div>
          )}

          <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="text-sm text-green-800">
                PDF generation is now fully implemented! You can preview and download contract PDFs.
              </span>
            </div>
          </div>

          <div className="text-sm text-muted-foreground space-y-2">
            <p>
              <strong>Next Steps:</strong>
            </p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Print the contract for member signature</li>
              <li>Provide RFID card: {contract.rfid_card}</li>
              <li>Test locker access with the member</li>
              <li>File the signed contract</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <div className="text-center">
        <Button onClick={onComplete} size="lg">
          Complete Contract Creation
        </Button>
      </div>
    </div>
  )
}