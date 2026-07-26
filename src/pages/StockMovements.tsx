import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ArrowUpDown, Search, TrendingUp, TrendingDown, Package } from 'lucide-react';
import { toast } from 'sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { format } from 'date-fns';

interface StockMovement {
  id: string;
  product_id: string;
  movement_type: string;
  quantity: number;
  quantity_before: number;
  quantity_after: number;
  unit_cost: number | null;
  reference_type: string;
  reference_id: string | null;
  notes: string | null;
  created_at: string;
  products: { name: string; sku: string } | null;
}

export default function StockMovements() {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMovements();
  }, [typeFilter]);

  const loadMovements = async () => {
    setLoading(true);
    let query = supabase
      .from('stock_movements')
      .select('*, products(name, sku)')
      .order('created_at', { ascending: false })
      .limit(500);

    if (typeFilter !== 'all') {
      query = query.eq('movement_type', typeFilter);
    }

    const { data, error } = await query;
    if (error) {
      toast.error('Failed to load stock movements');
    } else {
      setMovements(data || []);
    }
    setLoading(false);
  };

  const getMovementColor = (type: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
    if (['sale', 'adjustment_out', 'transfer_out', 'damaged', 'expired'].includes(type)) {
      return 'destructive';
    }
    if (['purchase_receipt', 'sale_return', 'adjustment_in', 'transfer_in', 'initial_stock'].includes(type)) {
      return 'default';
    }
    return 'secondary';
  };

  const getMovementIcon = (quantity: number) => {
    return quantity > 0 ? (
      <TrendingUp className="h-4 w-4 text-green-600" />
    ) : (
      <TrendingDown className="h-4 w-4 text-destructive" />
    );
  };

  const formatMovementType = (type: string) => {
    return type.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const filteredMovements = movements.filter(
    (mov) =>
      mov.products?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      mov.products?.sku.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Summary stats
  const totalIn = movements.filter((m) => m.quantity > 0).reduce((sum, m) => sum + m.quantity, 0);
  const totalOut = movements.filter((m) => m.quantity < 0).reduce((sum, m) => sum + Math.abs(m.quantity), 0);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <ArrowUpDown className="h-8 w-8 text-primary" />
          Stock Movements
        </h1>
        <p className="text-muted-foreground">Complete audit trail of inventory changes</p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-600" />
              Stock In (Period)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">+{totalIn.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-destructive" />
              Stock Out (Period)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-destructive">-{totalOut.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Package className="h-4 w-4" />
              Net Movement
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${totalIn - totalOut >= 0 ? 'text-green-600' : 'text-destructive'}`}>
              {totalIn - totalOut >= 0 ? '+' : ''}{(totalIn - totalOut).toLocaleString()}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by product name or SKU..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="sale">Sale</SelectItem>
                <SelectItem value="sale_return">Sale Return</SelectItem>
                <SelectItem value="purchase_receipt">Purchase Receipt</SelectItem>
                <SelectItem value="adjustment_in">Adjustment In</SelectItem>
                <SelectItem value="adjustment_out">Adjustment Out</SelectItem>
                <SelectItem value="transfer_in">Transfer In</SelectItem>
                <SelectItem value="transfer_out">Transfer Out</SelectItem>
                <SelectItem value="damaged">Damaged</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date/Time</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Before</TableHead>
                <TableHead className="text-right">Change</TableHead>
                <TableHead className="text-right">After</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8">
                    Loading movements...
                  </TableCell>
                </TableRow>
              ) : filteredMovements.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    No stock movements found
                  </TableCell>
                </TableRow>
              ) : (
                filteredMovements.map((movement) => (
                  <TableRow key={movement.id}>
                    <TableCell className="text-sm">
                      {format(new Date(movement.created_at), 'dd/MM/yy HH:mm')}
                    </TableCell>
                    <TableCell className="font-medium">{movement.products?.name}</TableCell>
                    <TableCell className="font-mono text-sm">{movement.products?.sku}</TableCell>
                    <TableCell>
                      <Badge variant={getMovementColor(movement.movement_type)} className="text-xs">
                        {formatMovementType(movement.movement_type)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{movement.quantity_before}</TableCell>
                    <TableCell className="text-right">
                      <span className={`font-medium flex items-center justify-end gap-1 ${
                        movement.quantity > 0 ? 'text-green-600' : 'text-destructive'
                      }`}>
                        {getMovementIcon(movement.quantity)}
                        {movement.quantity > 0 ? '+' : ''}{movement.quantity}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-medium">{movement.quantity_after}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {movement.reference_type}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-32 truncate">
                      {movement.notes || '-'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
