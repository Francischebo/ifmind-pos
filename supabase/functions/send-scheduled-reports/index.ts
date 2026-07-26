import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Get admin users
    const { data: adminRoles } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin');

    if (!adminRoles || adminRoles.length === 0) {
      return new Response(JSON.stringify({ message: 'No admin users found' }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminIds = adminRoles.map(r => r.user_id);

    // Get admin profiles with emails
    const { data: adminProfiles } = await supabase
      .from('profiles')
      .select('email, full_name')
      .in('id', adminIds);

    if (!adminProfiles || adminProfiles.length === 0) {
      return new Response(JSON.stringify({ message: 'No admin profiles found' }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get today's date range
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const endOfDay = new Date(today.setHours(23, 59, 59, 999));

    // Get sales data
    const { data: sales } = await supabase
      .from('sales')
      .select('total_amount, created_at')
      .gte('created_at', startOfDay.toISOString())
      .lte('created_at', endOfDay.toISOString());

    const totalSales = sales?.reduce((sum, sale) => sum + Number(sale.total_amount), 0) || 0;
    const salesCount = sales?.length || 0;

    // Get low stock products
    const { data: lowStock } = await supabase
      .from('products')
      .select('name, sku, stock_on_hand, reorder_level');

    const lowStockProducts = lowStock?.filter(p => p.stock_on_hand <= p.reorder_level) || [];

    // Get total products
    const { count: totalProducts } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true });

    // Generate report HTML
    const lowStockHtml = lowStockProducts.length > 0 
      ? lowStockProducts.map(p => `
        <tr>
          <td style="padding: 8px; border: 1px solid #e5e7eb;">${p.name}</td>
          <td style="padding: 8px; border: 1px solid #e5e7eb;">${p.sku}</td>
          <td style="padding: 8px; border: 1px solid #e5e7eb; text-align: center;">${p.stock_on_hand}</td>
          <td style="padding: 8px; border: 1px solid #e5e7eb; text-align: center;">${p.reorder_level}</td>
        </tr>
      `).join('')
      : '<tr><td colspan="4" style="padding: 8px; text-align: center;">No low stock items</td></tr>';

    const reportHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Daily Business Report</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #2563eb; color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h1 style="margin: 0;">Daily Business Report</h1>
            <p style="margin: 5px 0 0 0; opacity: 0.9;">${today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>

          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h2 style="color: #2563eb; margin-top: 0;">Sales Summary</h2>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
              <div style="background: white; padding: 15px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                <p style="margin: 0; color: #666; font-size: 14px;">Total Sales</p>
                <p style="margin: 5px 0 0 0; font-size: 24px; font-weight: bold; color: #2563eb;">KSh ${totalSales.toLocaleString('en-KE', { minimumFractionDigits: 2 })}</p>
              </div>
              <div style="background: white; padding: 15px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                <p style="margin: 0; color: #666; font-size: 14px;">Number of Transactions</p>
                <p style="margin: 5px 0 0 0; font-size: 24px; font-weight: bold; color: #2563eb;">${salesCount}</p>
              </div>
            </div>
          </div>

          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h2 style="color: #2563eb; margin-top: 0;">Inventory Overview</h2>
            <p style="margin: 0 0 10px 0;">Total Products: <strong>${totalProducts || 0}</strong></p>
            <p style="margin: 0 0 10px 0;">Low Stock Items: <strong style="color: #dc2626;">${lowStockProducts.length}</strong></p>
            
            ${lowStockProducts.length > 0 ? `
              <h3 style="margin-top: 20px; margin-bottom: 10px;">Critical Stock Alerts</h3>
              <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden;">
                <thead>
                  <tr style="background-color: #2563eb; color: white;">
                    <th style="padding: 10px; text-align: left;">Product</th>
                    <th style="padding: 10px; text-align: left;">SKU</th>
                    <th style="padding: 10px; text-align: center;">Stock</th>
                    <th style="padding: 10px; text-align: center;">Reorder Level</th>
                  </tr>
                </thead>
                <tbody>
                  ${lowStockHtml}
                </tbody>
              </table>
            ` : ''}
          </div>

          <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #666; font-size: 14px;">
            <p>This is an automated daily report from your POS System</p>
          </div>
        </body>
      </html>
    `;

    // Send emails to all admins
    const emailPromises = adminProfiles.map(admin =>
      resend.emails.send({
        from: "POS System <onboarding@resend.dev>",
        to: [admin.email],
        subject: `Daily Business Report - ${today.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
        html: reportHtml,
      })
    );

    await Promise.all(emailPromises);

    console.log(`Sent reports to ${adminProfiles.length} admin users`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Reports sent to ${adminProfiles.length} admins`,
        stats: {
          totalSales,
          salesCount,
          lowStockCount: lowStockProducts.length,
          totalProducts
        }
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in send-scheduled-reports:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
};

serve(handler);
