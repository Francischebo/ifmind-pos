import {
  validatePhoneNumber,
  secureApiCall,
  paymentRateLimiter,
  apiRateLimiter,
  validateAmount,
} from "@/lib/security";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { Receipt } from "@/components/Receipt";
import { Badge } from "@/components/ui/badge";
import { HybridPaymentPanel } from "@/components/HybridPaymentPanel";
import { useHybridPayment } from "@/hooks/useHybridPayment";
import { useLoyaltyPoints } from "@/hooks/useLoyaltyPoints";
import { ApiService } from "@/lib/api";
import { LoyaltyRedemption } from "@/components/LoyaltyRedemption";
import { useAuth } from "@/hooks/useAuthContext";
import { useWebSockets } from "@/hooks/useWebSockets";
import { useCallback, useState, useEffect, useRef } from "react";
import {
  ShoppingCart,
  Package,
  Search,
  Trash2,
  Minus,
  Plus,
  PauseCircle,
  PlayCircle,
  FileText,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { printerService } from "@/lib/hardware/escpos";
import { useOfflineQueue } from "@/hooks/useOfflineQueueContext";
import { OfflineSaleReceipt } from "@/components/OfflineSaleReceipt";
import {
  OfflineSaleRecord,
  readCachedCatalog,
  saveCachedCatalog,
} from "@/lib/offlineStore";

interface Warehouse {
  id: string;
  name: string;
}

interface Product {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  retail_price: number;
  tax_rate: number;
  tax_class?: { rate: number | string } | null;
  stock_on_hand: number;
  category?: string;
}

interface CartItem extends Product {
  quantity: number;
  lineTotal: number;
}

interface Customer {
  id: string;
  name: string;
  phone: string;
  store_credit_balance: number;
}

interface MpesaPaymentConfig {
  paybill_number: string | null;
  paybill_c2b_enabled: boolean;
  stk_push_enabled?: boolean;
  stk_push_issues?: string[];
}

interface ParkedSaleItem {
  quantity: number;
  unit_price: number;
  tax_rate: number;
  line_total: number;
  product: Product;
}

interface ParkedSale {
  id: string;
  created_at: string;
  customer: Customer | null;
  warehouse: Warehouse | null;
  loyalty_discount: number;
  items: ParkedSaleItem[];
}

export default function Sales() {
  const { user, isOfflineSession } = useAuth();
  const offline = useOfflineQueue();
  const { awardLoyaltyPoints, redeemLoyaltyPoints } = useLoyaltyPoints();

  // Generate unique invoice number
  const generateInvoiceNumber = async () => {
    // Invoices should naturally be assigned by backend during generation
    return `INV-${Date.now()}`;
  };
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [mpesaConfig, setMpesaConfig] = useState<MpesaPaymentConfig>({
    paybill_number: null,
    paybill_c2b_enabled: false,
    stk_push_enabled: undefined,
    stk_push_issues: [],
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<string>("walk-in");
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>(() => {
    if (!user?.id) return "";
    try {
      const saved = localStorage.getItem(`pos:last-warehouse:${user.id}`);
      return saved ? (JSON.parse(saved) as { id?: string }).id || "" : "";
    } catch {
      return "";
    }
  });
  const [loading, setLoading] = useState(false);
  const [showOpenShiftDialog, setShowOpenShiftDialog] = useState(false);
  const [openingFloat, setOpeningFloat] = useState("");
  const [openingShift, setOpeningShift] = useState(false);
  const [completedSaleId, setCompletedSaleId] = useState<string | null>(null);
  const [provisionalReceipt, setProvisionalReceipt] = useState<OfflineSaleRecord | null>(null);
  const [parkedSales, setParkedSales] = useState<ParkedSale[]>([]);
  const [showParkedModal, setShowParkedModal] = useState(false);
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  interface HistoricalSale {
    id: string;
    created_at: string;
    total_amount: number | string;
    payment_method: string;
    etims_status?: string | null;
    etims_receipt_no?: string | null;
    etims_last_error?: string | null;
    customer?: { name: string } | null;
    cashier?: { email: string; profile?: { full_name: string } } | null;
    items?: { quantity: number }[];
  }

  const [showSalesHistoryModal, setShowSalesHistoryModal] = useState(false);
  const [salesHistory, setSalesHistory] = useState<HistoricalSale[]>([]);
  const [loadingSalesHistory, setLoadingSalesHistory] = useState(false);
  const [etimsFilter, setEtimsFilter] = useState("all");

  const fetchSalesHistory = useCallback(async (filter: string) => {
    try {
      setLoadingSalesHistory(true);
      const url = filter === "all" ? "/sales" : `/sales?etims_status=${filter}`;
      const data = await ApiService.get<HistoricalSale[]>(url);
      setSalesHistory(Array.isArray(data) ? data : []);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load sales history";
      toast.error(msg);
    } finally {
      setLoadingSalesHistory(false);
    }
  }, []);

  useEffect(() => {
    if (showSalesHistoryModal) {
      void fetchSalesHistory(etimsFilter);
    }
  }, [showSalesHistoryModal, etimsFilter, fetchSalesHistory]);

  const renderEtimsBadge = (status?: string | null) => {
    switch (status) {
      case "submitted":
        return <Badge className="bg-green-600 hover:bg-green-700 text-white">Submitted</Badge>;
      case "pending":
        return <Badge className="bg-amber-500 hover:bg-amber-600 text-white">Pending</Badge>;
      case "failed":
        return <Badge variant="destructive">Failed</Badge>;
      case "not_applicable":
      default:
        return <Badge variant="secondary" className="bg-muted-foreground/30 text-foreground">N/A</Badge>;
    }
  };

  // Loyalty redemption state
  const [loyaltyDiscount, setLoyaltyDiscount] = useState(0);
  const [loyaltyPointsToRedeem, setLoyaltyPointsToRedeem] = useState(0);

  const getSubtotalWithDiscount = () => {
    const subtotal = cart.reduce((sum, item) => sum + item.lineTotal, 0);
    return Math.max(0, subtotal - loyaltyDiscount);
  };

  useWebSockets({
    onInventoryUpdated: (data) => {
      if (
        data.warehouse_id &&
        selectedWarehouse &&
        data.warehouse_id !== selectedWarehouse
      )
        return;

      setProducts((prev) =>
        prev.map((p) =>
          p.id === data.product_id
            ? { ...p, stock_on_hand: data.stock_on_hand }
            : p,
        ),
      );
    },
  });

  function getTotalAmount() {
    return parseFloat(calculateTotals().total);
  }

  const payment = useHybridPayment(getTotalAmount(), user?.id || "unknown");
  const {
    checkoutReserved,
    checkoutSessionId,
    clearMissingCheckout,
    finishCheckoutRecovery,
    reset: resetPayment,
    restoreCheckoutSession,
  } = payment;
  const restoredCheckoutIdRef = useRef("");

  useEffect(() => {
    if (
      !checkoutReserved ||
      restoredCheckoutIdRef.current === checkoutSessionId
    ) {
      return;
    }
    const sessionId = checkoutSessionId;
    restoredCheckoutIdRef.current = sessionId;
    void ApiService.get<{
      id: string;
      status: "reserved" | "completed" | "cancelled";
      warehouse_id: string | null;
      customer_id: string | null;
      loyalty_discount: number;
      items: Array<{
        product_id: string;
        quantity: number;
        unit_price: number;
        tax_rate: number;
        sku: string;
        barcode: string | null;
        name: string;
      }>;
      mpesa_transactions: Array<{
        id: string;
        status: string;
        amount: number;
        mpesa_receipt_number: string | null;
        checkout_request_id: string | null;
        account_reference: string | null;
      }>;
      total_amount: number;
      cash_amount: number;
      store_credit_amount: number;
      store_credit_barcode: string | null;
    }>(`/sales/checkouts/${sessionId}`)
      .then((session) => {
        if (session.status !== "reserved") {
          resetPayment();
          return;
        }
        setCart(session.items.map((item) => {
          const currentProduct = products.find((product) => product.id === item.product_id);
          return {
            id: item.product_id,
            sku: item.sku,
            barcode: item.barcode,
            name: item.name,
            retail_price: Number(item.unit_price),
            tax_rate: Number(item.tax_rate),
            stock_on_hand: currentProduct?.stock_on_hand ?? item.quantity,
            quantity: item.quantity,
            lineTotal: Number(item.unit_price) * item.quantity,
          };
        }));
        setSelectedWarehouse(session.warehouse_id || "");
        setSelectedCustomer(session.customer_id || "walk-in");
        setLoyaltyDiscount(Number(session.loyalty_discount) || 0);
        restoreCheckoutSession(session);
      })
      .catch((error) => {
        console.error("Unable to recover reserved checkout:", error);
        finishCheckoutRecovery();
        if (
          error instanceof Error &&
          error.message.toLowerCase().includes("checkout session not found")
        ) {
          const hasCurrentCart = cart.length > 0;
          if (hasCurrentCart) {
            clearMissingCheckout();
          } else {
            resetPayment();
          }
          toast.info("The previous checkout reservation is no longer active", {
            description: hasCurrentCart
              ? "Your cart and entered payment amounts are still available."
              : "The stale checkout and its saved payment amounts were cleared.",
          });
          return;
        }
        toast.error("Could not recover the reserved checkout", {
          description: error instanceof Error ? error.message : "Refresh and try again",
        });
      });
  }, [
    checkoutReserved,
    checkoutSessionId,
    clearMissingCheckout,
    finishCheckoutRecovery,
    resetPayment,
    restoreCheckoutSession,
    cart.length,
    products,
  ]);

  // Reset loyalty discount when customer changes
  const handleCustomerChange = (customerId: string) => {
    if (payment.checkoutReserved) {
      toast.error("Release the reserved checkout before changing its customer");
      return;
    }
    setSelectedCustomer(customerId);
    setLoyaltyDiscount(0);
    setLoyaltyPointsToRedeem(0);
  };

  const handleLoyaltyDiscount = (discount: number, pointsUsed: number) => {
    if (payment.checkoutReserved) {
      toast.error("Release the reserved checkout before changing its discount");
      return;
    }
    setLoyaltyDiscount(discount);
    setLoyaltyPointsToRedeem(pointsUsed);
  };

  useEffect(() => {
    if (!user?.id || !selectedWarehouse) return;
    const warehouse = warehouses.find((entry) => entry.id === selectedWarehouse);
    if (!warehouse) return;
    try {
      localStorage.setItem(
        `pos:last-warehouse:${user.id}`,
        JSON.stringify(warehouse),
      );
    } catch (error) {
      console.error("Unable to save the selected POS location:", error);
    }
  }, [selectedWarehouse, user?.id, warehouses]);

  const loadWarehouses = useCallback(async () => {
    try {
      const data = await ApiService.get<Warehouse[]>("/warehouses");
      if (data && data.length > 0) {
        setWarehouses(data);
        const preferred = data.some((warehouse) => warehouse.id === selectedWarehouse)
          ? selectedWarehouse
          : data[0].id;
        setSelectedWarehouse(preferred);
        if (user?.id) {
          localStorage.setItem(
            `pos:last-warehouse:${user.id}`,
            JSON.stringify(data.find((warehouse) => warehouse.id === preferred)),
          );
        }
      }
    } catch (error) {
      console.warn("Unable to refresh warehouses; using the last saved POS location.", error);
      if (!user?.id) return;
      try {
        const saved = localStorage.getItem(`pos:last-warehouse:${user.id}`);
        const warehouse = saved ? JSON.parse(saved) as Warehouse : null;
        if (warehouse?.id) {
          setWarehouses([warehouse]);
          setSelectedWarehouse(warehouse.id);
        }
      } catch (storageError) {
        console.error("Unable to restore the saved POS location:", storageError);
      }
    }
  }, [selectedWarehouse, user?.id]);

  const loadProducts = useCallback(async (warehouseId?: string) => {
    const requestedWarehouseId = warehouseId ?? selectedWarehouse;
    try {
      const endpoint = requestedWarehouseId
        ? `/products?warehouse_id=${encodeURIComponent(requestedWarehouseId)}`
        : "/products";
      const data = await ApiService.get<Product[]>(endpoint);
      const normalized = (data || []).map((product) => ({
        ...product,
        retail_price: Number(product.retail_price),
        tax_rate: Number(product.tax_class?.rate ?? product.tax_rate ?? 0),
        stock_on_hand: Number(product.stock_on_hand),
      }));
      setProducts(normalized);
      if (user?.id) {
        await saveCachedCatalog(user.id, requestedWarehouseId, normalized);
      }
    } catch (error) {
      if (user?.id) {
        try {
          const cached = await readCachedCatalog(user.id, requestedWarehouseId);
          if (cached) {
            setProducts(cached.products.map((product) => ({
              ...product,
              retail_price: Number(product.retail_price),
              tax_rate: Number(product.tax_class?.rate ?? product.tax_rate ?? 0),
              stock_on_hand: Number(product.stock_on_hand),
            })));
            return;
          }
        } catch (storageError) {
          console.error("Unable to restore the cached POS catalogue:", storageError);
        }
      }
      setProducts([]);
      toast.error(`Unable to load products${error instanceof Error ? `: ${error.message}` : "."}`);
    }
  }, [selectedWarehouse, user?.id]);

  const loadCustomers = useCallback(async () => {
    try {
      const data = await ApiService.get<Customer[]>("/customers");
      setCustomers(data || []);
    } catch (e) {
      console.warn("Customers endpoint not ready yet");
      setCustomers([]);
    }
  }, []);

  const loadMpesaConfig = useCallback(async () => {
    try {
      const config = await ApiService.get<MpesaPaymentConfig>("/payments/mpesa/config");
      setMpesaConfig(config);
    } catch (error) {
      console.error("Failed to load M-Pesa payment configuration:", error);
    }
  }, []);

  useEffect(() => {
    void loadWarehouses();
    void loadCustomers();
    void loadMpesaConfig();
    barcodeInputRef.current?.focus();
  }, [loadCustomers, loadMpesaConfig, loadWarehouses]);

  useEffect(() => {
    void loadProducts(selectedWarehouse);
  }, [loadProducts, selectedWarehouse]);

  const handleBarcodeInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const barcode = e.currentTarget.value.trim();
      if (barcode) {
        handleBarcodeScanned(barcode);
        e.currentTarget.value = "";
      }
    }
  };

  const handleBarcodeScanned = (barcode: string) => {
    if (payment.checkoutReserved) {
      toast.error("Finish or release the reserved checkout before adding products");
      return;
    }
    const scannedCode = barcode.trim();
    const product = products.find((p) => {
      if (
        p.barcode === scannedCode ||
        p.sku.toLowerCase() === scannedCode.toLowerCase()
      ) {
        return true;
      }

      return (
        /^\d{12}$/.test(scannedCode) &&
        /^0\d{12}$/.test(p.barcode || "") &&
        p.barcode?.slice(1) === scannedCode
      );
    });

    if (product) {
      addToCart(product);
      toast.success(`Added ${product.name} to cart`);
    } else {
      toast.error("Product not found");
    }
  };

  const filteredProducts = products.filter(
    (p) =>
      (p.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.sku || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.barcode && p.barcode.includes(searchTerm)),
  );

  const addToCart = (product: Product) => {
    if (payment.checkoutReserved) {
      toast.error("Finish or release the reserved checkout before changing its items");
      return;
    }
    const cartProduct = {
      ...product,
      retail_price: Number(product.retail_price),
      tax_rate: Number(product.tax_rate),
      stock_on_hand: Number(product.stock_on_hand),
    };

    if (
      !Number.isFinite(cartProduct.retail_price) ||
      !Number.isFinite(cartProduct.tax_rate) ||
      !Number.isFinite(cartProduct.stock_on_hand)
    ) {
      toast.error(
        "Product information is invalid. Please refresh the product list.",
      );
      return;
    }

    if (cartProduct.stock_on_hand <= 0) {
      toast.error("Product out of stock");
      return;
    }

    const existing = cart.find((item) => item.id === product.id);
    if (existing) {
      if (existing.quantity >= cartProduct.stock_on_hand) {
        toast.error("Cannot exceed available stock");
        return;
      }
      updateQuantity(product.id, existing.quantity + 1);
    } else {
      const lineTotal = cartProduct.retail_price;
      setCart([...cart, { ...cartProduct, quantity: 1, lineTotal }]);
    }
  };

  const updateQuantity = (productId: string, newQuantity: number) => {
    if (payment.checkoutReserved) return;
    setCart(
      cart.map((item) =>
        item.id === productId
          ? {
              ...item,
              quantity: newQuantity,
              lineTotal: item.retail_price * newQuantity,
            }
          : item,
      ),
    );
  };

  const removeFromCart = (productId: string) => {
    if (payment.checkoutReserved) return;
    setCart(cart.filter((item) => item.id !== productId));
  };

  function calculateTotals() {
    const subtotal = cart.reduce(
      (sum, item) => sum + Number(item.lineTotal),
      0,
    );
    const subtotalWithDiscount = Math.max(0, subtotal - loyaltyDiscount);
    const taxAmount = cart.reduce(
      (sum, item) =>
        sum + (Number(item.lineTotal) * Number(item.tax_rate)) / 100,
      0,
    );
    return {
      subtotal: subtotal.toFixed(2),
      subtotalWithDiscount: subtotalWithDiscount.toFixed(2),
      taxAmount: taxAmount.toFixed(2),
      total: (subtotalWithDiscount + taxAmount).toFixed(2),
    };
  }

  const completeOfflineCashSale = async () => {
    if (!user?.id) {
      toast.error("Sign in online on this device before using offline checkout.");
      return;
    }
    if (cart.length === 0) {
      toast.error("Cart is empty");
      return;
    }
    if (
      selectedCustomer !== "walk-in" ||
      loyaltyDiscount > 0 ||
      payment.mpesaAmount > 0 ||
      payment.storeCreditAmount > 0 ||
      payment.storeCreditBarcode ||
      payment.mpesaPending ||
      payment.checkoutReserved ||
      payment.recoveringMpesaSession
    ) {
      toast.error("Offline checkout supports walk-in cash only; clear other payment methods and discounts.");
      return;
    }

    const total = Number(calculateTotals().total);
    if (!Number.isFinite(total) || total <= 0 ||
        Math.round(payment.cashAmount * 100) < Math.round(total * 100)) {
      toast.error("Enter enough cash to cover the full sale before saving it offline.");
      return;
    }

    const capturedAt = new Date().toISOString();
    const id = crypto.randomUUID();
    const record: OfflineSaleRecord = {
      id,
      userId: user.id,
      capturedAt,
      expectedTotal: total,
      items: cart.map((item) => ({
        productId: item.id,
        name: item.name,
        sku: item.sku,
        quantity: item.quantity,
        unitPrice: Number(item.retail_price),
      })),
      status: "pending",
      attempts: 0,
      payload: {
        items: cart.map((item) => ({ product_id: item.id, quantity: item.quantity })),
        payment_method: "cash",
        cash_amount: Number(payment.cashAmount.toFixed(2)),
        idempotency_key: `offline_${id}`,
        expected_total_amount: Number(total.toFixed(2)),
        offline_created_at: capturedAt,
        ...(selectedWarehouse ? { warehouse_id: selectedWarehouse } : {}),
      },
    };

    setLoading(true);
    try {
      await offline.enqueueSale(record);
      if (payment.cashAmount > 0) {
        printerService.openCashDrawer().catch((error) => {
          console.error("Unable to open the cash drawer for offline sale:", error);
        });
      }
      setProvisionalReceipt(record);
      setCart([]);
      setSelectedCustomer("walk-in");
      setLoyaltyDiscount(0);
      setLoyaltyPointsToRedeem(0);
      payment.reset();
    } catch (error) {
      console.error("Unable to save provisional offline sale:", error);
      toast.error(error instanceof Error ? error.message : "Offline sale could not be saved.");
    } finally {
      setLoading(false);
    }
  };

  const parkSale = async () => {
    if (cart.length === 0) return;
    setLoading(true);
    try {
      const items = cart.map((item) => ({
        product_id: item.id,
        quantity: item.quantity,
      }));
      await ApiService.post("/sales/park", {
        customer_id: selectedCustomer === "walk-in" ? null : selectedCustomer,
        warehouse_id: selectedWarehouse,
        loyalty_discount: loyaltyDiscount,
        items,
      });
      toast.success("Sale parked successfully");
      setCart([]);
      setSelectedCustomer("walk-in");
      payment.reset();
    } catch (e) {
      toast.error("Failed to park sale: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchParkedSales = async () => {
    try {
      const data = await ApiService.get<ParkedSale[]>("/sales/parked");
      setParkedSales(data);
      setShowParkedModal(true);
    } catch (e) {
      toast.error("Failed to load parked sales: " + e.message);
    }
  };

  const retrieveParkedSale = (parkedSale: ParkedSale) => {
    if (!Array.isArray(parkedSale.items) || parkedSale.items.length === 0) {
      toast.error("This saved sale has no items and cannot be resumed.");
      return;
    }

    const loadedCart: CartItem[] = parkedSale.items.map((item) => ({
      ...item.product,
      retail_price: Number(item.unit_price),
      tax_rate: Number(item.tax_rate),
      stock_on_hand: Number(item.product.stock_on_hand),
      quantity: Number(item.quantity),
      lineTotal: Number(item.line_total),
    }));
    payment.reset();
    setCart(loadedCart);
    setSelectedCustomer(
      parkedSale.customer ? parkedSale.customer.id : "walk-in",
    );
    setSelectedWarehouse(parkedSale.warehouse?.id || "");
    setLoyaltyDiscount(Number(parkedSale.loyalty_discount) || 0);
    setLoyaltyPointsToRedeem(0);
    setShowParkedModal(false);
    toast.success("Parked sale loaded");
  };

  const completeSale = async () => {
    if (!offline.isOnline || isOfflineSession) {
      await completeOfflineCashSale();
      return;
    }
    if (cart.length === 0) {
      toast.error("Cart is empty");
      return;
    }

    if (!payment.isFullyPaid) {
      toast.error("Payment not complete");
      return;
    }

    setLoading(true);
    try {
      try {
        const shift = await ApiService.get<{ id: string }>("/shifts/current");
        if (!shift?.id) {
          setShowOpenShiftDialog(true);
          return;
        }
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.toLowerCase().includes("no open shift found")
        ) {
          setShowOpenShiftDialog(true);
          return;
        }
        throw error;
      }

      const idempotencyKey = `sale_${payment.checkoutSessionId}`;

      // Prepare items for server-side processing
      const currentTotals = calculateTotals();
      const items = cart.map((item) => ({
        product_id: item.id,
        quantity: item.quantity,
        unit_price: item.retail_price,
        tax_rate: item.tax_rate,
      }));

      // Use server-side secure sale creation
      const saleResult = await ApiService.post<{ id?: string; sale?: { id?: string } }>("/sales", {
        customer_id: selectedCustomer === "walk-in" ? null : selectedCustomer,
        warehouse_id: selectedWarehouse,
        payment_method:
          [payment.cashAmount, payment.mpesaAmount, payment.storeCreditAmount].filter(
            (amount) => amount > 0,
          ).length > 1
            ? "hybrid"
            : payment.cashAmount > 0
              ? "cash"
              : payment.mpesaAmount > 0
                ? "mpesa"
                : "store_credit",
        items: items,
        loyalty_discount: loyaltyDiscount,
        idempotency_key: idempotencyKey,
        cash_amount: payment.cashAmount,
        mpesa_amount: payment.mpesaAmount,
        ...(payment.checkoutReserved
          ? { checkout_session_id: payment.checkoutSessionId }
          : {}),
        ...(payment.mpesaAmount > 0
          ? {
              mpesa_transaction_ids: payment.mpesaTransactionIds,
            }
          : {}),
        store_credit_amount: payment.storeCreditAmount,
        store_credit_barcode: payment.storeCreditBarcode,
        subtotal: parseFloat(currentTotals.subtotal),
        tax_amount: parseFloat(currentTotals.taxAmount),
        total_amount: parseFloat(currentTotals.total),
      });

      const saleId = saleResult.id || saleResult.sale?.id;
      if (!saleId) {
        throw new Error("Sale was processed but its receipt ID was not returned. Check Sales History before retrying.");
      }

      // Kick Cash Drawer if cash is involved
      if (payment.cashAmount > 0) {
        printerService.openCashDrawer().catch(console.error);
      }

      // Award loyalty points (now handled server-side)
      if (selectedCustomer && selectedCustomer !== "walk-in") {
        toast.success(`Loyalty points applied!`);
      }

      toast.success("Sale completed successfully!");
      setCompletedSaleId(saleId);
      setCart([]);
      setSelectedCustomer("walk-in");
      setLoyaltyDiscount(0);
      setLoyaltyPointsToRedeem(0);
      payment.reset();
      loadProducts(selectedWarehouse);
    } catch (error) {
      console.error("Error completing sale:", error);
      toast.error("Failed to complete sale: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const openShift = async () => {
    const amount = Number(openingFloat);
    if (
      !openingFloat.trim() ||
      !Number.isFinite(amount) ||
      amount < 0
    ) {
      toast.error("Enter a valid non-negative opening cash float");
      return;
    }

    setOpeningShift(true);
    try {
      await ApiService.post("/shifts/open", { opening_float: amount });
      setShowOpenShiftDialog(false);
      setOpeningFloat("");
      toast.success("Shift opened. Complete the sale when ready.");
    } catch (error) {
      toast.error(
        `Unable to open shift: ${error instanceof Error ? error.message : "Please try again"}`,
      );
    } finally {
      setOpeningShift(false);
    }
  };

  const handleMpesaPayment = async (phone: string, amount: number) => {
    if (!offline.isOnline || isOfflineSession) {
      toast.error("M-Pesa checkout requires a live server connection.");
      return false;
    }
    // Validate phone number
    if (!validatePhoneNumber(phone)) {
      toast.error("Please enter a valid Kenyan phone number");
      return false;
    }

    // Validate amount
    if (!validateAmount(amount)) {
      toast.error("Invalid payment amount");
      return false;
    }

    try {
      return await secureApiCall(
        async () => {
          return payment.initiateSTKPush(phone, amount, {
            items: cart.map((item) => ({
              product_id: item.id,
              quantity: item.quantity,
            })),
            loyalty_discount: loyaltyDiscount,
            cash_amount: payment.cashAmount,
            store_credit_amount: payment.storeCreditAmount,
            store_credit_barcode: payment.storeCreditBarcode || undefined,
            warehouse_id: selectedWarehouse || undefined,
            customer_id: selectedCustomer === "walk-in"
              ? undefined
              : selectedCustomer,
          });
        },
        paymentRateLimiter,
        `mpesa_${user?.id}`,
      );
    } catch (error) {
      toast.error(error.message);
      return false;
    }
  };

  const handlePaybillPayment = async (phone: string, amount: number) => {
    if (!offline.isOnline || isOfflineSession) {
      toast.error("Paybill checkout requires a live server connection.");
      return false;
    }
    if (!validatePhoneNumber(phone)) {
      toast.error("Please enter the phone number used to make the Paybill payment");
      return false;
    }
    if (!validateAmount(amount)) {
      toast.error("Invalid payment amount");
      return false;
    }
    try {
      return await secureApiCall(
        () => payment.initiatePaybill(phone, amount, {
          items: cart.map((item) => ({
            product_id: item.id,
            quantity: item.quantity,
          })),
          loyalty_discount: loyaltyDiscount,
          cash_amount: payment.cashAmount,
          store_credit_amount: payment.storeCreditAmount,
          store_credit_barcode: payment.storeCreditBarcode || undefined,
          warehouse_id: selectedWarehouse || undefined,
          customer_id: selectedCustomer === "walk-in"
            ? undefined
            : selectedCustomer,
        }),
        paymentRateLimiter,
        `paybill_${user?.id}`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Paybill payment could not be started");
      return false;
    }
  };

  const handleCashPayment = async (amount: number) => {
    payment.setCashAmount(amount);
    return true;
  };

  const handleStoreCreditPayment = async (
    amount: number,
    barcode: string | null,
  ) => {
    if (!offline.isOnline || isOfflineSession) {
      toast.error("Store credit checkout requires a live server connection.");
      return;
    }
    payment.addStoreCreditPayment(amount, barcode);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/20 to-background p-4 sm:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Point of Sale
            </h1>
            <p className="text-muted-foreground mt-1">
              Fast, modern checkout experience
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setShowSalesHistoryModal(true)}
              >
                <FileText className="h-4 w-4" />
                Sales History & eTIMS
              </Button>
              <Select
                value={selectedWarehouse}
                onValueChange={setSelectedWarehouse}
              >
                <SelectTrigger className="w-[200px] border-primary/20 bg-primary/10 font-semibold">
                  <SelectValue placeholder="Select Branch" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-lg border border-primary/20">
              <ShoppingCart className="h-5 w-5 text-primary" />
              <span className="font-semibold text-primary">
                {cart.length} items
              </span>
            </div>
          </div>
        </div>

        {!offline.isOnline && (
          <Card className="border-amber-500 bg-amber-50 text-amber-950 dark:bg-amber-950 dark:text-amber-50">
            <CardContent className="space-y-1 p-4">
              <p className="font-semibold">Offline POS — provisional mode</p>
              <p className="text-sm">
                Catalogue and stock are the last saved snapshot. Only walk-in cash sales can be captured; price, tax, stock, and shift are rechecked when the server is reachable.
              </p>
            </CardContent>
          </Card>
        )}

        {offline.sales.some((sale) => sale.status !== "synced") && (
          <Card className="border-primary/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                Offline sales awaiting confirmation ({offline.queueLength})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {offline.sales
                .filter((sale) => sale.status !== "synced")
                .slice()
                .reverse()
                .map((sale) => (
                  <div key={sale.id} className="rounded-md border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium">
                          OFF-{sale.id.slice(0, 8).toUpperCase()} · KSh {sale.expectedTotal.toLocaleString("en-KE", { minimumFractionDigits: 2 })}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(sale.capturedAt).toLocaleString()} ·{" "}
                          {sale.status === "conflict"
                            ? "Needs review"
                            : sale.status === "syncing"
                              ? "Syncing"
                              : "Waiting for server"}
                        </p>
                        {sale.lastError && (
                          <p className="mt-1 text-sm text-destructive">{sale.lastError}</p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        {sale.status === "conflict" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void offline.retrySale(sale.id)}
                          >
                            Retry
                          </Button>
                        )}
                        {sale.status !== "syncing" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              if (window.confirm("Remove this provisional sale from this device? Keep its paper reference and reconcile it manually first.")) {
                                void offline.discardSale(sale.id);
                              }
                            }}
                          >
                            Discard
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
            </CardContent>
          </Card>
        )}

        <div className="grid gap-6 lg:grid-cols-[1fr_450px]">
          {/* Product Section */}
          <div className="space-y-4">
            {/* Search Bar */}
            <Card className="border-2 shadow-lg">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Package className="h-5 w-5 text-primary" />
                  </div>
                  <CardTitle className="text-xl">Product Catalog</CardTitle>
                </div>
                <div className="space-y-3 pt-4">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                      <Input
                        ref={barcodeInputRef}
                        placeholder="🔍 Scan barcode or enter SKU..."
                        onKeyDown={handleBarcodeInput}
                        className="pl-10 h-12 text-lg border-2 focus:border-primary transition-all"
                      />
                    </div>
                    <BarcodeScanner onScan={handleBarcodeScanned} />
                  </div>
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by name, SKU, or barcode..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 max-h-[calc(100vh-400px)] overflow-y-auto pr-2">
                  {filteredProducts.map((product) => (
                    <div
                      key={product.id}
                      onClick={() => addToCart(product)}
                      className="group relative p-4 border-2 rounded-xl hover:border-primary hover:shadow-lg cursor-pointer transition-all duration-300 hover:scale-105 bg-card"
                    >
                      <div className="flex flex-col gap-2">
                        <div className="flex items-start justify-between">
                          <h3 className="font-semibold text-sm line-clamp-2 flex-1 group-hover:text-primary transition-colors">
                            {product.name}
                          </h3>
                          {product.stock_on_hand <= 5 && (
                            <Badge
                              variant={
                                product.stock_on_hand === 0
                                  ? "destructive"
                                  : "secondary"
                              }
                              className="text-xs"
                            >
                              {product.stock_on_hand === 0 ? "Out" : "Low"}
                            </Badge>
                          )}
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">
                            SKU: {product.sku}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Stock:{" "}
                            <span
                              className={
                                product.stock_on_hand <= 5
                                  ? "text-destructive font-semibold"
                                  : "text-accent font-semibold"
                              }
                            >
                              {product.stock_on_hand}
                            </span>
                          </p>
                        </div>
                        <div className="pt-2 border-t">
                          <p className="text-xl font-bold text-primary">
                            KSh{" "}
                            {Number(product.retail_price || 0).toLocaleString(
                              "en-KE",
                              { minimumFractionDigits: 2 },
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="absolute inset-0 border-2 border-transparent group-hover:border-primary rounded-xl pointer-events-none transition-all duration-300" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Cart Section */}
          <div className="space-y-4">
            <Card className="border-2 shadow-xl sticky top-4">
              <CardHeader className="bg-gradient-to-r from-primary/5 to-accent/5 border-b-2">
                <CardTitle className="flex items-center justify-between gap-3 text-xl">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary rounded-lg">
                      <ShoppingCart className="h-5 w-5 text-primary-foreground" />
                    </div>
                    Shopping Cart
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={fetchParkedSales}
                      disabled={payment.checkoutReserved}
                    >
                      <PlayCircle className="h-4 w-4 mr-1" /> Saved Sales
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={parkSale}
                      disabled={cart.length === 0 || loading || payment.checkoutReserved}
                    >
                      <PauseCircle className="h-4 w-4 mr-1" /> Save for Later
                    </Button>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-6">
                {cart.length === 0 ? (
                  <div className="text-center py-12">
                    <ShoppingCart className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
                    <p className="text-muted-foreground font-medium">
                      Cart is empty
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Scan or select products to start
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                      {cart.map((item) => (
                        <div
                          key={item.id}
                          className="p-3 border-2 rounded-lg bg-card hover:border-primary/50 transition-all"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-sm truncate">
                                {item.name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                KSh {item.retail_price.toFixed(2)} each
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeFromCart(item.id)}
                              disabled={payment.checkoutReserved}
                              className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() =>
                                  updateQuantity(
                                    item.id,
                                    Math.max(1, item.quantity - 1),
                                  )
                                }
                                disabled={payment.checkoutReserved}
                                className="h-8 w-8"
                              >
                                <Minus className="h-3 w-3" />
                              </Button>
                              <span className="w-12 text-center font-semibold">
                                {item.quantity}
                              </span>
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() =>
                                  updateQuantity(
                                    item.id,
                                    Math.min(
                                      item.stock_on_hand,
                                      item.quantity + 1,
                                    ),
                                  )
                                }
                                disabled={payment.checkoutReserved}
                                className="h-8 w-8"
                              >
                                <Plus className="h-3 w-3" />
                              </Button>
                            </div>
                            <p className="font-bold text-primary">
                              KSh {item.lineTotal.toFixed(2)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-3 pt-4 border-t-2">
                      <div>
                        <Label className="text-xs font-semibold text-muted-foreground">
                          CUSTOMER
                        </Label>
                        <Select
                          value={selectedCustomer}
                          onValueChange={handleCustomerChange}
                          disabled={payment.checkoutReserved}
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue placeholder="Walk-in customer" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="walk-in">
                              Walk-in customer
                            </SelectItem>
                            {customers.map((customer) => (
                              <SelectItem key={customer.id} value={customer.id}>
                                {customer.name} - {customer.phone}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Loyalty Redemption - only show for registered customers */}
                      {selectedCustomer !== "walk-in" && cart.length > 0 && (
                        <LoyaltyRedemption
                          customerId={selectedCustomer}
                          totalAmount={cart.reduce(
                            (sum, item) => sum + item.lineTotal,
                            0,
                          )}
                          onApplyDiscount={handleLoyaltyDiscount}
                          appliedDiscount={loyaltyDiscount}
                          appliedPoints={loyaltyPointsToRedeem}
                        />
                      )}

                      {/* Hybrid Payment Panel */}
                      <HybridPaymentPanel
                        totalAmount={getTotalAmount()}
                        cashAmount={payment.cashAmount}
                        mpesaAmount={payment.mpesaAmount}
                        storeCreditAmount={payment.storeCreditAmount}
                        storeCreditAccountBalance={Number(
                          customers.find(
                            (customer) => customer.id === selectedCustomer,
                          )?.store_credit_balance || 0,
                        )}
                        remainingAmount={payment.remainingAmount}
                        changeAmount={payment.changeAmount}
                        status={payment.status}
                        mpesaPending={payment.mpesaPending}
                        checkoutReserved={payment.checkoutReserved}
                        recoveringCheckout={payment.recoveringCheckout}
                        canCancelCheckout={payment.canCancelCheckout}
                        paybillNumber={mpesaConfig.paybill_number}
                        paybillEnabled={mpesaConfig.paybill_c2b_enabled}
                        stkPushEnabled={mpesaConfig.stk_push_enabled}
                        stkPushIssues={mpesaConfig.stk_push_issues}
                        paybillReference={payment.paybillReference}
                        paybillAmount={payment.paybillAmount}
                        onCashAmountChange={handleCashPayment}
                        onMpesaPayment={handleMpesaPayment}
                        onPaybillPayment={handlePaybillPayment}
                        onStoreCreditPayment={handleStoreCreditPayment}
                        onCompleteSale={completeSale}
                        onCancelCheckout={payment.cancelCheckout}
                        isFullyPaid={payment.isFullyPaid}
                        disabled={loading || cart.length === 0}
                      />
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {completedSaleId && (
        <Receipt
          saleId={completedSaleId}
          onClose={() => setCompletedSaleId(null)}
        />
      )}

      <OfflineSaleReceipt
        sale={provisionalReceipt}
        onClose={() => setProvisionalReceipt(null)}
      />

      <Dialog
        open={showOpenShiftDialog}
        onOpenChange={(open) => {
          if (!openingShift) setShowOpenShiftDialog(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Open a cashier shift</DialogTitle>
            <DialogDescription>
              A shift must be open before a sale can be completed. Your cart and payment amounts will be kept.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="sales-opening-float">Opening cash float (KSh)</Label>
            <Input
              id="sales-opening-float"
              type="number"
              min="0"
              step="0.01"
              value={openingFloat}
              onChange={(event) => setOpeningFloat(event.target.value)}
              placeholder="0.00"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowOpenShiftDialog(false)}
              disabled={openingShift}
            >
              Cancel
            </Button>
            <Button onClick={() => void openShift()} disabled={openingShift}>
              {openingShift ? "Opening..." : "Open Shift"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Parked Sales Modal */}
      <Dialog open={showParkedModal} onOpenChange={setShowParkedModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Parked Sales</DialogTitle>
            <DialogDescription>
              Resume a saved sale to continue checkout.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            {parkedSales.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">
                No parked sales found.
              </p>
            ) : (
              parkedSales.map((sale) => (
                <div
                  key={sale.id}
                  className="flex items-center justify-between p-3 border rounded-lg bg-card"
                >
                  <div>
                    <p className="font-medium">
                      {sale.customer ? sale.customer.name : "Walk-in"} -{" "}
                      {new Date(sale.created_at).toLocaleString()}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {sale.items.length} items
                    </p>
                  </div>
                  <Button onClick={() => retrieveParkedSale(sale)}>
                    Resume
                  </Button>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Sales History & eTIMS Fiscal Log Modal */}
      <Dialog open={showSalesHistoryModal} onOpenChange={setShowSalesHistoryModal}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pr-6">
              <div>
                <DialogTitle className="text-xl">Sales History & eTIMS Fiscal Log</DialogTitle>
                <DialogDescription>
                  Monitor sales transactions and KRA eTIMS fiscal submission statuses.
                </DialogDescription>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">Filter eTIMS:</span>
                <Select value={etimsFilter} onValueChange={setEtimsFilter}>
                  <SelectTrigger className="w-[160px] h-8 text-xs">
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="submitted">Submitted</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                    <SelectItem value="not_applicable">Not Applicable</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto mt-2 border rounded-md">
            {loadingSalesHistory ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                Loading sales records...
              </div>
            ) : salesHistory.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No sales found matching the selected filter.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Receipt / Ref</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Cashier</TableHead>
                    <TableHead className="text-right">Total (KSh)</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>eTIMS Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {salesHistory.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-xs font-semibold">
                        {s.id.slice(0, 8).toUpperCase()}
                      </TableCell>
                      <TableCell className="text-xs">
                        {new Date(s.created_at).toLocaleString("en-KE", { dateStyle: "short", timeStyle: "short" })}
                      </TableCell>
                      <TableCell className="text-xs">{s.customer?.name || "Walk-in"}</TableCell>
                      <TableCell className="text-xs">{s.cashier?.profile?.full_name || s.cashier?.email || "—"}</TableCell>
                      <TableCell className="text-xs text-right font-medium">
                        {Number(s.total_amount).toLocaleString("en-KE", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-xs uppercase">{s.payment_method}</TableCell>
                      <TableCell>{renderEtimsBadge(s.etims_status)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => {
                            setCompletedSaleId(s.id);
                          }}
                        >
                          View Receipt
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
