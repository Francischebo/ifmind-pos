import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { OfflineSaleRecord } from "@/lib/offlineStore";
import { Printer } from "lucide-react";

interface OfflineSaleReceiptProps {
  sale: OfflineSaleRecord | null;
  onClose: () => void;
}

const formatCurrency = (amount: number) =>
  `KSh ${amount.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function OfflineSaleReceipt({ sale, onClose }: OfflineSaleReceiptProps) {
  return (
    <Dialog open={Boolean(sale)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <DialogTitle>Provisional cash receipt</DialogTitle>
            <Badge variant="destructive">NOT YET SYNCED</Badge>
          </div>
          <DialogDescription>
            This records the cashier&apos;s offline capture only. It is not a confirmed sale or official invoice until the server accepts it.
          </DialogDescription>
        </DialogHeader>
        {sale && (
          <div className="space-y-4" data-testid="offline-sale-receipt">
            <div className="rounded-md border p-3 text-sm">
              <div>Reference: OFF-{sale.id.slice(0, 8).toUpperCase()}</div>
              <div>Captured: {new Date(sale.capturedAt).toLocaleString()}</div>
              <div>Status: {sale.status === "conflict" ? "Needs review" : sale.status === "synced" ? "Synced" : "Awaiting server confirmation"}</div>
            </div>
            <div className="max-h-60 space-y-2 overflow-y-auto">
              {sale.items.map((item) => (
                <div key={item.productId} className="flex justify-between gap-3 text-sm">
                  <span>{item.name} × {item.quantity}</span>
                  <span>{formatCurrency(item.unitPrice * item.quantity)}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between border-t pt-3 font-semibold">
              <span>Provisional total</span>
              <span>{formatCurrency(sale.expectedTotal)}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Keep this reference for reconciliation. The server will recheck price, tax, stock, and cashier shift before recording the sale.
            </p>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" />
            Print
          </Button>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
