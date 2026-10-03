import { useEffect, useState, useRef } from 'react';
import { ApiService } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, ShoppingCart, Package, AlertCircle, TrendingUp } from 'lucide-react';
import { useInventoryAlerts } from '@/hooks/useInventoryAlerts';
import { Link } from 'react-router-dom';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Legend, ResponsiveContainer } from 'recharts';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface DashboardStats {
  todaySales: number;
  todayTransactions: number;
  lowStockCount: number;
  totalProducts: number;
  weeklyTrend: Array<{ day: string; sales: number; transactions: number }>;
  topProducts: Array<{ name: string; quantity: number; revenue: number }>;
  salesByMethod: Array<{ method: string; amount: number; percentage: number }>;
  recentTransactions: Array<{ id: string; time: string; amount: number; method: string }>;
  totalCustomers: number;
}

export default function Dashboard() {
  const { alerts: lowStockProducts, loading: lowStockLoading } = useInventoryAlerts();
  const [stats, setStats] = useState<DashboardStats>({
    todaySales: 0,
    todayTransactions: 0,
    lowStockCount: 0,
    totalProducts: 0,
    weeklyTrend: [],
    topProducts: [],
    salesByMethod: [],
    recentTransactions: [],
    totalCustomers: 0,
  });
  const [loading, setLoading] = useState(true);
  const [animatedValues, setAnimatedValues] = useState({
    todaySales: 0,
    todayTransactions: 0,
  });

  useEffect(() => {
    loadDashboardStats();
    
    // Set up a polling interval for dashboard updates since we are not using websockets here currently
    const interval = setInterval(() => {
      loadDashboardStats();
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, []);

  // Animated counter effect
  useEffect(() => {
    const animateSales = setInterval(() => {
      setAnimatedValues(prev => {
        const newSales = prev.todaySales < stats.todaySales 
          ? Math.min(prev.todaySales + stats.todaySales / 20, stats.todaySales)
          : stats.todaySales;
        const newTransactions = prev.todayTransactions < stats.todayTransactions
          ? Math.min(prev.todayTransactions + 1, stats.todayTransactions)
          : stats.todayTransactions;
        
        if (newSales === stats.todaySales && newTransactions === stats.todayTransactions) {
          clearInterval(animateSales);
        }
        
        return {
          todaySales: newSales,
          todayTransactions: newTransactions,
        };
      });
    }, 50);

    return () => clearInterval(animateSales);
  }, [stats.todaySales, stats.todayTransactions]);

  const loadDashboardStats = async () => {
    try {
      const data = await ApiService.get<DashboardStats>('/dashboard/stats');
      if (data) {
        setStats(data);
      }
    } catch (error) {
      console.error('Error loading dashboard stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in p-6">
      {/* Header Section */}
      <div className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
          Dashboard
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Real-time overview of your wholesale business
        </p>
      </div>

      {/* Stats Cards Grid with Animated Counters */}
      <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {/* Today's Sales Card */}
        <Card className="relative overflow-hidden border-primary/20 hover:shadow-lg transition-all duration-300 hover:scale-105">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-primary/20 to-transparent rounded-full -mr-16 -mt-16" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Today's Sales</CardTitle>
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl sm:text-3xl font-bold animate-scale-in">
              KSh {Math.floor(animatedValues.todaySales).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <TrendingUp className="h-3 w-3 text-green-500" />
              {stats.todayTransactions} transactions
            </p>
          </CardContent>
        </Card>

        {/* Transactions Card */}
        <Card className="relative overflow-hidden border-blue-500/20 hover:shadow-lg transition-all duration-300 hover:scale-105">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-500/20 to-transparent rounded-full -mr-16 -mt-16" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Transactions</CardTitle>
            <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center">
              <ShoppingCart className="h-5 w-5 text-blue-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl sm:text-3xl font-bold animate-scale-in">{Math.floor(animatedValues.todayTransactions)}</div>
            <p className="text-xs text-muted-foreground mt-1">Completed today</p>
          </CardContent>
        </Card>

        {/* Total Products Card */}
        <Card className="relative overflow-hidden border-green-500/20 hover:shadow-lg transition-all duration-300 hover:scale-105">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-green-500/20 to-transparent rounded-full -mr-16 -mt-16" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Products & Customers</CardTitle>
            <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center">
              <Package className="h-5 w-5 text-green-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl sm:text-3xl font-bold">{stats.totalProducts}</div>
            <p className="text-xs text-muted-foreground mt-1">{stats.totalCustomers} customers</p>
          </CardContent>
        </Card>

        {/* Low Stock Alert Card */}
        <Card className="relative overflow-hidden border-orange-500/20 hover:shadow-lg transition-all duration-300 hover:scale-105">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-orange-500/20 to-transparent rounded-full -mr-16 -mt-16" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Low Stock Alert</CardTitle>
            <div className="h-10 w-10 rounded-full bg-orange-500/10 flex items-center justify-center">
              <AlertCircle className="h-5 w-5 text-orange-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl sm:text-3xl font-bold text-orange-500">
              {stats.lowStockCount}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Items need reorder</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-orange-500" />
              Products at or below reorder level
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {lowStockProducts.length} product{lowStockProducts.length === 1 ? '' : 's'} need attention
            </p>
          </div>
          <Link to="/products" className="text-sm font-medium text-primary hover:underline">
            View products
          </Link>
        </CardHeader>
        <CardContent>
          {lowStockLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading stock alerts...</p>
          ) : lowStockProducts.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              All products are above their reorder levels.
            </p>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">Available</TableHead>
                    <TableHead className="text-right">Reorder level</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lowStockProducts.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell className="font-medium">{product.name}</TableCell>
                      <TableCell>{product.sku}</TableCell>
                      <TableCell className="text-right font-semibold text-orange-600">
                        {Number(product.stock_on_hand).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {Number(product.reorder_level).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Charts Section */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Weekly Sales Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Weekly Sales Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{
                sales: { label: "Sales (KSh)", color: "hsl(var(--chart-1))" },
                transactions: { label: "Transactions", color: "hsl(var(--chart-2))" },
              }}
              className="h-[300px]"
            >
              <LineChart data={stats.weeklyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" />
                <YAxis stroke="hsl(var(--muted-foreground))" />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="sales" 
                  stroke="hsl(var(--chart-1))" 
                  strokeWidth={2}
                  dot={{ fill: "hsl(var(--chart-1))", r: 4 }}
                  activeDot={{ r: 6 }}
                />
                <Line 
                  type="monotone" 
                  dataKey="transactions" 
                  stroke="hsl(var(--chart-2))" 
                  strokeWidth={2}
                  dot={{ fill: "hsl(var(--chart-2))", r: 4 }}
                />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Sales by Payment Method */}
        <Card>
          <CardHeader>
            <CardTitle>Sales by Payment Method</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{
                amount: { label: "Amount (KSh)", color: "hsl(var(--chart-1))" },
              }}
              className="h-[300px]"
            >
              <PieChart>
                <Pie
                  data={stats.salesByMethod}
                  dataKey="amount"
                  nameKey="method"
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  label={(entry) => `${entry.method}: ${entry.percentage.toFixed(0)}%`}
                >
                  {stats.salesByMethod.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={`hsl(var(--chart-${(index % 5) + 1}))`} />
                  ))}
                </Pie>
                <ChartTooltip content={<ChartTooltipContent />} />
              </PieChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Top Products */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-green-500" />
              Top Products Today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{
                revenue: { label: "Revenue (KSh)", color: "hsl(var(--chart-3))" },
              }}
              className="h-[300px]"
            >
              <BarChart data={stats.topProducts} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" stroke="hsl(var(--muted-foreground))" />
                <YAxis 
                  type="category" 
                  dataKey="name" 
                  stroke="hsl(var(--muted-foreground))"
                  width={70}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="revenue" fill="hsl(var(--chart-3))" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Recent Transactions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-blue-500" />
              Recent Transactions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Method</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.recentTransactions.map((txn) => (
                  <TableRow key={txn.id} className="animate-fade-in">
                    <TableCell className="font-medium">{txn.time}</TableCell>
                    <TableCell>
                      <span className="font-semibold text-green-600 dark:text-green-400">
                        KSh {txn.amount.toLocaleString('en-KE', { minimumFractionDigits: 2 })}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {txn.method}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
