import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Banknote, Smartphone, Loader2, Check, X, AlertCircle } from 'lucide-react';
import { PaymentStatus } from '@/hooks/useHybridPayment';

interface HybridPaymentPanelProps {
  totalAmount: number;
  cashAmount: number;
  mpesaAmount: number;
  storeCreditAmount: number;
  remainingAmount: number;
  changeAmount: number;
  status: PaymentStatus;
  mpesaPending: boolean;
  onCashAmountChange: (amount: number) => Promise<boolean> | void;
  onMpesaPayment: (phone: string, amount: number) => Promise<boolean>;
  onStoreCreditPayment: (amount: number, barcode: string | null) => Promise<boolean> | void;
  onCompleteSale: () => void;
  isFullyPaid: boolean;
  disabled?: boolean;
}

export function HybridPaymentPanel({
  totalAmount,
  cashAmount,
  mpesaAmount,
  storeCreditAmount,
  remainingAmount,
  changeAmount,
  status,
  mpesaPending,
  onCashAmountChange,
  onMpesaPayment,
  onStoreCreditPayment,
  onCompleteSale,
  isFullyPaid,
  disabled = false,
}: HybridPaymentPanelProps) {
  const [cashInput, setCashInput] = useState('');
  const [mpesaPhone, setMpesaPhone] = useState('');
  const [mpesaAmountInput, setMpesaAmountInput] = useState('');
  
  const [scInput, setScInput] = useState('');
  const [scBarcode, setScBarcode] = useState('');

  const handleCashSubmit = async () => {
    const amount = parseFloat(cashInput);
    if (amount > 0) {
      await onCashAmountChange(amount);
      setCashInput('');
    }
  };

  const handleQuickCash = async (amount: number) => {
    await onCashAmountChange(amount);
  };

  const handleMpesaSubmit = async () => {
    const amount = parseFloat(mpesaAmountInput) || remainingAmount;
    if (amount > 0 && mpesaPhone) {
      const success = await onMpesaPayment(mpesaPhone, amount);
      if (success) {
        setMpesaAmountInput('');
      }
    }
  };

  const handleStoreCreditSubmit = async () => {
    const amount = parseFloat(scInput);
    if (amount > 0) {
      await onStoreCreditPayment(amount, scBarcode || null);
      setScInput('');
      setScBarcode('');
    }
  };

  const getStatusBadge = () => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary" className="gap-1"><AlertCircle className="h-3 w-3" /> Awaiting Payment</Badge>;
      case 'partially_paid':
        return <Badge variant="outline" className="gap-1 border-amber-500 text-amber-600"><AlertCircle className="h-3 w-3" /> Partial Payment</Badge>;
      case 'paid':
        return <Badge className="gap-1 bg-green-600"><Check className="h-3 w-3" /> Fully Paid</Badge>;
      case 'failed':
        return <Badge variant="destructive" className="gap-1"><X className="h-3 w-3" /> Payment Failed</Badge>;
    }
  };

  return (
    <Card className="border-2">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Payment</CardTitle>
          {getStatusBadge()}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Amount Summary */}
        <div className="rounded-lg bg-muted p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span>Total Amount:</span>
            <span className="font-bold">KES {totalAmount.toLocaleString()}</span>
          </div>
          {cashAmount > 0 && (
            <div className="flex justify-between text-sm text-green-600">
              <span>Cash Paid:</span>
              <span>KES {cashAmount.toLocaleString()}</span>
            </div>
          )}
          {mpesaAmount > 0 && (
            <div className="flex justify-between text-sm text-green-600">
              <span>M-Pesa Paid:</span>
              <span>KES {mpesaAmount.toLocaleString()}</span>
            </div>
          )}
          {storeCreditAmount > 0 && (
            <div className="flex justify-between text-sm text-green-600">
              <span>Store Credit:</span>
              <span>KES {storeCreditAmount.toLocaleString()}</span>
            </div>
          )}
          <Separator />
          <div className="flex justify-between font-bold">
            <span>{remainingAmount > 0 ? 'Remaining:' : 'Change:'}</span>
            <span className={remainingAmount > 0 ? 'text-destructive' : 'text-green-600'}>
              KES {remainingAmount > 0 ? remainingAmount.toLocaleString() : changeAmount.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Cash Payment */}
        {!isFullyPaid && (
          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              <Banknote className="h-4 w-4" />
              Cash Payment
            </Label>
            <div className="flex gap-2">
              <Input
                type="number"
                placeholder="Enter cash amount"
                value={cashInput}
                onChange={(e) => setCashInput(e.target.value)}
                disabled={disabled}
                min="0"
              />
              <Button 
                onClick={handleCashSubmit} 
                disabled={disabled || !cashInput}
                variant="secondary"
              >
                Add
              </Button>
            </div>
            {/* Quick amounts */}
            <div className="flex flex-wrap gap-2">
              {[100, 200, 500, 1000].map((amount) => (
                <Button
                  key={amount}
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickCash(cashAmount + amount)}
                  disabled={disabled}
                >
                  +{amount}
                </Button>
              ))}
              {remainingAmount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickCash(totalAmount - mpesaAmount)}
                  disabled={disabled}
                >
                  Exact ({remainingAmount.toLocaleString()})
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Store Credit Payment */}
        {!isFullyPaid && (
          <>
            <Separator />
            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <Banknote className="h-4 w-4" />
                Store Credit
              </Label>
              <div className="flex flex-col gap-2">
                <Input
                  type="text"
                  placeholder="Barcode (optional, if walk-in)"
                  value={scBarcode}
                  onChange={(e) => setScBarcode(e.target.value)}
                  disabled={disabled}
                />
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder="Amount to deduct"
                    value={scInput}
                    onChange={(e) => setScInput(e.target.value)}
                    disabled={disabled}
                    min="0"
                  />
                  <Button 
                    onClick={handleStoreCreditSubmit} 
                    disabled={disabled || !scInput}
                    variant="secondary"
                  >
                    Apply
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* M-Pesa Payment */}
        {!isFullyPaid && (
          <>
            <Separator />
            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <Smartphone className="h-4 w-4" />
                M-Pesa Payment
              </Label>
              <div className="space-y-2">
                <Input
                  type="tel"
                  placeholder="Phone number (e.g., 0712345678)"
                  value={mpesaPhone}
                  onChange={(e) => setMpesaPhone(e.target.value)}
                  disabled={disabled || mpesaPending}
                />
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder={`Amount (default: ${remainingAmount.toLocaleString()})`}
                    value={mpesaAmountInput}
                    onChange={(e) => setMpesaAmountInput(e.target.value)}
                    disabled={disabled || mpesaPending}
                    min="1"
                  />
                  <Button 
                    onClick={handleMpesaSubmit}
                    disabled={disabled || mpesaPending || !mpesaPhone}
                    className="min-w-[100px]"
                  >
                    {mpesaPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Waiting...
                      </>
                    ) : (
                      'Send STK'
                    )}
                  </Button>
                </div>
              </div>
              {mpesaPending && (
                <p className="text-sm text-muted-foreground animate-pulse">
                  Waiting for customer to confirm payment on their phone...
                </p>
              )}
            </div>
          </>
        )}

        {/* Complete Sale Button */}
        <Separator />
        <Button
          className="w-full h-12 text-lg"
          onClick={onCompleteSale}
          disabled={disabled || !isFullyPaid}
        >
          {isFullyPaid ? (
            <>
              <Check className="h-5 w-5 mr-2" />
              Complete Sale & Print Receipt
            </>
          ) : (
            `Awaiting KES ${remainingAmount.toLocaleString()}`
          )}
        </Button>
      </CardContent>
    </Card>
  );
}