import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Printer, Usb } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LoyaltyPointsDisplay } from './LoyaltyPointsDisplay';
import { printerService } from '@/lib/hardware/escpos';

interface ReceiptProps {
  saleId: string;
  onClose: () => void;
}

interface Sale {
  id: string;
  created_at: string;
  total_amount: number;
  subtotal: number;
  tax_amount: number;
  payment_method: string;
  payment_status: string;
  cash_amount: number | null;
  mpesa_amount: number | null;
  change_amount: number | null;
  mpesa_receipt_number: string | null;
  cashier_id: string;
  customer_id: string | null;
  loyalty_discount: number | null;
  loyalty_points_redeemed: number | null;
  loyalty_points_earned: number | null;
  sale_items: {
    quantity: number;
    unit_price: number;
    line_total: number;
    products: {
      name: string;
      sku: string;
    };
  }[];
  customers: {
    name: string;
    phone: string;
  } | null;
  profiles: {
    full_name: string;
  };
}

interface MpesaTransaction {
  mpesa_receipt_number: string | null;
  phone_number: string;
  amount: number;
}

export function Receipt({ saleId, onClose }: ReceiptProps) {
  const [sale, setSale] = useState<Sale | null>(null);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [mpesaTransaction, setMpesaTransaction] = useState<MpesaTransaction | null>(null);

  useEffect(() => {
    loadData();
  }, [saleId]);

  const loadData = async () => {
    // Load sale with items
    const { data: saleData } = await supabase
      .from('sales')
      .select('*, sale_items(*, products(name, sku)), customers(name, phone)')
      .eq('id', saleId)
      .single();

    if (saleData) {
      // Fetch cashier profile separately
      const { data: profileData } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', saleData.cashier_id)
        .single();

      setSale({ ...saleData, profiles: profileData || { full_name: 'Unknown' } } as Sale);

      // Fetch M-Pesa transaction details if applicable
      if (saleData.payment_method === 'mpesa' || saleData.payment_method === 'hybrid') {
        const { data: mpesaData } = await supabase
          .from('mpesa_transactions')
          .select('mpesa_receipt_number, phone_number, amount')
          .eq('sale_id', saleId)
          .eq('status', 'completed')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (mpesaData) {
          setMpesaTransaction(mpesaData);
        }
      }
    }

    // Load settings
    const { data: settingsData } = await supabase.from('settings').select('*');
    const settingsMap: Record<string, string> = {};
    settingsData?.forEach((s) => {
      settingsMap[s.key] = s.value;
    });
    setSettings(settingsMap);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleThermalPrint = async () => {
    // Basic text generation for the receipt
    const lines = [];
    lines.push(settings.company_name || 'Wholesale POS');
    lines.push(settings.company_address || 'Nairobi, Kenya');
    lines.push('--------------------------------');
    lines.push(`Receipt #: ${sale.id.substring(0, 8).toUpperCase()}`);
    lines.push(`Date: ${new Date(sale.created_at).toLocaleString('en-KE')}`);
    lines.push(`Cashier: ${sale.profiles.full_name}`);
    lines.push('--------------------------------');
    sale.sale_items.forEach(item => {
      lines.push(`${item.products.name}`);
      lines.push(`${item.quantity} x ${item.unit_price} = ${item.line_total}`);
    });
    lines.push('--------------------------------');
    lines.push(`TOTAL: KSh ${sale.total_amount}`);
    lines.push('--------------------------------');
    lines.push(settings.receipt_footer || 'Thank you!');
    
    const textToPrint = lines.join('\n');
    await printerService.printReceipt(textToPrint);
  };

  if (!sale) return null;

  const cashAmount = sale.cash_amount || 0;
  const mpesaAmount = sale.mpesa_amount || 0;
  const changeAmount = sale.change_amount || 0;
  const isHybridPayment = sale.payment_method === 'hybrid' || (cashAmount > 0 && mpesaAmount > 0);

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex justify-between items-center">
            <span>Receipt</span>
            <div className="flex gap-2">
              <Button onClick={handleThermalPrint} size="sm" variant="outline">
                <Usb className="h-4 w-4 mr-2" />
                Thermal
              </Button>
              <Button onClick={handlePrint} size="sm">
                <Printer className="h-4 w-4 mr-2" />
                Print
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div id="receipt-content" className="space-y-4 text-sm">
          {/* Company Header */}
          <div className="text-center border-b pb-4">
            <h2 className="font-bold text-lg">{settings.company_name || 'Wholesale POS'}</h2>
            <p>{settings.company_address || 'Nairobi, Kenya'}</p>
            <p>{settings.company_phone || '+254 700 000000'}</p>
            <p>PIN: {settings.tax_pin || 'P000000000A'}</p>
          </div>

          {/* Sale Info */}
          <div className="space-y-1">
            <div className="flex justify-between">
              <span>Receipt #:</span>
              <span className="font-mono">{sale.id.substring(0, 8).toUpperCase()}</span>
            </div>
            <div className="flex justify-between">
              <span>Date:</span>
              <span>{new Date(sale.created_at).toLocaleString('en-KE')}</span>
            </div>
            <div className="flex justify-between">
              <span>Cashier:</span>
              <span>{sale.profiles.full_name}</span>
            </div>
            {sale.customers && (
              <>
                <div className="flex justify-between">
                  <span>Customer:</span>
                  <span>{sale.customers.name}</span>
                </div>
                <div className="flex justify-between">
                  <span>Phone:</span>
                  <span>{sale.customers.phone}</span>
                </div>
              </>
            )}
          </div>

          {/* Items */}
          <div className="border-t border-b py-2 space-y-2">
            {sale.sale_items.map((item, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex justify-between font-medium">
                  <span>{item.products.name}</span>
                  <span>KSh {item.line_total.toLocaleString('en-KE', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground pl-2">
                  <span>{item.quantity} x KSh {item.unit_price.toFixed(2)}</span>
                  <span>SKU: {item.products.sku}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="space-y-1">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span>KSh {sale.subtotal.toLocaleString('en-KE', { minimumFractionDigits: 2 })}</span>
            </div>
            {(sale.loyalty_discount ?? 0) > 0 && (
              <div className="flex justify-between text-green-600 dark:text-green-400">
                <span>🎁 Loyalty Discount:</span>
                <span className="font-medium">-KSh {(sale.loyalty_discount ?? 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>VAT (16%):</span>
              <span>KSh {sale.tax_amount.toLocaleString('en-KE', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between font-bold text-lg border-t pt-2">
              <span>TOTAL:</span>
              <span>KSh {sale.total_amount.toLocaleString('en-KE', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>

          {/* Payment Breakdown */}
          <div className="border-t border-b py-3 space-y-2 bg-muted/30 rounded px-2">
            <div className="font-semibold text-center border-b pb-1 mb-2">Payment Details</div>
            
            {cashAmount > 0 && (
              <div className="flex justify-between">
                <span>💵 Cash Paid:</span>
                <span className="font-medium">KSh {cashAmount.toLocaleString('en-KE', { minimumFractionDigits: 2 })}</span>
              </div>
            )}
            
            {mpesaAmount > 0 && (
              <>
                <div className="flex justify-between">
                  <span>📱 M-Pesa Paid:</span>
                  <span className="font-medium">KSh {mpesaAmount.toLocaleString('en-KE', { minimumFractionDigits: 2 })}</span>
                </div>
                {mpesaTransaction?.mpesa_receipt_number && (
                  <div className="flex justify-between text-xs">
                    <span>M-Pesa Ref:</span>
                    <span className="font-mono font-semibold text-primary">{mpesaTransaction.mpesa_receipt_number}</span>
                  </div>
                )}
                {mpesaTransaction?.phone_number && (
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Phone:</span>
                    <span>{mpesaTransaction.phone_number}</span>
                  </div>
                )}
              </>
            )}
            
            {changeAmount > 0 && (
              <div className="flex justify-between text-green-600 dark:text-green-400 font-medium border-t pt-1">
                <span>Change Given:</span>
                <span>KSh {changeAmount.toLocaleString('en-KE', { minimumFractionDigits: 2 })}</span>
              </div>
            )}

            <div className="flex justify-between text-xs text-muted-foreground pt-1 border-t">
              <span>Payment Method:</span>
              <span className="uppercase font-medium">
                {isHybridPayment ? 'CASH + M-PESA' : sale.payment_method.toUpperCase()}
              </span>
            </div>
            
            <div className="flex justify-between text-xs">
              <span>Payment Status:</span>
              <span className={`font-medium uppercase ${sale.payment_status === 'paid' ? 'text-green-600' : 'text-amber-600'}`}>
                {sale.payment_status}
              </span>
            </div>
          </div>

          {/* MPESA Info for manual payments */}
          {settings.mpesa_paybill && sale.payment_method === 'cash' && (
            <div className="text-center text-xs bg-muted p-2 rounded">
              <p>Pay via M-PESA</p>
              <p>Paybill: {settings.mpesa_paybill}</p>
              {settings.mpesa_till_number && <p>Till: {settings.mpesa_till_number}</p>}
            </div>
          )}

          {/* Loyalty Points Section - Customer Facing Display */}
          {sale.customer_id && (
            <LoyaltyPointsDisplay
              customerId={sale.customer_id}
              pointsEarned={sale.loyalty_points_earned ?? 0}
            />
          )}

          {/* Footer */}
          <div className="text-center text-xs border-t pt-4">
            <p>{settings.receipt_footer || 'Thank you for your business!'}</p>
            <p className="mt-2 text-muted-foreground">
              Powered by IFMind-POS System
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Print styles
const style = document.createElement('style');
style.textContent = `
  @media print {
    body * {
      visibility: hidden;
    }
    #receipt-content, #receipt-content * {
      visibility: visible;
    }
    #receipt-content {
      position: absolute;
      left: 0;
      top: 0;
      width: 80mm;
      font-size: 12px;
    }
  }
`;
document.head.appendChild(style);
