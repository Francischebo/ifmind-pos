import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Printer, Download } from 'lucide-react';
import cfiLogo from '@/assets/cfi-pos-techiez-logo.png';

interface ReceiptItem {
  name: string;
  quantity: number;
  price: number;
  total: number;
}

interface EnhancedReceiptProps {
  saleId: string;
  date: string;
  items: ReceiptItem[];
  subtotal: number;
  discount?: number;
  tax: number;
  total: number;
  paymentMethod: string;
  customerName?: string;
  cashierName: string;
}

export function EnhancedReceipt({
  saleId,
  date,
  items,
  subtotal,
  discount = 0,
  tax,
  total,
  paymentMethod,
  customerName = 'Walk-in Customer',
  cashierName,
}: EnhancedReceiptProps) {
  const receiptRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    // Simple download as text - can be enhanced to PDF
    const receiptContent = receiptRef.current?.innerText || '';
    const blob = new Blob([receiptContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `receipt-${saleId}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <Card className="max-w-md mx-auto print:shadow-none" ref={receiptRef}>
        <CardContent className="p-6 font-mono text-sm">
          {/* Header */}
          <div className="text-center border-b-2 border-dashed pb-4 mb-4">
            <img
              src={cfiLogo}
              alt="CFI-POS Techiez Limited Company"
              className="mx-auto mb-2 h-auto w-full max-w-[18rem] object-contain"
            />
            <p className="text-xs text-muted-foreground">Wholesale Point of Sale</p>
            <p className="text-xs text-muted-foreground mt-1">CFI-POS Techiez Limited Company</p>
          </div>

          {/* Sale Info */}
          <div className="space-y-1 mb-4 text-xs">
            <div className="flex justify-between">
              <span>Receipt #:</span>
              <span className="font-semibold">{saleId.slice(0, 8).toUpperCase()}</span>
            </div>
            <div className="flex justify-between">
              <span>Date:</span>
              <span>{new Date(date).toLocaleString('en-KE')}</span>
            </div>
            <div className="flex justify-between">
              <span>Customer:</span>
              <span>{customerName}</span>
            </div>
            <div className="flex justify-between">
              <span>Cashier:</span>
              <span>{cashierName}</span>
            </div>
            <div className="flex justify-between">
              <span>Payment:</span>
              <span className="uppercase">{paymentMethod}</span>
            </div>
          </div>

          {/* Items */}
          <div className="border-y-2 border-dashed py-4 mb-4">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-dashed">
                  <th className="text-left pb-2">Item</th>
                  <th className="text-center pb-2">Qty</th>
                  <th className="text-right pb-2">Price</th>
                  <th className="text-right pb-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={index} className="border-b border-dotted">
                    <td className="py-2">{item.name}</td>
                    <td className="text-center py-2">{item.quantity}</td>
                    <td className="text-right py-2">
                      {item.price.toLocaleString('en-KE', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="text-right py-2 font-semibold">
                      {item.total.toLocaleString('en-KE', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="space-y-1 text-xs mb-4">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span>KSh {subtotal.toLocaleString('en-KE', { minimumFractionDigits: 2 })}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-green-600 dark:text-green-400">
                <span>Discount:</span>
                <span>- KSh {discount.toLocaleString('en-KE', { minimumFractionDigits: 2 })}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Tax (16%):</span>
              <span>KSh {tax.toLocaleString('en-KE', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-lg font-bold border-t-2 border-dashed pt-2 mt-2">
              <span>TOTAL:</span>
              <span>KSh {total.toLocaleString('en-KE', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>

          {/* Footer */}
          <div className="text-center text-xs text-muted-foreground border-t-2 border-dashed pt-4 mt-4">
            <p className="mb-1">Thank you for your business!</p>
            <p className="mb-1">Goods once sold cannot be returned</p>
            <p className="text-[10px] mt-2">Powered by CFI-POS Techiez</p>
          </div>
        </CardContent>
      </Card>

      {/* Print/Download Buttons */}
      <div className="flex gap-2 justify-center print:hidden">
        <Button onClick={handlePrint} variant="default" className="gap-2">
          <Printer className="h-4 w-4" />
          Print Receipt
        </Button>
        <Button onClick={handleDownload} variant="outline" className="gap-2">
          <Download className="h-4 w-4" />
          Download
        </Button>
      </div>

      {/* Print Styles */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #root, #root * {
            visibility: hidden;
          }
          ${receiptRef.current ? `
            .print\\:shadow-none,
            .print\\:shadow-none * {
              visibility: visible;
            }
            .print\\:shadow-none {
              position: absolute;
              left: 0;
              top: 0;
              width: 80mm;
              box-shadow: none !important;
            }
          ` : ''}
        }
      `}</style>
    </div>
  );
}
