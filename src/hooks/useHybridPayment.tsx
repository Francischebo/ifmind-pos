import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type PaymentStatus = 'pending' | 'partially_paid' | 'paid' | 'failed';

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
  checkoutRequestId: string | null;
}

interface MpesaTransaction {
  id: string;
  status: string;
  amount: number;
  mpesa_receipt_number: string | null;
  checkout_request_id: string | null;
}

export function useHybridPayment(saleId: string | null, totalAmount: number) {
  const [state, setState] = useState<PaymentState>({
    totalAmount,
    cashAmount: 0,
    mpesaAmount: 0,
    storeCreditAmount: 0,
    storeCreditBarcode: null,
    remainingAmount: totalAmount,
    changeAmount: 0,
    status: 'pending',
    mpesaPending: false,
    checkoutRequestId: null,
  });

  // Update total when it changes
  useEffect(() => {
    setState(prev => ({
      ...prev,
      totalAmount,
      remainingAmount: Math.max(0, totalAmount - prev.cashAmount - prev.mpesaAmount - prev.storeCreditAmount),
    }));
  }, [totalAmount]);

  // Subscribe to M-Pesa transaction updates
  useEffect(() => {
    if (!state.checkoutRequestId) return;

    const channel = supabase
      .channel('mpesa-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'mpesa_transactions',
          filter: `checkout_request_id=eq.${state.checkoutRequestId}`,
        },
        (payload) => {
          const transaction = payload.new as MpesaTransaction;
          console.log('M-Pesa transaction updated:', transaction);

          if (transaction.status === 'completed') {
            const newMpesaAmount = state.mpesaAmount + transaction.amount;
            const totalPaid = state.cashAmount + newMpesaAmount + state.storeCreditAmount;
            const isFullyPaid = totalPaid >= state.totalAmount;
            const change = Math.max(0, totalPaid - state.totalAmount);

            setState(prev => ({
              ...prev,
              mpesaAmount: newMpesaAmount,
              remainingAmount: Math.max(0, prev.totalAmount - prev.cashAmount - newMpesaAmount - prev.storeCreditAmount),
              changeAmount: change,
              status: isFullyPaid ? 'paid' : 'partially_paid',
              mpesaPending: false,
              checkoutRequestId: null,
            }));

            toast.success(`M-Pesa payment of KES ${transaction.amount.toLocaleString()} received!`, {
              description: `Receipt: ${transaction.mpesa_receipt_number}`,
            });
          } else if (transaction.status === 'failed') {
            setState(prev => ({
              ...prev,
              mpesaPending: false,
              checkoutRequestId: null,
            }));
            toast.error('M-Pesa payment failed', {
              description: 'Customer cancelled or payment timed out',
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [state.checkoutRequestId, state.cashAmount, state.mpesaAmount, state.totalAmount]);

  const addCashPayment = useCallback((amount: number) => {
    setState(prev => {
      const newCashAmount = prev.cashAmount + amount;
      const totalPaid = newCashAmount + prev.mpesaAmount + prev.storeCreditAmount;
      const isFullyPaid = totalPaid >= prev.totalAmount;
      const change = Math.max(0, totalPaid - prev.totalAmount);

      return {
        ...prev,
        cashAmount: newCashAmount,
        remainingAmount: Math.max(0, prev.totalAmount - totalPaid),
        changeAmount: change,
        status: isFullyPaid ? 'paid' : totalPaid > 0 ? 'partially_paid' : 'pending',
      };
    });
  }, []);

  const setCashAmount = useCallback((amount: number) => {
    setState(prev => {
      const totalPaid = amount + prev.mpesaAmount + prev.storeCreditAmount;
      const isFullyPaid = totalPaid >= prev.totalAmount;
      const change = Math.max(0, totalPaid - prev.totalAmount);

      return {
        ...prev,
        cashAmount: amount,
        remainingAmount: Math.max(0, prev.totalAmount - totalPaid),
        changeAmount: change,
        status: isFullyPaid ? 'paid' : totalPaid > 0 ? 'partially_paid' : 'pending',
      };
    });
  }, []);

  const initiateSTKPush = useCallback(async (phoneNumber: string, amount: number) => {
    if (!saleId) {
      toast.error('No active sale');
      return false;
    }

    setState(prev => ({ ...prev, mpesaPending: true }));

    try {
      const { data, error } = await supabase.functions.invoke('mpesa-stk-push', {
        body: {
          phone_number: phoneNumber,
          amount: Math.round(amount),
          sale_id: saleId,
          account_reference: `Sale-${saleId.slice(0, 8)}`,
        },
      });

      if (error) throw error;

      if (data.success) {
        setState(prev => ({
          ...prev,
          checkoutRequestId: data.checkout_request_id,
        }));
        toast.info('STK Push sent', {
          description: 'Please check the customer\'s phone to complete payment',
        });
        return true;
      } else {
        throw new Error(data.error || 'STK Push failed');
      }
    } catch (error: any) {
      console.error('STK Push error:', error);
      setState(prev => ({ ...prev, mpesaPending: false }));
      toast.error('Failed to send STK Push', {
        description: error.message,
      });
      return false;
    }
  }, [saleId]);

  const addStoreCreditPayment = useCallback((amount: number, barcode: string | null = null) => {
    setState(prev => {
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
        status: isFullyPaid ? 'paid' : totalPaid > 0 ? 'partially_paid' : 'pending',
      };
    });
  }, []);

  const reset = useCallback(() => {
    setState({
      totalAmount: 0,
      cashAmount: 0,
      mpesaAmount: 0,
      storeCreditAmount: 0,
      storeCreditBarcode: null,
      remainingAmount: 0,
      changeAmount: 0,
      status: 'pending',
      mpesaPending: false,
      checkoutRequestId: null,
    });
  }, []);

  return {
    ...state,
    addCashPayment,
    setCashAmount,
    initiateSTKPush,
    addStoreCreditPayment,
    reset,
    isFullyPaid: state.status === 'paid',
    canPrintReceipt: state.status === 'paid',
  };
}