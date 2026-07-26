import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { initializeSecurity } from "@/lib/security";
import { useEffect } from "react";
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Products from "./pages/Products";
import NewProduct from "./pages/NewProduct";
import Sales from "./pages/Sales";
import Customers from "./pages/Customers";
import Vendors from "./pages/Vendors";
import PurchaseOrders from "./pages/PurchaseOrders";
import NewPurchaseOrder from "./pages/NewPurchaseOrder";
import ReceivePurchaseOrder from "./pages/ReceivePurchaseOrder";
import MobileCashier from "./pages/MobileCashier";
import Locations from "./pages/Locations";
import InventoryTransfers from "./pages/InventoryTransfers";
import VendorPortal from "./pages/VendorPortal";
import Reports from "./pages/Reports";
import Returns from "./pages/Returns";
import Shifts from "./pages/Shifts";
import Loyalty from "./pages/Loyalty";
import Settings from "./pages/Settings";
import Users from "./pages/Users";
import NotFound from "./pages/NotFound";
import Invoices from "./pages/Invoices";
import DeliveryNotes from "./pages/DeliveryNotes";
import SupplierInvoices from "./pages/SupplierInvoices";
import StockMovements from "./pages/StockMovements";
import AccountsReceivable from "./pages/AccountsReceivable";
import InventoryAdjustments from "./pages/InventoryAdjustments";
import StockTakes from "./pages/StockTakes";

const queryClient = new QueryClient();

const App = () => {
  useEffect(() => {
    // Initialize security systems on app startup
    initializeSecurity().catch((error) => {
      console.error('Failed to initialize security systems:', error);
    });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <PWAInstallPrompt />
        <OfflineIndicator />
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AuthProvider>
            <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/auth" element={<Auth />} />
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <div className="min-h-screen w-full bg-gradient-to-br from-background via-background to-muted/20">
                    <Navbar />
                    <main className="container mx-auto px-2 sm:px-4 py-4 sm:py-6">
                      <Routes>
                        <Route path="/dashboard" element={<Dashboard />} />
                        <Route path="/products" element={<Products />} />
                        <Route path="/products/new" element={<NewProduct />} />
                        <Route path="/sales" element={<Sales />} />
                        <Route path="/invoices" element={<Invoices />} />
                        <Route path="/customers" element={<Customers />} />
                        <Route path="/vendors" element={<Vendors />} />
                        <Route path="/purchase-orders" element={<PurchaseOrders />} />
                        <Route path="/purchase-orders/new" element={<NewPurchaseOrder />} />
                        <Route path="/purchase-orders/:id/receive" element={<ReceivePurchaseOrder />} />
                        <Route path="/delivery-notes" element={<DeliveryNotes />} />
                        <Route path="/supplier-invoices" element={<SupplierInvoices />} />
                        <Route path="/stock-movements" element={<StockMovements />} />
                        <Route path="/accounts-receivable" element={<AccountsReceivable />} />
                        <Route path="/mobile-cashier" element={<MobileCashier />} />
                        <Route path="/locations" element={<Locations />} />
                        <Route path="/inventory-transfers" element={<InventoryTransfers />} />
                        <Route path="/inventory-adjustments" element={<InventoryAdjustments />} />
                        <Route path="/stock-takes" element={<StockTakes />} />
                        <Route path="/vendor-portal" element={<VendorPortal />} />
                        <Route path="/reports" element={<Reports />} />
                        <Route path="/returns" element={<Returns />} />
                        <Route path="/shifts" element={<Shifts />} />
                        <Route path="/loyalty" element={<Loyalty />} />
                        <Route path="/settings" element={<Settings />} />
                        <Route path="/users" element={<Users />} />
                        <Route path="*" element={<NotFound />} />
                      </Routes>
                    </main>
                  </div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  );
};

export default App;
