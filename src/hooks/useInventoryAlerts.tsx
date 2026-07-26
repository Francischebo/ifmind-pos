import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface StockAlert {
  id: string;
  name: string;
  sku: string;
  stock_on_hand: number;
  reorder_level: number;
}

export function useInventoryAlerts() {
  const [alerts, setAlerts] = useState<StockAlert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAlerts();

    // Set up real-time subscription for product changes
    const channel = supabase
      .channel('inventory-alerts')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'products'
        },
        () => {
          loadAlerts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadAlerts = async () => {
    try {
      const { data: products } = await supabase
        .from('products')
        .select('id, name, sku, stock_on_hand, reorder_level')
        .order('stock_on_hand', { ascending: true });

      const criticalProducts = products?.filter(
        p => p.stock_on_hand <= p.reorder_level
      ) || [];

      setAlerts(criticalProducts);

      // Show toast for critical items (stock = 0)
      const outOfStock = criticalProducts.filter(p => p.stock_on_hand === 0);
      if (outOfStock.length > 0) {
        toast.error(
          `${outOfStock.length} product${outOfStock.length > 1 ? 's' : ''} out of stock!`,
          {
            description: outOfStock.slice(0, 3).map(p => p.name).join(', '),
            duration: 5000,
          }
        );
      }
    } catch (error) {
      console.error('Error loading inventory alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  return {
    alerts,
    criticalCount: alerts.length,
    outOfStockCount: alerts.filter(a => a.stock_on_hand === 0).length,
    loading,
    refresh: loadAlerts,
  };
}