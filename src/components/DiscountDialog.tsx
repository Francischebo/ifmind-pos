import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Percent, DollarSign } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

interface DiscountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplyDiscount: (discount: { type: 'percentage' | 'fixed'; value: number }) => void;
  currentTotal: number;
}

export function DiscountDialog({ open, onOpenChange, onApplyDiscount, currentTotal }: DiscountDialogProps) {
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [discountValue, setDiscountValue] = useState('');

  const handleApply = () => {
    const value = parseFloat(discountValue);
    if (isNaN(value) || value <= 0) return;
    
    if (discountType === 'percentage' && value > 100) return;
    if (discountType === 'fixed' && value > currentTotal) return;

    onApplyDiscount({ type: discountType, value });
    setDiscountValue('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Apply Discount</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <RadioGroup value={discountType} onValueChange={(v) => setDiscountType(v as 'percentage' | 'fixed')}>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="percentage" id="percentage" />
              <Label htmlFor="percentage" className="flex items-center gap-2 cursor-pointer">
                <Percent className="h-4 w-4" />
                Percentage Discount
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="fixed" id="fixed" />
              <Label htmlFor="fixed" className="flex items-center gap-2 cursor-pointer">
                <DollarSign className="h-4 w-4" />
                Fixed Amount (KSh)
              </Label>
            </div>
          </RadioGroup>

          <div className="space-y-2">
            <Label htmlFor="discount-value">
              {discountType === 'percentage' ? 'Discount Percentage (%)' : 'Discount Amount (KSh)'}
            </Label>
            <Input
              id="discount-value"
              type="number"
              step={discountType === 'percentage' ? '1' : '0.01'}
              min="0"
              max={discountType === 'percentage' ? '100' : currentTotal.toString()}
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
              placeholder={discountType === 'percentage' ? 'Enter percentage' : 'Enter amount'}
            />
            {discountValue && (
              <p className="text-sm text-muted-foreground">
                New total: KSh{' '}
                {discountType === 'percentage'
                  ? (currentTotal * (1 - parseFloat(discountValue) / 100)).toLocaleString('en-KE', { minimumFractionDigits: 2 })
                  : (currentTotal - parseFloat(discountValue)).toLocaleString('en-KE', { minimumFractionDigits: 2 })}
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={!discountValue}>
            Apply Discount
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
