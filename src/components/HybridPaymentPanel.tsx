import { useEffect, useState } from "react";
import { ApiService } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Banknote,
  Smartphone,
  Loader2,
  Check,
  X,
  AlertCircle,
} from "lucide-react";
import { PaymentStatus } from "@/hooks/useHybridPayment";

interface HybridPaymentPanelProps {
  totalAmount: number;
  cashAmount: number;
  mpesaAmount: number;
  storeCreditAmount: number;
  storeCreditAccountBalance: number;
  remainingAmount: number;
  changeAmount: number;
  status: PaymentStatus;
  mpesaPending: boolean;
  checkoutReserved: boolean;
  recoveringCheckout?: boolean;
  canCancelCheckout: boolean;
  paybillNumber: string | null;
  paybillEnabled: boolean;
  stkPushEnabled?: boolean;
  stkPushIssues?: string[];
  paybillReference: string | null;
  paybillAmount: number | null;
  onCashAmountChange: (amount: number) => Promise<boolean> | void;
  onMpesaPayment: (phone: string, amount: number) => Promise<boolean>;
  onPaybillPayment: (phone: string, amount: number) => Promise<boolean>;
  onStoreCreditPayment: (
    amount: number,
    barcode: string | null,
  ) => Promise<boolean | void> | void;
  onCompleteSale: () => void;
  onCancelCheckout: () => Promise<boolean>;
  isFullyPaid: boolean;
  disabled?: boolean;
}

export function HybridPaymentPanel({
  totalAmount,
  cashAmount,
  mpesaAmount,
  storeCreditAmount,
  storeCreditAccountBalance,
  remainingAmount,
  changeAmount,
  status,
  mpesaPending,
  checkoutReserved,
  recoveringCheckout = false,
  canCancelCheckout,
  paybillNumber,
  paybillEnabled,
  stkPushEnabled,
  stkPushIssues = [],
  paybillReference,
  paybillAmount,
  onCashAmountChange,
  onMpesaPayment,
  onPaybillPayment,
  onStoreCreditPayment,
  onCompleteSale,
  onCancelCheckout,
  isFullyPaid,
  disabled = false,
}: HybridPaymentPanelProps) {
  const [cashInput, setCashInput] = useState("");
  const [mpesaPhone, setMpesaPhone] = useState("");
  const [mpesaAmountInput, setMpesaAmountInput] = useState("");

  const [scInput, setScInput] = useState("");
  const [scBarcode, setScBarcode] = useState("");
  const [barcodeBalance, setBarcodeBalance] = useState<number | null>(null);
  const [barcodeLookupState, setBarcodeLookupState] = useState<
    "idle" | "loading" | "valid" | "invalid"
  >("idle");
  const [storeCreditInputError, setStoreCreditInputError] = useState("");

  useEffect(() => {
    const barcode = scBarcode.trim();
    if (!barcode) {
      setBarcodeBalance(null);
      setBarcodeLookupState("idle");
      return;
    }

    let cancelled = false;
    setBarcodeBalance(null);
    setBarcodeLookupState("loading");
    const timeoutId = window.setTimeout(() => {
      ApiService.get<{ barcode: string; current_balance: number }>(
        `/store-credits/${encodeURIComponent(barcode)}`,
      )
        .then((credit) => {
          if (cancelled) return;
          setBarcodeBalance(Number(credit.current_balance));
          setBarcodeLookupState("valid");
        })
        .catch(() => {
          if (cancelled) return;
          setBarcodeBalance(null);
          setBarcodeLookupState("invalid");
        });
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [scBarcode]);

  const availableStoreCredit = scBarcode.trim()
    ? barcodeBalance ?? 0
    : Number(storeCreditAccountBalance) || 0;
  const maximumStoreCreditPayment = Math.min(
    availableStoreCredit,
    remainingAmount,
  );
  const storeCreditAmountExceedsBalance =
    scInput !== "" &&
    Number.isFinite(Number(scInput)) &&
    Number(scInput) > maximumStoreCreditPayment;

  const handleCashSubmit = async () => {
    const amount = parseFloat(cashInput);
    if (amount > 0) {
      await onCashAmountChange(amount);
      setCashInput("");
    }
  };

  const handleQuickCash = async (amount: number) => {
    await onCashAmountChange(amount);
  };

  const handleMpesaSubmit = async () => {
    const amount = parseFloat(mpesaAmountInput) || Math.floor(remainingAmount);
    if (amount > 0 && mpesaPhone) {
      const success = await onMpesaPayment(mpesaPhone, amount);
      if (success) {
        setMpesaAmountInput("");
      }
    }
  };

  const handlePaybillSubmit = async () => {
    const amount = parseFloat(mpesaAmountInput) || Math.floor(remainingAmount);
    if (amount > 0 && mpesaPhone) {
      await onPaybillPayment(mpesaPhone, amount);
    }
  };

  const handleStoreCreditSubmit = async () => {
    const amount = parseFloat(scInput);
    if (amount > 0 && amount <= maximumStoreCreditPayment) {
      await onStoreCreditPayment(amount, scBarcode.trim() || null);
      setScInput("");
      setScBarcode("");
      setStoreCreditInputError("");
    }
  };

  const getStatusBadge = () => {
    switch (status) {
      case "pending":
        return (
          <Badge variant="secondary" className="gap-1">
            <AlertCircle className="h-3 w-3" /> Awaiting Payment
          </Badge>
        );
      case "partially_paid":
        return (
          <Badge
            variant="outline"
            className="gap-1 border-amber-500 text-amber-600"
          >
            <AlertCircle className="h-3 w-3" /> Partial Payment
          </Badge>
        );
      case "paid":
        return (
          <Badge className="gap-1 bg-green-600">
            <Check className="h-3 w-3" /> Fully Paid
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive" className="gap-1">
            <X className="h-3 w-3" /> Payment Failed
          </Badge>
        );
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
        {checkoutReserved && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            {recoveringCheckout
              ? "Checking the saved checkout reservation. Cart changes are temporarily disabled."
              : "Stock and tender amounts are reserved for this checkout. Finish or release this checkout before changing its items."}
            {canCancelCheckout && (
              <Button
                variant="outline"
                size="sm"
                className="mt-2 w-full"
                onClick={() => void onCancelCheckout()}
                disabled={disabled}
              >
                Release Reserved Stock
              </Button>
            )}
          </div>
        )}
        {/* Amount Summary */}
        <div className="rounded-lg bg-muted p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span>Total Amount:</span>
            <span className="font-bold">
              KES {totalAmount.toLocaleString()}
            </span>
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
            <span>{remainingAmount > 0 ? "Remaining:" : "Change:"}</span>
            <span
              className={
                remainingAmount > 0 ? "text-destructive" : "text-green-600"
              }
            >
              KES{" "}
              {remainingAmount > 0
                ? remainingAmount.toLocaleString()
                : changeAmount.toLocaleString()}
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
                disabled={disabled || mpesaPending || checkoutReserved}
                min="0"
              />
              <Button
                onClick={handleCashSubmit}
                disabled={disabled || mpesaPending || checkoutReserved || !cashInput}
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
                  disabled={disabled || mpesaPending || checkoutReserved}
                >
                  +{amount}
                </Button>
              ))}
              {remainingAmount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    handleQuickCash(totalAmount - mpesaAmount - storeCreditAmount)
                  }
                  disabled={disabled || mpesaPending || checkoutReserved}
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
                  placeholder="Voucher barcode (leave blank for customer account credit)"
                  value={scBarcode}
                  onChange={(e) => {
                    const value = e.target.value;
                    setScBarcode(value);
                    setBarcodeBalance(null);
                    setBarcodeLookupState(value.trim() ? "loading" : "idle");
                    setStoreCreditInputError("");
                  }}
                  disabled={disabled || mpesaPending || checkoutReserved}
                />
                {scBarcode.trim() && (
                  <p
                    className={`text-sm ${
                      barcodeLookupState === "invalid"
                        ? "text-destructive"
                        : "text-muted-foreground"
                    }`}
                    role={barcodeLookupState === "invalid" ? "alert" : undefined}
                  >
                    {barcodeLookupState === "loading"
                      ? "Checking voucher balance..."
                      : barcodeLookupState === "invalid"
                        ? "This barcode is invalid, expired, inactive, or has no balance."
                        : barcodeBalance !== null
                          ? `Voucher balance: KES ${barcodeBalance.toLocaleString(
                              "en-KE",
                              { minimumFractionDigits: 2 },
                            )}`
                          : ""}
                  </p>
                )}
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder={
                      maximumStoreCreditPayment > 0
                        ? `Amount to deduct (max ${maximumStoreCreditPayment.toLocaleString(
                            "en-KE",
                            { minimumFractionDigits: 2 },
                          )})`
                        : "Amount to deduct"
                    }
                    value={scInput}
                    onChange={(e) => {
                      const value = e.target.value;
                      setStoreCreditInputError("");
                      if (
                        value !== "" &&
                        Number.isFinite(Number(value)) &&
                        Number(value) > maximumStoreCreditPayment
                      ) {
                        setStoreCreditInputError(
                          `Amount cannot exceed the available store credit of KES ${maximumStoreCreditPayment.toLocaleString(
                            "en-KE",
                            { minimumFractionDigits: 2 },
                          )}.`,
                        );
                        return;
                      }
                      setScInput(value);
                    }}
                    disabled={
                      disabled ||
                      mpesaPending ||
                      checkoutReserved ||
                      (scBarcode.trim() !== "" && barcodeLookupState !== "valid")
                    }
                    min="0"
                    max={maximumStoreCreditPayment}
                    step="0.01"
                    aria-label="Amount of store credit to use"
                    aria-invalid={storeCreditAmountExceedsBalance}
                  />
                  <Button
                    onClick={handleStoreCreditSubmit}
                    disabled={
                      disabled ||
                      mpesaPending ||
                      checkoutReserved ||
                      !scInput ||
                      maximumStoreCreditPayment <= 0 ||
                      storeCreditAmountExceedsBalance ||
                      (scBarcode.trim() !== "" && barcodeLookupState !== "valid")
                    }
                    variant="secondary"
                  >
                    Apply
                  </Button>
                </div>
                {(storeCreditInputError || storeCreditAmountExceedsBalance) && (
                  <p className="text-sm text-destructive" role="alert">
                    {storeCreditInputError ||
                      `Amount cannot exceed the available store credit of KES ${maximumStoreCreditPayment.toLocaleString(
                        "en-KE",
                        { minimumFractionDigits: 2 },
                      )}.`}
                  </p>
                )}
                {!scBarcode.trim() && storeCreditAccountBalance > 0 && (
                  <p className="text-sm text-muted-foreground">
                    Customer account credit: KES{" "}
                    {storeCreditAccountBalance.toLocaleString("en-KE", {
                      minimumFractionDigits: 2,
                    })}
                  </p>
                )}
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
              {stkPushEnabled === false && (
                <div
                  role="alert"
                  className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"
                >
                  <p className="font-semibold">STK Push setup is incomplete</p>
                  {stkPushIssues.length > 0 ? (
                    <>
                      <p className="mt-1">
                        The Till Number alone is not enough. An administrator must configure:
                      </p>
                      <ul className="mt-1 list-inside list-disc">
                        {stkPushIssues.map((issue) => <li key={issue}>{issue}</li>)}
                      </ul>
                    </>
                  ) : (
                    <p className="mt-1">
                      Refresh the payment screen or ask an administrator to check M-Pesa configuration.
                    </p>
                  )}
                  {paybillEnabled && paybillNumber && (
                    <p className="mt-2">You can still use the Paybill option below.</p>
                  )}
                </div>
              )}
              <div className="space-y-2">
                <Input
                  type="tel"
                  placeholder="Phone number (e.g., 0712345678 or 254712345678)"
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
                  <div className="flex gap-2">
                    <Button
                      onClick={handleMpesaSubmit}
                      disabled={disabled || mpesaPending || !mpesaPhone || stkPushEnabled === false}
                      className="min-w-[100px]"
                    >
                      {mpesaPending && !paybillReference ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Waiting...
                        </>
                      ) : (
                        "Send STK"
                      )}
                    </Button>
                    {paybillEnabled && paybillNumber && (
                      <Button
                        variant="outline"
                        onClick={handlePaybillSubmit}
                        disabled={disabled || mpesaPending || !mpesaPhone}
                      >
                        Paybill
                      </Button>
                    )}
                  </div>
                </div>
              </div>
              {paybillReference && paybillNumber && (
                <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm space-y-1">
                  <p className="font-semibold">Customer pays using M-Pesa Paybill</p>
                  <p>Paybill: <strong>{paybillNumber}</strong></p>
                  <p>Account number: <strong className="select-all">{paybillReference}</strong></p>
                  <p>Amount: <strong>KES {(paybillAmount ?? Math.floor(remainingAmount)).toLocaleString()}</strong></p>
                  <p className="text-muted-foreground">Keep this checkout open while Safaricom confirms payment.</p>
                </div>
              )}
              {mpesaPending && (
                <p className="text-sm text-muted-foreground animate-pulse">
                  {paybillReference
                    ? "Waiting for Safaricom to confirm the Paybill payment..."
                    : "Waiting for customer to confirm payment on their phone..."}
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
