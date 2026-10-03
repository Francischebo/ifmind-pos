import { useCallback, useEffect, useRef, useState } from "react";
import { ApiService } from "@/lib/api";
import { useWebSockets } from "@/hooks/useWebSockets";
import { toast } from "sonner";

interface StockAlert {
  id: string;
  name: string;
  sku: string;
  stock_on_hand: number;
  reorder_level: number;
}

let previouslyOutOfStockIds: Set<string> | null = null;

export function useInventoryAlerts() {
  const [alerts, setAlerts] = useState<StockAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const latestProductId = useRef<string | null>(null);
  const requestSequence = useRef(0);
  const refreshTimer = useRef<number | null>(null);

  const loadAlerts = useCallback(async (preferredProductId?: string) => {
    const requestId = ++requestSequence.current;
    try {
      const criticalProducts =
        await ApiService.get<StockAlert[]>("/inventory/alerts");
      if (requestId !== requestSequence.current) return;
      const outOfStock = criticalProducts.filter((product) => Number(product.stock_on_hand) === 0);
      const outOfStockIds = new Set(outOfStock.map((product) => product.id));
      const newlyOutOfStock = previouslyOutOfStockIds
        ? outOfStock.filter((product) => !previouslyOutOfStockIds?.has(product.id))
        : [];
      previouslyOutOfStockIds = outOfStockIds;

      const orderedAlerts = [...criticalProducts].sort((left, right) => {
        if (preferredProductId) {
          if (left.id === preferredProductId && right.id !== preferredProductId) return -1;
          if (right.id === preferredProductId && left.id !== preferredProductId) return 1;
        }
        const leftStock = Number(left.stock_on_hand);
        const rightStock = Number(right.stock_on_hand);
        const leftReorderLevel = Number(left.reorder_level);
        const rightReorderLevel = Number(right.reorder_level);
        const urgencyDifference =
          (leftReorderLevel > 0 ? leftStock / leftReorderLevel : leftStock) -
          (rightReorderLevel > 0 ? rightStock / rightReorderLevel : rightStock);
        return urgencyDifference || leftStock - rightStock || left.name.localeCompare(right.name);
      });
      setAlerts(orderedAlerts);

      if (newlyOutOfStock.length > 0) {
        toast.error(
          `${newlyOutOfStock.length} product${newlyOutOfStock.length > 1 ? "s" : ""} out of stock!`,
          {
            description: newlyOutOfStock
              .slice(0, 3)
              .map((p) => p.name)
              .join(", "),
            duration: 5000,
          },
        );
      }
    } catch (error) {
      if (requestId === requestSequence.current) {
        console.error("Error loading inventory alerts:", error);
      }
    } finally {
      if (requestId === requestSequence.current) {
        setLoading(false);
      }
    }
  }, []);

  const refresh = useCallback(() => loadAlerts(latestProductId.current ?? undefined), [loadAlerts]);

  useWebSockets({
    onInventoryUpdated: (event) => {
      latestProductId.current = event.product_id;
      if (refreshTimer.current !== null) {
        window.clearTimeout(refreshTimer.current);
      }
      refreshTimer.current = window.setTimeout(() => {
        refreshTimer.current = null;
        void loadAlerts(event.product_id);
      }, 150);
    },
  });

  useEffect(() => {
    void loadAlerts();
    const interval = window.setInterval(() => void refresh(), 30000);
    return () => {
      window.clearInterval(interval);
      if (refreshTimer.current !== null) {
        window.clearTimeout(refreshTimer.current);
      }
    };
  }, [loadAlerts, refresh]);

  return {
    alerts,
    criticalCount: alerts.length,
    outOfStockCount: alerts.filter((a) => Number(a.stock_on_hand) === 0).length,
    loading,
    refresh,
  };
}
