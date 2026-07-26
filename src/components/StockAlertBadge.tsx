import { AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useInventoryAlerts } from '@/hooks/useInventoryAlerts';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export function StockAlertBadge() {
  const { criticalCount, outOfStockCount, alerts, loading } = useInventoryAlerts();

  if (loading || criticalCount === 0) return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <Badge 
            variant={outOfStockCount > 0 ? 'destructive' : 'secondary'}
            className="flex items-center gap-1 animate-pulse"
          >
            <AlertTriangle className="h-3 w-3" />
            {criticalCount}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <div className="space-y-1">
            <p className="font-semibold">
              {criticalCount} low stock alert{criticalCount > 1 ? 's' : ''}
            </p>
            {outOfStockCount > 0 && (
              <p className="text-destructive">
                {outOfStockCount} out of stock
              </p>
            )}
            <div className="text-xs text-muted-foreground mt-2">
              {alerts.slice(0, 3).map((alert, idx) => (
                <div key={idx}>
                  • {alert.name} ({alert.stock_on_hand})
                </div>
              ))}
              {alerts.length > 3 && (
                <div>+ {alerts.length - 3} more...</div>
              )}
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}