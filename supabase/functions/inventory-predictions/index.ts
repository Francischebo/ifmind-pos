import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get historical sales data (last 90 days)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const { data: salesData } = await supabase
      .from('sales')
      .select('created_at, total_amount, payment_method')
      .gte('created_at', ninetyDaysAgo.toISOString())
      .eq('status', 'completed')
      .order('created_at', { ascending: true });

    // Get product sales history
    const { data: productSales } = await supabase
      .from('sale_items')
      .select('created_at, product_id, quantity, line_total, products(name, sku, stock_on_hand, reorder_level)')
      .gte('created_at', ninetyDaysAgo.toISOString())
      .order('created_at', { ascending: true });

    // Get current inventory
    const { data: inventory } = await supabase
      .from('products')
      .select('id, name, sku, stock_on_hand, reorder_level, unit_cost');

    // Prepare data summary for AI
    const dailySales = salesData?.reduce((acc: any, sale) => {
      const date = new Date(sale.created_at).toISOString().split('T')[0];
      if (!acc[date]) acc[date] = { total: 0, count: 0 };
      acc[date].total += Number(sale.total_amount);
      acc[date].count += 1;
      return acc;
    }, {});

    const productSummary = productSales?.reduce((acc: any, item: any) => {
      const pid = item.product_id;
      const product = Array.isArray(item.products) ? item.products[0] : item.products;
      if (!acc[pid]) {
        acc[pid] = {
          name: product?.name || 'Unknown',
          sku: product?.sku || 'N/A',
          currentStock: product?.stock_on_hand || 0,
          reorderLevel: product?.reorder_level || 0,
          totalSold: 0,
          revenue: 0,
          salesCount: 0,
        };
      }
      acc[pid].totalSold += item.quantity;
      acc[pid].revenue += Number(item.line_total);
      acc[pid].salesCount += 1;
      return acc;
    }, {});

    const criticalProducts = inventory?.filter(p =>
      p.stock_on_hand <= p.reorder_level
    ).map(p => ({
      name: p.name,
      sku: p.sku,
      currentStock: p.stock_on_hand,
      reorderLevel: p.reorder_level,
      unitCost: p.unit_cost,
    }));

    // Call Lovable AI for predictions
    const prompt = `You are a business analytics expert specializing in inventory management and sales forecasting.

Based on the following data from the last 90 days:

DAILY SALES SUMMARY:
${JSON.stringify(Object.entries(dailySales || {}).slice(-30), null, 2)}

PRODUCT SALES SUMMARY (Top 10):
${JSON.stringify(Object.values(productSummary || {}).slice(0, 10), null, 2)}

CRITICAL STOCK ITEMS:
${JSON.stringify(criticalProducts, null, 2)}

Please provide:
1. Sales trend forecast for the next 30 days
2. Inventory recommendations with suggested reorder quantities for critical items
3. Product demand patterns and seasonal insights
4. Customer purchasing behavior trends
5. Risk assessment for stockouts

Be specific with numbers and actionable recommendations.`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${geminiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: 'You are a business analytics expert. Provide detailed, data-driven insights with specific numbers and actionable recommendations.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'provide_inventory_insights',
            description: 'Provide detailed inventory and sales predictions',
            parameters: {
              type: 'object',
              properties: {
                salesForecast: {
                  type: 'object',
                  properties: {
                    next7Days: { type: 'number', description: 'Predicted sales for next 7 days' },
                    next30Days: { type: 'number', description: 'Predicted sales for next 30 days' },
                    trendDirection: { type: 'string', enum: ['increasing', 'stable', 'decreasing'] },
                    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
                  },
                  required: ['next7Days', 'next30Days', 'trendDirection', 'confidence'],
                },
                inventoryAlerts: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      productName: { type: 'string' },
                      sku: { type: 'string' },
                      currentStock: { type: 'number' },
                      suggestedReorderQty: { type: 'number' },
                      urgency: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
                      reasoning: { type: 'string' },
                    },
                    required: ['productName', 'sku', 'currentStock', 'suggestedReorderQty', 'urgency', 'reasoning'],
                  },
                },
                demandPatterns: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      pattern: { type: 'string' },
                      insight: { type: 'string' },
                    },
                  },
                },
                recommendations: {
                  type: 'array',
                  items: { type: 'string' },
                },
              },
              required: ['salesForecast', 'inventoryAlerts', 'demandPatterns', 'recommendations'],
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'provide_inventory_insights' } },
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits depleted. Please add credits to continue.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall) {
      throw new Error('No predictions received from AI');
    }

    const predictions = JSON.parse(toolCall.function.arguments);

    console.log('AI Predictions generated:', predictions);

    return new Response(
      JSON.stringify({
        success: true,
        predictions,
        metadata: {
          dataPoints: salesData?.length || 0,
          productsAnalyzed: Object.keys(productSummary || {}).length,
          criticalItems: criticalProducts?.length || 0,
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Inventory predictions error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});