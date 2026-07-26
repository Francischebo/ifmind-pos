import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get admin users
    const { data: adminRoles } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin');

    if (!adminRoles || adminRoles.length === 0) {
      return new Response(JSON.stringify({ message: 'No admin users found' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const adminUserIds = adminRoles.map(r => r.user_id);

    // Get admin emails from profiles
    const { data: adminProfiles } = await supabase
      .from('profiles')
      .select('email')
      .in('id', adminUserIds);

    if (!adminProfiles || adminProfiles.length === 0) {
      return new Response(JSON.stringify({ message: 'No admin emails found' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get low stock products - products where stock is at or below reorder level
    const { data: lowStockProducts } = await supabase
      .from('products')
      .select('name, sku, stock_on_hand, reorder_level')
      .filter('stock_on_hand', 'lte', 'reorder_level')
      .order('stock_on_hand', { ascending: true });

    if (!lowStockProducts || lowStockProducts.length === 0) {
      return new Response(JSON.stringify({ message: 'No low stock alerts' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const lowStockHtml = lowStockProducts.map(product => `
      <tr style="${product.stock_on_hand === 0 ? 'background-color: #fee2e2;' : 'background-color: #fef3c7;'}">
        <td style="padding: 12px; border: 1px solid #e5e7eb;">${product.name}</td>
        <td style="padding: 12px; border: 1px solid #e5e7eb; text-align: center;">${product.sku}</td>
        <td style="padding: 12px; border: 1px solid #e5e7eb; text-align: center; font-weight: bold; color: ${product.stock_on_hand === 0 ? '#dc2626' : '#f59e0b'};">${product.stock_on_hand}</td>
        <td style="padding: 12px; border: 1px solid #e5e7eb; text-align: center;">${product.reorder_level}</td>
        <td style="padding: 12px; border: 1px solid #e5e7eb; text-align: center;">
          <span style="background-color: ${product.stock_on_hand === 0 ? '#dc2626' : '#f59e0b'}; color: white; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: bold;">
            ${product.stock_on_hand === 0 ? 'OUT OF STOCK' : 'LOW STOCK'}
          </span>
        </td>
      </tr>
    `).join('');

    // Send email to all admins
    const emailPromises = adminProfiles.map(admin => 
      resend.emails.send({
        from: "POS Inventory Alert <onboarding@resend.dev>",
        to: [admin.email],
        subject: `⚠️ Critical Inventory Alert - ${lowStockProducts.length} Products Need Attention`,
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 900px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
              <div style="background: linear-gradient(135deg, #dc2626 0%, #f59e0b 100%); padding: 40px; border-radius: 10px; margin-bottom: 20px; text-align: center;">
                <h1 style="color: white; margin: 0 0 10px 0; font-size: 28px;">⚠️ Inventory Alert</h1>
                <p style="font-size: 18px; color: rgba(255,255,255,0.9); margin: 0;">Critical Stock Levels Detected</p>
              </div>

              <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                <div style="background-color: #fef3c7; padding: 20px; border-radius: 8px; border-left: 4px solid #f59e0b; margin-bottom: 30px;">
                  <h2 style="margin: 0 0 10px 0; color: #f59e0b; font-size: 20px;">📊 Summary</h2>
                  <p style="margin: 0; font-size: 16px;">
                    <strong>${lowStockProducts.length}</strong> product(s) require immediate attention to prevent stockouts.
                  </p>
                </div>

                <h3 style="margin: 0 0 20px 0; color: #111827;">Products Requiring Reorder:</h3>

                <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                  <thead>
                    <tr style="background-color: #f3f4f6;">
                      <th style="padding: 12px; border: 1px solid #e5e7eb; text-align: left;">Product Name</th>
                      <th style="padding: 12px; border: 1px solid #e5e7eb; text-align: center;">SKU</th>
                      <th style="padding: 12px; border: 1px solid #e5e7eb; text-align: center;">Current Stock</th>
                      <th style="padding: 12px; border: 1px solid #e5e7eb; text-align: center;">Reorder Level</th>
                      <th style="padding: 12px; border: 1px solid #e5e7eb; text-align: center;">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${lowStockHtml}
                  </tbody>
                </table>

                <div style="background-color: #eff6ff; padding: 20px; border-radius: 8px; border-left: 4px solid #2563eb; margin-top: 30px;">
                  <h3 style="margin: 0 0 10px 0; color: #2563eb;">📝 Recommended Actions:</h3>
                  <ul style="margin: 10px 0; padding-left: 20px;">
                    <li>Review current stock levels and sales trends</li>
                    <li>Create purchase orders for low-stock items</li>
                    <li>Contact vendors to confirm delivery timelines</li>
                    <li>Consider adjusting reorder levels based on demand</li>
                  </ul>
                </div>

                <div style="text-align: center; margin-top: 30px;">
                  <p style="font-size: 14px; color: #6b7280;">
                    This is an automated alert from your POS System<br>
                    Generated on ${new Date().toLocaleString('en-KE', { dateStyle: 'full', timeStyle: 'short' })}
                  </p>
                </div>
              </div>
            </body>
          </html>
        `,
      })
    );

    const results = await Promise.all(emailPromises);
    console.log("Inventory alerts sent successfully:", results);

    return new Response(JSON.stringify({ 
      success: true, 
      emailsSent: results.length,
      lowStockCount: lowStockProducts.length 
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in send-inventory-alerts function:", error);
    return new Response(
      JSON.stringify({ error: "Failed to send alerts", details: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
