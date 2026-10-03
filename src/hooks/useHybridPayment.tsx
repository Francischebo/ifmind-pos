import { useState, useEffect, useCallback } from "react";
import { ApiService } from "@/lib/api";
import { toast } from "sonner";

export type PaymentStatus = "pending" | "partially_paid" | "paid" | "failed";

interface PaymentState {
  totalAmount: number;
  cashAmount: number;
  mpesaAmount: number;
  storeCreditAmount: number;
  storeCreditBarcode: string | null;
  remainingAmount: number;
  changeAmount: number;
  status: PaymentStatus;
  mpesaPending: boolean;
  recoveringMpesaSession: boolean;
  checkoutReserved: boolean;
  checkoutRequestId: string | null;
  mpesaTransactionIds: string[];
  paybillReference: string | null;
  paybillAmount: number | null;
}

interface StkCheckoutDetails {
  items: Array<{ product_id: string; quantity: number }>;
  loyalty_discount: number;
  cash_amount: number;
  store_credit_amount: number;
  store_credit_barcode?: string;
  warehouse_id?: string;
  customer_id?: string;
}

interface MpesaTransaction {
  id: string;
  status: string;
  amount: number;
  result_desc?: string | null;
  mpesa_receipt_number: string | null;
  checkout_request_id: string | null;
  account_reference: string | null;
}

interface CheckoutSessionResponse {
  id: string;
  status: "reserved" | "completed" | "cancelled";
  total_amount: number;
  cash_amount: number;
  store_credit_amount: number;
  store_credit_barcode: string | null;
  mpesa_transactions: MpesaTransaction[];
}

const getStoredCheckoutId = (key: string) => {
  try {
    const id = window.localStorage.getItem(key) || "";
    return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
      ? id
      : null;
  } catch {
    return null;
  }
};

export function useHybridPayment(totalAmount: number, ownerId = "unknown") {
  const sessionKey = `pos-checkout-session:${ownerId}`;
  const paymentKey = `pos-checkout-payment:${ownerId}`;
  const [checkoutSessionId, setCheckoutSessionId] = useState(() =>
    getStoredCheckoutId(sessionKey) || crypto.randomUUID(),
  );
  const [checkoutReserved, setCheckoutReserved] = useState(() => Boolean(getStoredCheckoutId(sessionKey)));
  const [recoveringCheckout, setRecoveringCheckout] = useState(() => Boolean(getStoredCheckoutId(sessionKey)));
  const [state, setState] = useState<PaymentState>(() => {
    try {
      const stored = window.localStorage.getItem(paymentKey);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<PaymentState>;
        const cashAmount = Number(parsed.cashAmount) || 0;
        const mpesaAmount = Number(parsed.mpesaAmount) || 0;
        const storeCreditAmount = Number(parsed.storeCreditAmount) || 0;
        const paid = cashAmount + mpesaAmount + storeCreditAmount;
        return {
          totalAmount,
          cashAmount,
          mpesaAmount,
          storeCreditAmount,
          storeCreditBarcode: typeof parsed.storeCreditBarcode === "string"
            ? parsed.storeCreditBarcode
            : null,
          remainingAmount: Math.max(0, totalAmount - paid),
          changeAmount: Math.max(0, paid - totalAmount),
          status: paid >= totalAmount ? "paid" : paid > 0 ? "partially_paid" : "pending",
          mpesaPending: false,
          recoveringMpesaSession: false,
          checkoutReserved: Boolean(getStoredCheckoutId(sessionKey)),
          checkoutRequestId: null,
          mpesaTransactionIds: Array.isArray(parsed.mpesaTransactionIds)
            ? parsed.mpesaTransactionIds.filter((id): id is string => typeof id === "string")
            : [],
          paybillReference: typeof parsed.paybillReference === "string" ? parsed.paybillReference : null,
          paybillAmount: Number.isFinite(Number(parsed.paybillAmount))
            ? Number(parsed.paybillAmount)
            : null,
        };
      }
    } catch {
      window.localStorage.removeItem(paymentKey);
    }
    return {
      totalAmount,
      cashAmount: 0,
      mpesaAmount: 0,
      storeCreditAmount: 0,
      storeCreditBarcode: null,
      remainingAmount: totalAmount,
      changeAmount: 0,
      status: "pending",
      mpesaPending: false,
      recoveringMpesaSession: false,
      checkoutReserved: false,
      checkoutRequestId: null,
      mpesaTransactionIds: [],
      paybillReference: null,
      paybillAmount: null,
    };
  });

  useEffect(() => {
    setState((prev) => ({ ...prev, checkoutReserved }));
  }, [checkoutReserved]);

  useEffect(() => {
    if (!checkoutReserved) return;
    try {
      window.localStorage.setItem(sessionKey, checkoutSessionId);
      window.localStorage.setItem(paymentKey, JSON.stringify(state));
    } catch (error) {
      console.error("Unable to persist active checkout state:", error);
    }
  }, [checkoutReserved, checkoutSessionId, paymentKey, sessionKey, state]);

  // Update total when it changes
  useEffect(() => {
    setState((prev) => ({
      ...prev,
      totalAmount,
      remainingAmount: Math.max(
        0,
        totalAmount -
          prev.cashAmount -
          prev.mpesaAmount -
          prev.storeCreditAmount,
      ),
    }));
  }, [totalAmount]);

  const restoreCheckoutSession = useCallback((session: CheckoutSessionResponse) => {
    if (session.status !== "reserved") {
      return;
    }
    setRecoveringCheckout(false);
    const completed = session.mpesa_transactions.filter((transaction) => transaction.status === "completed");
    const pending = session.mpesa_transactions.find((transaction) => transaction.status === "pending");
    const mpesaAmount = completed.reduce((sum, transaction) => sum + Number(transaction.amount), 0);
    setCheckoutSessionId(session.id);
    setCheckoutReserved(true);
    setState((prev) => {
      const cashAmount = Number(session.cash_amount);
      const storeCreditAmount = Number(session.store_credit_amount);
      const paid = cashAmount + mpesaAmount + storeCreditAmount;
      return {
        ...prev,
        totalAmount: Number(session.total_amount),
        cashAmount,
        mpesaAmount,
        storeCreditAmount,
        storeCreditBarcode: session.store_credit_barcode,
        remainingAmount: Math.max(0, Number(session.total_amount) - paid),
        changeAmount: Math.max(0, paid - Number(session.total_amount)),
        status: paid >= Number(session.total_amount) ? "paid" : paid > 0 ? "partially_paid" : "pending",
        mpesaPending: Boolean(pending),
        recoveringMpesaSession: Boolean(pending && !pending.checkout_request_id),
        checkoutRequestId: pending?.checkout_request_id || null,
        paybillReference: pending?.account_reference || null,
        paybillAmount: pending?.account_reference ? Number(pending.amount) : null,
        mpesaTransactionIds: completed.map((transaction) => transaction.id),
      };
    });
  }, []);

  const finishCheckoutRecovery = useCallback(() => {
    setRecoveringCheckout(false);
  }, []);

  const clearMissingCheckout = useCallback(() => {
    window.localStorage.removeItem(sessionKey);
    window.localStorage.removeItem(paymentKey);
    setCheckoutReserved(false);
    setRecoveringCheckout(false);
    setCheckoutSessionId(crypto.randomUUID());
    setState((prev) => ({ ...prev, checkoutReserved: false }));
  }, [paymentKey, sessionKey]);

  // Subscribe to M-Pesa transaction updates
  useEffect(() => {
    if (!state.checkoutRequestId && !state.recoveringMpesaSession) return;

    const checkoutRequestId = state.checkoutRequestId;
    const pollStatus = async () => {
      try {
        const transaction = await ApiService.get<MpesaTransaction>(
          checkoutRequestId
            ? `/payments/mpesa/${checkoutRequestId}`
            : `/payments/mpesa/session/${checkoutSessionId}`,
        );
        if (
          !checkoutRequestId &&
          transaction.status === "pending" &&
          transaction.checkout_request_id
        ) {
          setState((prev) => ({
            ...prev,
            recoveringMpesaSession: false,
            checkoutRequestId: transaction.checkout_request_id,
          }));
          return;
        }
        if (!checkoutRequestId && transaction.status === "pending") {
          setState((prev) => ({
            ...prev,
            mpesaPending: true,
            recoveringMpesaSession: true,
            paybillReference: transaction.account_reference || prev.paybillReference,
            paybillAmount: transaction.account_reference ? Number(transaction.amount) : prev.paybillAmount,
          }));
        }
        if (transaction.status === "completed") {
          clearInterval(interval);
          setState((prev) => {
            if (prev.mpesaTransactionIds.includes(transaction.id)) {
              return prev;
            }
            const newMpesaAmount =
              prev.mpesaAmount + Number(transaction.amount);
            const totalPaid =
              prev.cashAmount + newMpesaAmount + prev.storeCreditAmount;
            const isFullyPaid = totalPaid >= prev.totalAmount;
            return {
              ...prev,
              mpesaAmount: newMpesaAmount,
              remainingAmount: Math.max(0, prev.totalAmount - totalPaid),
              changeAmount: Math.max(0, totalPaid - prev.totalAmount),
              status: isFullyPaid ? "paid" : "partially_paid",
              mpesaPending: false,
              recoveringMpesaSession: false,
              checkoutRequestId: null,
              paybillReference: null,
              paybillAmount: null,
              mpesaTransactionIds: [...prev.mpesaTransactionIds, transaction.id],
            };
          });
          toast.success(`M-Pesa payment received!`, {
            description: `Receipt: ${transaction.mpesa_receipt_number || "Confirmed"}`,
          });
        } else if (transaction.status === "failed") {
          clearInterval(interval);
          setState((prev) => ({
            ...prev,
            mpesaPending: false,
            recoveringMpesaSession: false,
            checkoutRequestId: null,
            paybillReference: null,
            paybillAmount: null,
          }));
          toast.error("M-Pesa payment failed", {
            description:
              transaction.result_desc ||
              "Customer cancelled or payment timed out",
          });
        }
      } catch (error) {
        if (
          !checkoutRequestId &&
          error instanceof Error &&
          error.message === "M-Pesa transaction not found"
        ) {
          setState((prev) => ({
            ...prev,
            mpesaPending: false,
            recoveringMpesaSession: false,
          }));
          return;
        }
        console.error("M-Pesa status error:", error);
      }
    };

    const interval = setInterval(pollStatus, 2000);
    pollStatus();

    return () => {
      clearInterval(interval);
    };
  }, [state.checkoutRequestId, state.recoveringMpesaSession, checkoutSessionId]);

  const addCashPayment = useCallback((amount: number) => {
    setState((prev) => {
      const newCashAmount = prev.cashAmount + amount;
      const totalPaid =
        newCashAmount + prev.mpesaAmount + prev.storeCreditAmount;
      const isFullyPaid = totalPaid >= prev.totalAmount;
      const change = Math.max(0, totalPaid - prev.totalAmount);

      return {
        ...prev,
        cashAmount: newCashAmount,
        remainingAmount: Math.max(0, prev.totalAmount - totalPaid),
        changeAmount: change,
        status: isFullyPaid
          ? "paid"
          : totalPaid > 0
            ? "partially_paid"
            : "pending",
      };
    });
  }, []);

  const setCashAmount = useCallback((amount: number) => {
    setState((prev) => {
      const totalPaid = amount + prev.mpesaAmount + prev.storeCreditAmount;
      const isFullyPaid = totalPaid >= prev.totalAmount;
      const change = Math.max(0, totalPaid - prev.totalAmount);

      return {
        ...prev,
        cashAmount: amount,
        remainingAmount: Math.max(0, prev.totalAmount - totalPaid),
        changeAmount: change,
        status: isFullyPaid
          ? "paid"
          : totalPaid > 0
            ? "partially_paid"
            : "pending",
      };
    });
  }, []);

  const initiateSTKPush = useCallback(
    async (
      phoneNumber: string,
      amount: number,
      details: StkCheckoutDetails,
    ) => {
      if (!Number.isSafeInteger(amount) || amount <= 0) {
        toast.error("M-Pesa amount must be a whole number of shillings");
        return false;
      }

      try {
        if (!checkoutReserved) {
          window.localStorage.setItem(sessionKey, checkoutSessionId);
          const reservedSession = await ApiService.post<CheckoutSessionResponse>("/sales/checkouts", {
            checkout_session_id: checkoutSessionId,
            ...details,
          });
          if (reservedSession.status !== "reserved") {
            throw new Error("Checkout stock reservation was not created");
          }
          setCheckoutReserved(true);
        }
        setState((prev) => ({ ...prev, mpesaPending: true, paybillReference: null, paybillAmount: null }));
        const data = await ApiService.post<{
          success: boolean;
          checkout_request_id?: string;
          pending?: boolean;
          error?: string;
        }>("/payments/mpesa/stk-push", {
          phone_number: phoneNumber,
          amount,
          checkout_session_id: checkoutSessionId,
          ...details,
        });

        if (data.success) {
          if (data.checkout_request_id) {
            setState((prev) => ({
              ...prev,
              checkoutRequestId: data.checkout_request_id as string,
            }));
            toast.info("STK Push sent", {
              description:
                "Please check the customer's phone to complete payment",
            });
          } else {
            setState((prev) => ({ ...prev, recoveringMpesaSession: true }));
            toast.info("Checking M-Pesa request status", {
              description: "Please wait before retrying this payment",
            });
          }
          return true;
        } else {
          throw new Error(data.error || "STK Push failed");
        }
      } catch (error) {
        console.error("STK Push error:", error);
        const connectionLost =
          error instanceof Error &&
          error.message.startsWith("Unable to reach the server");
        if (!connectionLost && !checkoutReserved) {
          window.localStorage.removeItem(sessionKey);
        }
        setState((prev) => ({
          ...prev,
          mpesaPending: connectionLost,
          recoveringMpesaSession: connectionLost,
        }));
        if (connectionLost) setCheckoutReserved(true);
        toast.error("Failed to send STK Push", {
          description: error instanceof Error ? error.message : "Please try again",
        });
        return false;
      }
    },
    [checkoutReserved, checkoutSessionId, sessionKey],
  );

  const initiatePaybill = useCallback(
    async (
      phoneNumber: string,
      amount: number,
      details: StkCheckoutDetails,
    ) => {
      if (!Number.isSafeInteger(amount) || amount <= 0) {
        toast.error("M-Pesa amount must be a whole number of shillings");
        return false;
      }
      try {
        if (!checkoutReserved) {
          window.localStorage.setItem(sessionKey, checkoutSessionId);
          const reservedSession = await ApiService.post<CheckoutSessionResponse>("/sales/checkouts", {
            checkout_session_id: checkoutSessionId,
            ...details,
          });
          if (reservedSession.status !== "reserved") {
            throw new Error("Checkout stock reservation was not created");
          }
          setCheckoutReserved(true);
        }
        const paymentDetails = await ApiService.post<{
          success: boolean;
          account_reference: string;
          paybill_number: string;
        }>("/payments/mpesa/paybill-intent", {
          checkout_session_id: checkoutSessionId,
          phone_number: phoneNumber,
          amount,
          cash_amount: details.cash_amount,
          store_credit_amount: details.store_credit_amount,
        });
        setState((prev) => ({
          ...prev,
          mpesaPending: true,
          recoveringMpesaSession: true,
          paybillReference: paymentDetails.account_reference,
          paybillAmount: amount,
        }));
        toast.info("Paybill details ready", {
          description: `Pay KES ${amount.toLocaleString()} using the account reference shown`,
        });
        return true;
      } catch (error) {
        const connectionLost = error instanceof Error &&
          error.message.startsWith("Unable to reach the server");
        if (connectionLost) {
          setCheckoutReserved(true);
          setState((prev) => ({
            ...prev,
            mpesaPending: true,
            recoveringMpesaSession: true,
          }));
        } else if (!checkoutReserved) {
          window.localStorage.removeItem(sessionKey);
        }
        toast.error("Failed to prepare Paybill payment", {
          description: error instanceof Error ? error.message : "Please try again",
        });
        return false;
      }
    },
    [checkoutReserved, checkoutSessionId, sessionKey],
  );

  const cancelCheckout = useCallback(async () => {
    if (!checkoutReserved) return false;
    try {
      await ApiService.post(`/sales/checkouts/${checkoutSessionId}/cancel`, {});
      window.localStorage.removeItem(sessionKey);
      window.localStorage.removeItem(paymentKey);
      setCheckoutReserved(false);
      setRecoveringCheckout(false);
      setCheckoutSessionId(crypto.randomUUID());
      setState((prev) => ({
        ...prev,
        cashAmount: 0,
        mpesaAmount: 0,
        storeCreditAmount: 0,
        storeCreditBarcode: null,
        remainingAmount: prev.totalAmount,
        changeAmount: 0,
        status: "pending",
        mpesaPending: false,
        recoveringMpesaSession: false,
        checkoutRequestId: null,
        mpesaTransactionIds: [],
        paybillReference: null,
        paybillAmount: null,
      }));
      return true;
    } catch (error) {
      toast.error("Unable to release reserved stock", {
        description: error instanceof Error ? error.message : "Checkout is still being paid",
      });
      return false;
    }
  }, [checkoutReserved, checkoutSessionId, paymentKey, sessionKey]);

  const addStoreCreditPayment = useCallback(
    (amount: number, barcode: string | null = null) => {
      setState((prev) => {
        const newSca = prev.storeCreditAmount + amount;
        const totalPaid = prev.cashAmount + prev.mpesaAmount + newSca;
        const isFullyPaid = totalPaid >= prev.totalAmount;
        const change = Math.max(0, totalPaid - prev.totalAmount);

        return {
          ...prev,
          storeCreditAmount: newSca,
          storeCreditBarcode: barcode,
          remainingAmount: Math.max(0, prev.totalAmount - totalPaid),
          changeAmount: change,
          status: isFullyPaid
            ? "paid"
            : totalPaid > 0
              ? "partially_paid"
              : "pending",
        };
      });
    },
    [],
  );

  const reset = useCallback(() => {
    window.localStorage.removeItem(sessionKey);
    window.localStorage.removeItem(paymentKey);
    setCheckoutReserved(false);
    setRecoveringCheckout(false);
    setState({
      totalAmount: 0,
      cashAmount: 0,
      mpesaAmount: 0,
      storeCreditAmount: 0,
      storeCreditBarcode: null,
      remainingAmount: 0,
      changeAmount: 0,
      status: "pending",
      mpesaPending: false,
      recoveringMpesaSession: false,
      checkoutReserved: false,
      checkoutRequestId: null,
      mpesaTransactionIds: [],
      paybillReference: null,
      paybillAmount: null,
    });
    setCheckoutSessionId(crypto.randomUUID());
  }, [paymentKey, sessionKey]);

  return {
    ...state,
    checkoutSessionId,
    checkoutReserved,
    recoveringCheckout,
    restoreCheckoutSession,
    finishCheckoutRecovery,
    clearMissingCheckout,
    cancelCheckout,
    addCashPayment,
    setCashAmount,
    initiateSTKPush,
    initiatePaybill,
    addStoreCreditPayment,
    reset,
    isFullyPaid: state.status === "paid",
    canPrintReceipt: state.status === "paid",
    canCancelCheckout: checkoutReserved && !recoveringCheckout &&
      !state.mpesaPending && !state.recoveringMpesaSession,
  };
}
