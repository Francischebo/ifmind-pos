import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MpesaCallback {
  Body: {
    stkCallback: {
      MerchantRequestID: string;
      CheckoutRequestID: string;
      ResultCode: number;
      ResultDesc: string;
      CallbackMetadata?: {
        Item: Array<{
          Name: string;
          Value?: string | number;
        }>;
      };
    };
  };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const callback: MpesaCallback = await req.json();
    console.log('M-Pesa callback received:', JSON.stringify(callback));

    const stkCallback = callback.Body.stkCallback;
    const { CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = stkCallback;

    // Find the transaction
    const { data: transaction, error: fetchError } = await supabase
      .from('mpesa_transactions')
      .select('*')
      .eq('checkout_request_id', CheckoutRequestID)
      .maybeSingle();

    if (fetchError || !transaction) {
      console.error('Transaction not found:', CheckoutRequestID, fetchError);
      return new Response(
        JSON.stringify({ ResultCode: 0, ResultDesc: 'Accepted' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check for duplicate callback
    if (transaction.callback_received) {
      console.log('Duplicate callback ignored for:', CheckoutRequestID);
      return new Response(
        JSON.stringify({ ResultCode: 0, ResultDesc: 'Accepted' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let mpesaReceiptNumber = null;
    let transactionAmount = transaction.amount;

    // Validate callback data
    if (!ResultCode || CallbackMetadata === undefined) {
      console.error('Invalid callback data - missing ResultCode or CallbackMetadata');
      return new Response(
        JSON.stringify({ ResultCode: 0, ResultDesc: 'Accepted' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Only process successful payments
    if (ResultCode !== 0) {
      console.log(`Payment failed for ${CheckoutRequestID}: ${ResultDesc}`);
      // Update transaction as failed
      const { error: updateError } = await supabase
        .from('mpesa_transactions')
        .update({
          status: 'failed',
          result_desc: ResultDesc,
          callback_received: true,
          callback_data: callback,
          updated_at: new Date().toISOString(),
        })
        .eq('id', transaction.id);

      if (updateError) {
        console.error('Failed to update failed transaction:', updateError);
      }

      return new Response(
        JSON.stringify({ ResultCode: 0, ResultDesc: 'Accepted' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
      for (const item of CallbackMetadata.Item) {
        if (item.Name === 'MpesaReceiptNumber') {
          mpesaReceiptNumber = String(item.Value);
        }
        if (item.Name === 'Amount') {
          transactionAmount = Number(item.Value);
        }
      }

    const status = ResultCode === 0 ? 'completed' : 'failed';

    // Update transaction
    const { error: updateTxError } = await supabase
      .from('mpesa_transactions')
      .update({
        status,
        mpesa_receipt_number: mpesaReceiptNumber,
        result_desc: ResultDesc,
        callback_received: true,
        callback_data: callback,
        amount: transactionAmount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', transaction.id);

    if (updateTxError) {
      console.error('Failed to update transaction:', updateTxError);
    }

    // If successful, update the sale
    if (ResultCode === 0 && transaction.sale_id) {
      // Get current sale
      const { data: sale, error: saleError } = await supabase
        .from('sales')
        .select('*')
        .eq('id', transaction.sale_id)
        .maybeSingle();

      if (sale && !saleError) {
        const newMpesaAmount = (sale.mpesa_amount || 0) + transactionAmount;
        const totalPaid = (sale.cash_amount || 0) + newMpesaAmount;
        const isFullyPaid = totalPaid >= sale.total_amount;
        const changeAmount = Math.max(0, totalPaid - sale.total_amount);

        const { error: updateSaleError } = await supabase
          .from('sales')
          .update({
            mpesa_amount: newMpesaAmount,
            payment_status: isFullyPaid ? 'paid' : 'partially_paid',
            change_amount: changeAmount,
          })
          .eq('id', transaction.sale_id);

        if (updateSaleError) {
          console.error('Failed to update sale:', updateSaleError);
        } else {
          console.log(`Sale ${transaction.sale_id} updated: mpesa=${newMpesaAmount}, status=${isFullyPaid ? 'paid' : 'partially_paid'}`);
        }
      }
    }

    console.log(`Transaction ${CheckoutRequestID} updated to ${status}`);

    // Always return success to M-Pesa
    return new Response(
      JSON.stringify({ ResultCode: 0, ResultDesc: 'Accepted' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Callback processing error:', error);
    // Always return success to M-Pesa to prevent retries
    return new Response(
      JSON.stringify({ ResultCode: 0, ResultDesc: 'Accepted' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});