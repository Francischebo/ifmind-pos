import { useState, useEffect } from "react";
import { ApiService } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Download,
  TrendingUp,
  DollarSign,
  Package,
  AlertTriangle,
  CalendarIcon,
} from "lucide-react";
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
} from "date-fns";
import { InventoryAlerts } from "@/components/InventoryAlerts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
} from "recharts";

export default function Reports() {
  const [salesByPayment, setSalesByPayment] = useState<any[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [lowStock, setLowStock] = useState<any[]>([]);
  const [cashierPerformance, setCashierPerformance] = useState<any[]>([]);
  const [dateRange, setDateRange] = useState("today");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    new Date(),
  );
  const [customDateMode, setCustomDateMode] = useState(false);
  const [rangeMode, setRangeMode] = useState<"day" | "week" | "month" | "year">(
    "day",
  );

  useEffect(() => {
    loadReports();
  }, [dateRange, selectedDate, customDateMode]);

  const loadReports = async () => {
    try {
      const startDate = getStartDate(dateRange);
      const endDate = getEndDate();
      const report = await ApiService.get<any>(
        `/reports/summary?start=${encodeURIComponent(startDate)}&end=${encodeURIComponent(endDate)}`,
      );
      setSalesByPayment(report.salesByPayment || []);
      setTopProducts(report.topProducts || []);
      setLowStock(report.lowStock || []);
      setCashierPerformance(report.cashierPerformance || []);
    } catch (error) {
      console.error("Error loading reports:", error);
    }
  };

  const getStartDate = (range: string) => {
    if (customDateMode && selectedDate) {
      let startDate: Date;
      let endDate: Date;

      switch (rangeMode) {
        case "day":
          startDate = new Date(selectedDate);
          startDate.setHours(0, 0, 0, 0);
          return startDate.toISOString();
        case "week":
          startDate = startOfWeek(selectedDate, { weekStartsOn: 1 }); // Monday
          return startDate.toISOString();
        case "month":
          startDate = startOfMonth(selectedDate);
          return startDate.toISOString();
        case "year":
          startDate = startOfYear(selectedDate);
          return startDate.toISOString();
        default:
          startDate = new Date(selectedDate);
          startDate.setHours(0, 0, 0, 0);
          return startDate.toISOString();
      }
    }

    const now = new Date();
    switch (range) {
      case "today":
        now.setHours(0, 0, 0, 0);
        return now.toISOString();
      case "week":
        now.setDate(now.getDate() - 7);
        return now.toISOString();
      case "month":
        now.setMonth(now.getMonth() - 1);
        return now.toISOString();
      default:
        return now.toISOString();
    }
  };

  const getEndDate = () => {
    if (!customDateMode || !selectedDate) {
      return new Date().toISOString();
    }

    let endDate: Date;
    switch (rangeMode) {
      case "day":
        endDate = new Date(selectedDate);
        endDate.setHours(23, 59, 59, 999);
        return endDate.toISOString();
      case "week":
        endDate = endOfWeek(selectedDate, { weekStartsOn: 1 });
        endDate.setHours(23, 59, 59, 999);
        return endDate.toISOString();
      case "month":
        endDate = endOfMonth(selectedDate);
        endDate.setHours(23, 59, 59, 999);
        return endDate.toISOString();
      case "year":
        endDate = endOfYear(selectedDate);
        endDate.setHours(23, 59, 59, 999);
        return endDate.toISOString();
      default:
        endDate = new Date(selectedDate);
        endDate.setHours(23, 59, 59, 999);
        return endDate.toISOString();
    }
  };

  const handleDateSelect = (date: Date | undefined) => {
    setSelectedDate(date);
    setCustomDateMode(true);
    setDateRange("custom");
  };

  const getDateRangeLabel = () => {
    if (!customDateMode || !selectedDate) return "Select Range";

    switch (rangeMode) {
      case "day":
        return format(selectedDate, "PPP");
      case "week":
        const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
        const weekEnd = endOfWeek(selectedDate, { weekStartsOn: 1 });
        return `${format(weekStart, "MMM d")} - ${format(weekEnd, "MMM d, yyyy")}`;
      case "month":
        return format(selectedDate, "MMMM yyyy");
      case "year":
        return format(selectedDate, "yyyy");
      default:
        return format(selectedDate, "PPP");
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Reports</h1>
          <p className="text-muted-foreground">
            Business analytics and insights
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={
              dateRange === "today" && !customDateMode ? "default" : "outline"
            }
            onClick={() => {
              setDateRange("today");
              setCustomDateMode(false);
            }}
            size="sm"
          >
            Today
          </Button>
          <Button
            variant={
              dateRange === "week" && !customDateMode ? "default" : "outline"
            }
            onClick={() => {
              setDateRange("week");
              setCustomDateMode(false);
            }}
            size="sm"
          >
            This Week
          </Button>
          <Button
            variant={
              dateRange === "month" && !customDateMode ? "default" : "outline"
            }
            onClick={() => {
              setDateRange("month");
              setCustomDateMode(false);
            }}
            size="sm"
          >
            This Month
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={customDateMode ? "default" : "outline"}
                size="sm"
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {getDateRangeLabel()}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-4" align="end">
              <div className="space-y-4">
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={rangeMode === "day" ? "default" : "outline"}
                    onClick={() => setRangeMode("day")}
                  >
                    Day
                  </Button>
                  <Button
                    size="sm"
                    variant={rangeMode === "week" ? "default" : "outline"}
                    onClick={() => setRangeMode("week")}
                  >
                    Week
                  </Button>
                  <Button
                    size="sm"
                    variant={rangeMode === "month" ? "default" : "outline"}
                    onClick={() => setRangeMode("month")}
                  >
                    Month
                  </Button>
                  <Button
                    size="sm"
                    variant={rangeMode === "year" ? "default" : "outline"}
                    onClick={() => setRangeMode("year")}
                  >
                    Year
                  </Button>
                </div>
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={handleDateSelect}
                  initialFocus
                  className="pointer-events-auto"
                />
                <p className="text-xs text-muted-foreground text-center">
                  Viewing{" "}
                  {rangeMode === "day" ? "single day" : `entire ${rangeMode}`}
                </p>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <Tabs defaultValue="sales" className="w-full">
        <TabsList>
          <TabsTrigger value="sales">Sales</TabsTrigger>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="predictions">Forecast & Guidance</TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Sales by Payment Method
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {salesByPayment.length > 0 && (
                <ChartContainer
                  config={{
                    total: {
                      label: "Total Amount",
                      color: "hsl(var(--chart-1))",
                    },
                  }}
                  className="h-[350px]"
                >
                  <PieChart>
                    <Pie
                      data={salesByPayment}
                      dataKey="total"
                      nameKey="method"
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={110}
                      paddingAngle={5}
                      label={(entry) =>
                        `${entry.method}: KSh ${entry.total.toLocaleString("en-KE", { maximumFractionDigits: 0 })}`
                      }
                    >
                      {salesByPayment.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={`hsl(var(--chart-${(index % 5) + 1}))`}
                        />
                      ))}
                    </Pie>
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Legend />
                  </PieChart>
                </ChartContainer>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Method</TableHead>
                    <TableHead>Transactions</TableHead>
                    <TableHead className="text-right">Total Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {salesByPayment.map((row) => (
                    <TableRow key={row.method}>
                      <TableCell className="font-medium capitalize">
                        {row.method}
                      </TableCell>
                      <TableCell>{row.count}</TableCell>
                      <TableCell className="text-right">
                        KSh{" "}
                        {row.total.toLocaleString("en-KE", {
                          minimumFractionDigits: 2,
                        })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Top Selling Products
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {topProducts.length > 0 && (
                <ChartContainer
                  config={{
                    total_quantity: {
                      label: "Quantity Sold",
                      color: "hsl(var(--chart-1))",
                    },
                  }}
                  className="h-[400px]"
                >
                  <BarChart
                    data={topProducts}
                    layout="vertical"
                    margin={{ left: 100 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(var(--border))"
                    />
                    <XAxis
                      type="number"
                      stroke="hsl(var(--muted-foreground))"
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      stroke="hsl(var(--muted-foreground))"
                      width={90}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar
                      dataKey="total_quantity"
                      fill="hsl(var(--chart-1))"
                      radius={[0, 8, 8, 0]}
                    />
                  </BarChart>
                </ChartContainer>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">Quantity Sold</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topProducts.map((product, idx) => (
                    <TableRow key={product.product_id}>
                      <TableCell>
                        <span className="font-medium">#{idx + 1}</span>{" "}
                        {product.name}
                      </TableCell>
                      <TableCell>{product.sku}</TableCell>
                      <TableCell className="text-right">
                        {product.total_quantity}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inventory" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Low Stock Alert
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {lowStock.length > 0 && (
                <ChartContainer
                  config={{
                    stock_on_hand: {
                      label: "Current Stock",
                      color: "hsl(var(--chart-2))",
                    },
                    reorder_level: {
                      label: "Reorder Level",
                      color: "hsl(var(--chart-3))",
                    },
                  }}
                  className="h-[350px]"
                >
                  <BarChart data={lowStock.slice(0, 10)}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(var(--border))"
                    />
                    <XAxis
                      dataKey="name"
                      stroke="hsl(var(--muted-foreground))"
                      angle={-45}
                      textAnchor="end"
                      height={100}
                    />
                    <YAxis stroke="hsl(var(--muted-foreground))" />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar
                      dataKey="stock_on_hand"
                      fill="hsl(var(--chart-2))"
                      name="Current Stock"
                      radius={[8, 8, 0, 0]}
                    />
                    <Bar
                      dataKey="reorder_level"
                      fill="hsl(var(--chart-3))"
                      name="Reorder Level"
                      radius={[8, 8, 0, 0]}
                    />
                  </BarChart>
                </ChartContainer>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Current Stock</TableHead>
                    <TableHead>Reorder Level</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lowStock.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell className="font-medium">
                        {product.name}
                      </TableCell>
                      <TableCell>{product.sku}</TableCell>
                      <TableCell>{product.stock_on_hand}</TableCell>
                      <TableCell>{product.reorder_level}</TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant={
                            product.stock_on_hand === 0
                              ? "destructive"
                              : "secondary"
                          }
                        >
                          {product.stock_on_hand === 0
                            ? "Out of Stock"
                            : "Low Stock"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Cashier Performance
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {cashierPerformance.length > 0 && (
                <ChartContainer
                  config={{
                    total: {
                      label: "Total Sales (KSh)",
                      color: "hsl(var(--chart-4))",
                    },
                    count: {
                      label: "Transactions",
                      color: "hsl(var(--chart-5))",
                    },
                  }}
                  className="h-[350px]"
                >
                  <BarChart data={cashierPerformance}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(var(--border))"
                    />
                    <XAxis
                      dataKey="name"
                      stroke="hsl(var(--muted-foreground))"
                    />
                    <YAxis stroke="hsl(var(--muted-foreground))" />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar
                      dataKey="total"
                      fill="hsl(var(--chart-4))"
                      name="Total Sales (KSh)"
                      radius={[8, 8, 0, 0]}
                    />
                    <Bar
                      dataKey="count"
                      fill="hsl(var(--chart-5))"
                      name="Transactions"
                      radius={[8, 8, 0, 0]}
                    />
                  </BarChart>
                </ChartContainer>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cashier</TableHead>
                    <TableHead>Transactions</TableHead>
                    <TableHead className="text-right">Total Sales</TableHead>
                    <TableHead className="text-right">
                      Avg Transaction
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cashierPerformance.map((cashier) => (
                    <TableRow key={cashier.cashier_id}>
                      <TableCell className="font-medium">
                        {cashier.name}
                      </TableCell>
                      <TableCell>{cashier.count}</TableCell>
                      <TableCell className="text-right">
                        KSh{" "}
                        {cashier.total.toLocaleString("en-KE", {
                          minimumFractionDigits: 2,
                        })}
                      </TableCell>
                      <TableCell className="text-right">
                        KSh{" "}
                        {(cashier.total / cashier.count).toLocaleString(
                          "en-KE",
                          { minimumFractionDigits: 2 },
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="predictions" className="space-y-6">
          <InventoryAlerts />
        </TabsContent>
      </Tabs>
    </div>
  );
}
