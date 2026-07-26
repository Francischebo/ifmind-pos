import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface POEmailRequest {
  poId: string;
  vendorEmail: string;
  vendorName: string;
  poNumber: string;
  totalAmount: number;
  items: Array<{
    product_name: string;
    quantity: number;
    unit_cost: number;
  }>;
}

const handler = async (req: Request): Promise<Response> => {
  console.log("send-po-email function called");
  
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("RESEND_API_KEY");
    console.log("RESEND_API_KEY present:", !!apiKey);
    console.log("API Key prefix:", apiKey?.substring(0, 10) + "...");
    
    if (!apiKey || apiKey.trim() === "") {
      console.error("RESEND_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "Email service not configured", details: "Missing RESEND_API_KEY" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    const resend = new Resend(apiKey);
    
    const body = await req.json();
    console.log("Request body:", JSON.stringify(body, null, 2));
    
    const { poId, vendorEmail, vendorName, poNumber, totalAmount, items }: POEmailRequest = body;

    if (!vendorEmail || !vendorName || !poNumber) {
      console.error("Missing required fields:", { vendorEmail, vendorName, poNumber });
      return new Response(
        JSON.stringify({ error: "Missing required fields", details: "vendorEmail, vendorName, and poNumber are required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    console.log(`Sending PO email to: ${vendorEmail} for PO: ${poNumber}`);

    const itemsHtml = items.map(item => `
      <tr>
        <td style="padding: 12px; border: 1px solid #e5e7eb;">${item.product_name}</td>
        <td style="padding: 12px; border: 1px solid #e5e7eb; text-align: center;">${item.quantity}</td>
        <td style="padding: 12px; border: 1px solid #e5e7eb; text-align: right;">KSh ${item.unit_cost.toLocaleString('en-KE', { minimumFractionDigits: 2 })}</td>
        <td style="padding: 12px; border: 1px solid #e5e7eb; text-align: right;">KSh ${(item.quantity * item.unit_cost).toLocaleString('en-KE', { minimumFractionDigits: 2 })}</td>
      </tr>
    `).join('');

    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #f8f9fa; padding: 30px; border-radius: 10px; margin-bottom: 20px;">
            <h1 style="color: #2563eb; margin: 0 0 10px 0;">Purchase Order</h1>
            <p style="font-size: 18px; color: #666; margin: 0;">PO Number: <strong>${poNumber}</strong></p>
          </div>

          <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <p style="font-size: 16px; margin-bottom: 20px;">Dear ${vendorName},</p>
            
            <p style="font-size: 16px; margin-bottom: 20px;">
              We are sending you this purchase order for the following items. Please review and confirm receipt.
            </p>

            <table style="width: 100%; border-collapse: collapse; margin: 30px 0;">
              <thead>
                <tr style="background-color: #f8f9fa;">
                  <th style="padding: 12px; border: 1px solid #e5e7eb; text-align: left;">Product</th>
                  <th style="padding: 12px; border: 1px solid #e5e7eb; text-align: center;">Quantity</th>
                  <th style="padding: 12px; border: 1px solid #e5e7eb; text-align: right;">Unit Cost</th>
                  <th style="padding: 12px; border: 1px solid #e5e7eb; text-align: right;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
              <tfoot>
                <tr style="background-color: #f8f9fa; font-weight: bold;">
                  <td colspan="3" style="padding: 12px; border: 1px solid #e5e7eb; text-align: right;">Grand Total:</td>
                  <td style="padding: 12px; border: 1px solid #e5e7eb; text-align: right; color: #2563eb;">KSh ${totalAmount.toLocaleString('en-KE', { minimumFractionDigits: 2 })}</td>
                </tr>
              </tfoot>
            </table>

            <div style="background-color: #eff6ff; padding: 20px; border-radius: 8px; border-left: 4px solid #2563eb; margin-top: 30px;">
              <h3 style="margin: 0 0 10px 0; color: #2563eb;">Next Steps:</h3>
              <ol style="margin: 10px 0; padding-left: 20px;">
                <li>Review the purchase order details</li>
                <li>Generate and send your invoice</li>
                <li>Prepare the delivery note</li>
                <li>Schedule delivery of the products</li>
              </ol>
            </div>

            <p style="font-size: 16px; margin-top: 30px;">
              If you have any questions or concerns, please contact us immediately.
            </p>

            <p style="font-size: 16px; margin-top: 20px;">
              Best regards,<br>
              <strong>POS System Team</strong>
            </p>
          </div>

          <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #666; font-size: 14px;">
            <p>This is an automated message from your POS System</p>
          </div>
        </body>
      </html>
    `;

    console.log("Sending email via Resend...");
    
    const emailResponse = await resend.emails.send({
      from: "POS System <onboarding@resend.dev>",
      to: [vendorEmail],
      subject: `Purchase Order ${poNumber}`,
      html: emailHtml,
    });

    console.log("Resend API response:", JSON.stringify(emailResponse, null, 2));

    if (emailResponse.error) {
      console.error("Resend API error:", emailResponse.error);
      return new Response(
        JSON.stringify({ 
          error: "Failed to send email", 
          details: emailResponse.error.message || "Unknown Resend error" 
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    console.log("PO email sent successfully:", emailResponse.data);

    return new Response(JSON.stringify({ success: true, data: emailResponse.data }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in send-po-email function:", error);
    console.error("Error stack:", error.stack);
    return new Response(
      JSON.stringify({ error: "Failed to send email", details: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
