import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, TrendingUp, TrendingDown, Minus, RefreshCw, Bell } from 'lucide-react';
import { toast } from 'sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface InventoryAlert {
  productName: string;
  sku: string;
  currentStock: number;
  suggestedReorderQty: number;
  urgency: 'critical' | 'high' | 'medium' | 'low';
  reasoning: string;
}

interface SalesForecast {
  next7Days: number;
  next30Days: number;
  trendDirection: 'increasing' | 'stable' | 'decreasing';
  confidence: 'high' | 'medium' | 'low';
}

interface DemandPattern {
  pattern: string;
  insight: string;
}

export function InventoryAlerts() {
  const [alerts, setAlerts] = useState<InventoryAlert[]>([]);
  const [forecast, setForecast] = useState<SalesForecast | null>(null);
  const [patterns, setPatterns] = useState<DemandPattern[]>([]);
  const [recommendations, setRecommendations] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadPredictions();
  }, []);

  const loadPredictions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('inventory-predictions');
      
      if (error) {
        console.error('Predictions error:', error);
        toast.error('Failed to load inventory predictions');
        return;
      }

      if (!data?.success) {
        toast.error(data?.error || 'Failed to generate predictions');
        return;
      }

      const { predictions } = data;
      setAlerts(predictions.inventoryAlerts || []);
      setForecast(predictions.salesForecast || null);
      setPatterns(predictions.demandPatterns || []);
      setRecommendations(predictions.recommendations || []);
      
      // Show notification for critical items
      const criticalCount = predictions.inventoryAlerts?.filter(
        (a: InventoryAlert) => a.urgency === 'critical'
      ).length || 0;
      
      if (criticalCount > 0) {
        toast.error(`${criticalCount} critical stock alert${criticalCount > 1 ? 's' : ''}!`, {
          description: 'Immediate action required',
          duration: 5000,
        });
      }
    } catch (error) {
      console.error('Load predictions error:', error);
      toast.error('Failed to load predictions');
    } finally {
      setLoading(false);
    }
  };

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'critical': return 'destructive';
      case 'high': return 'destructive';
      case 'medium': return 'default';
      case 'low': return 'secondary';
      default: return 'secondary';
    }
  };

  const getTrendIcon = (direction: string) => {
    switch (direction) {
      case 'increasing': return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'decreasing': return <TrendingDown className="h-4 w-4 text-red-500" />;
      default: return <Minus className="h-4 w-4 text-yellow-500" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold">AI-Powered Inventory Alerts</h2>
        </div>
        <Button 
          onClick={loadPredictions} 
          disabled={loading}
          size="sm"
          variant="outline"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh Predictions
        </Button>
      </div>

      {/* Sales Forecast Card */}
      {forecast && (
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {getTrendIcon(forecast.trendDirection)}
              Sales Forecast
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Next 7 Days</p>
                <p className="text-2xl font-bold">
                  KSh {forecast.next7Days.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Next 30 Days</p>
                <p className="text-2xl font-bold">
                  KSh {forecast.next30Days.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Trend & Confidence</p>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="capitalize">
                    {forecast.trendDirection}
                  </Badge>
                  <Badge variant="secondary" className="capitalize">
                    {forecast.confidence}
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Inventory Alerts Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            Stock Reorder Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : alerts.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              All stock levels are healthy. No alerts at this time.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Current Stock</TableHead>
                  <TableHead>Suggested Reorder</TableHead>
                  <TableHead>Urgency</TableHead>
                  <TableHead>Reasoning</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alerts.map((alert, idx) => (
                  <TableRow key={idx} className="animate-fade-in">
                    <TableCell className="font-medium">{alert.productName}</TableCell>
                    <TableCell>{alert.sku}</TableCell>
                    <TableCell>
                      <Badge variant={alert.currentStock === 0 ? 'destructive' : 'outline'}>
                        {alert.currentStock}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="font-semibold text-primary">
                        {alert.suggestedReorderQty} units
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getUrgencyColor(alert.urgency)} className="capitalize">
                        {alert.urgency}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-md">
                      <p className="text-sm text-muted-foreground">{alert.reasoning}</p>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Demand Patterns */}
      {patterns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Demand Patterns & Insights</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4">
              {patterns.map((pattern, idx) => (
                <div key={idx} className="border-l-4 border-primary pl-4 py-2 animate-fade-in">
                  <h4 className="font-semibold">{pattern.pattern}</h4>
                  <p className="text-sm text-muted-foreground mt-1">{pattern.insight}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI Recommendations */}
      {recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>AI Recommendations</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {recommendations.map((rec, idx) => (
                <li key={idx} className="flex items-start gap-2 animate-fade-in">
                  <span className="text-primary font-bold">•</span>
                  <span className="text-sm">{rec}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}