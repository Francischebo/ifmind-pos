import { useState, useEffect } from "react";
import { ApiService } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Receipt, Search, Plus, CreditCard, Eye } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuthContext";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format, addDays } from "date-fns";

interface SupplierInvoice {
  id: string;
  invoice_number: string;
  vendor_id: string;
  po_id: string | null;
  delivery_note_id: string | null;
  invoice_date: string;
  due_date: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  paid_amount: number;
  balance_due: number;
  status: string;
  payment_terms: string | null;
  created_at: string;
  vendors: { name: string } | null;
  purchase_orders: { po_number: string } | null;
}

interface Vendor {
  id: string;
  name: string;
  payment_terms: string | null;
}

interface PurchaseOrder {
  id: string;
  po_number: string;
  total_amount: number;
  vendor_id: string;
}

interface DeliveryNote {
  id: string;
  grn_number: string;
  po_id: string;
  vendor_id: string;
  total_value: number;
  status: string;
}

interface SupplierPayment {
  id: string;
  amount: number;
  payment_method: string;
  reference_number: string | null;
  payment_date: string;
}

export default function SupplierInvoices() {
  const { user, role } = useAuth();
  const [invoices, setInvoices] = useState<SupplierInvoice[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [deliveryNotes, setDeliveryNotes] = useState<DeliveryNote[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] =
    useState<SupplierInvoice | null>(null);
  const [payments, setPayments] = useState<SupplierPayment[]>([]);

  const [formData, setFormData] = useState({
    invoice_number: "",
    vendor_id: "",
    po_id: "",
    delivery_note_id: "",
    invoice_date: format(new Date(), "yyyy-MM-dd"),
    due_date: format(addDays(new Date(), 30), "yyyy-MM-dd"),
    subtotal: "",
    tax_amount: "",
  });

  const [paymentForm, setPaymentForm] = useState({
    amount: "",
    payment_method: "bank_transfer",
    reference_number: "",
    payment_date: format(new Date(), "yyyy-MM-dd"),
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [invoicesData, vendorsData, posData, deliveryNotesData] =
        await Promise.all([
          ApiService.get<
            Array<
              SupplierInvoice & {
                vendor?: { name: string };
                purchase_order?: { po_number: string };
              }
            >
          >("/procurement/supplier-invoices"),
          ApiService.get<Array<Vendor>>("/vendors"),
          ApiService.get<Array<PurchaseOrder>>("/purchase-orders"),
          ApiService.get<Array<DeliveryNote>>("/delivery-notes"),
        ]);

      setInvoices(
        (invoicesData || []).map((invoice) => ({
          ...invoice,
          vendors: invoice.vendor ?? invoice.vendors ?? null,
          purchase_orders:
            invoice.purchase_order ?? invoice.purchase_orders ?? null,
        })) as SupplierInvoice[],
      );
      setVendors((vendorsData || []) as Vendor[]);
      setPurchaseOrders((posData || []) as PurchaseOrder[]);
      setDeliveryNotes((deliveryNotesData || []) as DeliveryNote[]);
    } catch (error) {
      toast.error(error.message || "Failed to load supplier invoice data");
    } finally {
      setLoading(false);
    }
  };

  const loadPayments = async (invoiceId: string) => {
    try {
      const data = await ApiService.get<SupplierPayment[]>(
        `/procurement/supplier-invoices/${invoiceId}/payments`,
      );
      setPayments(data || []);
    } catch (error) {
      console.error("Failed to load supplier payments", error);
      setPayments([]);
    }
  };

  const handleCreateInvoice = async () => {
    if (
      !user?.id ||
      !formData.vendor_id ||
      !formData.po_id ||
      !formData.delivery_note_id
    ) {
      toast.error(
        "Select a vendor, purchase order, and completed goods receipt",
      );
      return;
    }

    const subtotal = parseFloat(formData.subtotal) || 0;
    const tax_amount = parseFloat(formData.tax_amount) || 0;
    const total_amount = subtotal + tax_amount;

    try {
      await ApiService.post("/procurement/supplier-invoices", {
        invoice_number: formData.invoice_number,
        vendor_id: formData.vendor_id,
        po_id: formData.po_id || null,
        delivery_note_id: formData.delivery_note_id,
        invoice_date: formData.invoice_date,
        due_date: formData.due_date,
        subtotal,
        tax_amount,
        total_amount,
        created_by: user.id,
      });

      toast.success("Supplier invoice created");
      setDialogOpen(false);
      setFormData({
        invoice_number: "",
        vendor_id: "",
        po_id: "",
        delivery_note_id: "",
        invoice_date: format(new Date(), "yyyy-MM-dd"),
        due_date: format(addDays(new Date(), 30), "yyyy-MM-dd"),
        subtotal: "",
        tax_amount: "",
      });
      await loadData();
    } catch (error) {
      toast.error(error.message || "Failed to create invoice");
    }
  };

  const handleRecordPayment = async () => {
    if (!selectedInvoice || !user?.id) return;

    const amount = parseFloat(paymentForm.amount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    if (amount > selectedInvoice.balance_due) {
      toast.error("Payment exceeds balance due");
      return;
    }

    try {
      await ApiService.post(
        `/procurement/supplier-invoices/${selectedInvoice.id}/payments`,
        {
          amount,
          payment_method: paymentForm.payment_method,
          reference_number: paymentForm.reference_number || null,
          payment_date: paymentForm.payment_date,
          paid_by: user.id,
        },
      );

      toast.success("Payment recorded");
      setPaymentDialogOpen(false);
      setPaymentForm({
        amount: "",
        payment_method: "bank_transfer",
        reference_number: "",
        payment_date: format(new Date(), "yyyy-MM-dd"),
      });
      await loadData();
      await loadPayments(selectedInvoice.id);
    } catch (error) {
      toast.error(error.message || "Failed to record payment");
    }
  };

  const handleViewInvoice = async (invoice: SupplierInvoice) => {
    setSelectedInvoice(invoice);
    await loadPayments(invoice.id);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
      case "unpaid":
        return "secondary";
      case "matched":
      case "partially_paid":
        return "outline";
      case "paid":
        return "default";
      case "discrepancy":
      case "overdue":
        return "destructive";
      case "disputed":
        return "destructive";
      default:
        return "default";
    }
  };

  const filteredInvoices = invoices.filter(
    (inv) =>
      inv.invoice_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.vendors?.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const isAdmin = role === "admin";

  // Calculate totals
  const totalPayables = invoices.reduce((sum, inv) => sum + inv.balance_due, 0);
  const overdueAmount = invoices
    .filter((inv) => new Date(inv.due_date) < new Date() && inv.balance_due > 0)
    .reduce((sum, inv) => sum + inv.balance_due, 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Receipt className="h-8 w-8 text-primary" />
            Supplier Invoices
          </h1>
          <p className="text-muted-foreground">Manage accounts payable</p>
        </div>
        {isAdmin && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Invoice
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Supplier Invoice</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Invoice Number *</Label>
                    <Input
                      value={formData.invoice_number}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          invoice_number: e.target.value,
                        })
                      }
                      placeholder="INV-001"
                    />
                  </div>
                  <div>
                    <Label>Vendor *</Label>
                    <Select
                      value={formData.vendor_id}
                      onValueChange={(val) =>
                        setFormData({ ...formData, vendor_id: val })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select vendor" />
                      </SelectTrigger>
                      <SelectContent>
                        {vendors.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label>Link to Purchase Order</Label>
                  <Select
                    value={formData.po_id}
                    onValueChange={(val) => {
                      const po = purchaseOrders.find((p) => p.id === val);
                      const availableNotes = deliveryNotes.filter(
                        (note) =>
                          note.po_id === val && note.status === "completed",
                      );
                      setFormData({
                        ...formData,
                        po_id: val,
                        delivery_note_id:
                          availableNotes.length === 1
                            ? availableNotes[0].id
                            : "",
                        subtotal:
                          availableNotes.length === 1
                            ? Number(availableNotes[0].total_value).toString()
                            : "",
                        vendor_id: po ? po.vendor_id : formData.vendor_id,
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select PO (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {purchaseOrders.map((po) => (
                        <SelectItem key={po.id} value={po.id}>
                          {po.po_number} - KSh{" "}
                          {po.total_amount.toLocaleString()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Completed Goods Receipt *</Label>
                  <Select
                    value={formData.delivery_note_id}
                    onValueChange={(value) => {
                      const deliveryNote = deliveryNotes.find(
                        (note) => note.id === value,
                      );
                      setFormData({
                        ...formData,
                        delivery_note_id: value,
                        subtotal: deliveryNote
                          ? Number(deliveryNote.total_value).toString()
                          : formData.subtotal,
                      });
                    }}
                    disabled={!formData.po_id}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select completed GRN" />
                    </SelectTrigger>
                    <SelectContent>
                      {deliveryNotes
                        .filter(
                          (note) =>
                            note.po_id === formData.po_id &&
                            note.status === "completed",
                        )
                        .map((note) => (
                          <SelectItem key={note.id} value={note.id}>
                            {note.grn_number} · KSh{" "}
                            {Number(note.total_value).toLocaleString("en-KE", {
                              minimumFractionDigits: 2,
                            })}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Invoice Date</Label>
                    <Input
                      type="date"
                      value={formData.invoice_date}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          invoice_date: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label>Due Date</Label>
                    <Input
                      type="date"
                      value={formData.due_date}
                      onChange={(e) =>
                        setFormData({ ...formData, due_date: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Subtotal (KSh)</Label>
                    <Input
                      type="number"
                      value={formData.subtotal}
                      onChange={(e) =>
                        setFormData({ ...formData, subtotal: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label>VAT Amount (KSh)</Label>
                    <Input
                      type="number"
                      value={formData.tax_amount}
                      onChange={(e) =>
                        setFormData({ ...formData, tax_amount: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div className="pt-2 border-t">
                  <p className="text-sm text-muted-foreground">Total Amount</p>
                  <p className="text-2xl font-bold">
                    KSh{" "}
                    {(
                      (parseFloat(formData.subtotal) || 0) +
                      (parseFloat(formData.tax_amount) || 0)
                    ).toLocaleString("en-KE", { minimumFractionDigits: 2 })}
                  </p>
                </div>

                <Button
                  onClick={handleCreateInvoice}
                  className="w-full"
                  disabled={!formData.delivery_note_id}
                >
                  Create Invoice
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Payables
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              KSh{" "}
              {totalPayables.toLocaleString("en-KE", {
                minimumFractionDigits: 2,
              })}
            </p>
          </CardContent>
        </Card>
        <Card className={overdueAmount > 0 ? "border-destructive" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Overdue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={`text-2xl font-bold ${overdueAmount > 0 ? "text-destructive" : ""}`}
            >
              KSh{" "}
              {overdueAmount.toLocaleString("en-KE", {
                minimumFractionDigits: 2,
              })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pending Invoices
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {invoices.filter((i) => i.balance_due > 0).length}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by invoice number or vendor..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Paid</TableHead>
                <TableHead>Balance</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : filteredInvoices.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center py-8 text-muted-foreground"
                  >
                    No invoices found
                  </TableCell>
                </TableRow>
              ) : (
                filteredInvoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-mono">
                      {invoice.invoice_number}
                    </TableCell>
                    <TableCell>{invoice.vendors?.name}</TableCell>
                    <TableCell>
                      KSh{" "}
                      {invoice.total_amount.toLocaleString("en-KE", {
                        minimumFractionDigits: 2,
                      })}
                    </TableCell>
                    <TableCell className="text-green-600">
                      KSh{" "}
                      {invoice.paid_amount.toLocaleString("en-KE", {
                        minimumFractionDigits: 2,
                      })}
                    </TableCell>
                    <TableCell
                      className={
                        invoice.balance_due > 0
                          ? "text-destructive font-medium"
                          : ""
                      }
                    >
                      KSh{" "}
                      {invoice.balance_due.toLocaleString("en-KE", {
                        minimumFractionDigits: 2,
                      })}
                    </TableCell>
                    <TableCell
                      className={
                        new Date(invoice.due_date) < new Date() &&
                        invoice.balance_due > 0
                          ? "text-destructive"
                          : ""
                      }
                    >
                      {format(new Date(invoice.due_date), "dd/MM/yyyy")}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={getStatusColor(invoice.status)}
                        className="capitalize"
                      >
                        {invoice.status.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleViewInvoice(invoice)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {isAdmin && invoice.balance_due > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedInvoice(invoice);
                            setPaymentDialogOpen(true);
                          }}
                        >
                          <CreditCard className="h-4 w-4 mr-1" />
                          Pay
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog
        open={!!selectedInvoice && !paymentDialogOpen}
        onOpenChange={() => setSelectedInvoice(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Invoice: {selectedInvoice?.invoice_number}
            </DialogTitle>
          </DialogHeader>
          {selectedInvoice && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Vendor</p>
                  <p className="font-medium">{selectedInvoice.vendors?.name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge variant={getStatusColor(selectedInvoice.status)}>
                    {selectedInvoice.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total</p>
                  <p className="font-bold">
                    KSh {selectedInvoice.total_amount.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Balance Due</p>
                  <p
                    className={`font-bold ${selectedInvoice.balance_due > 0 ? "text-destructive" : "text-green-600"}`}
                  >
                    KSh {selectedInvoice.balance_due.toLocaleString()}
                  </p>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-2">Payment History</h4>
                {payments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No payments recorded
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Reference</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payments.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell>
                            {format(new Date(p.payment_date), "dd/MM/yyyy")}
                          </TableCell>
                          <TableCell className="text-green-600 font-medium">
                            KSh {p.amount.toLocaleString()}
                          </TableCell>
                          <TableCell className="capitalize">
                            {p.payment_method.replace("_", " ")}
                          </TableCell>
                          <TableCell>{p.reference_number || "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
          </DialogHeader>
          {selectedInvoice && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">Balance Due</p>
                <p className="text-2xl font-bold text-primary">
                  KSh {selectedInvoice.balance_due.toLocaleString()}
                </p>
              </div>

              <div>
                <Label>Amount (KSh)</Label>
                <Input
                  type="number"
                  value={paymentForm.amount}
                  onChange={(e) =>
                    setPaymentForm({ ...paymentForm, amount: e.target.value })
                  }
                />
              </div>

              <div>
                <Label>Payment Method</Label>
                <Select
                  value={paymentForm.payment_method}
                  onValueChange={(val) =>
                    setPaymentForm({ ...paymentForm, payment_method: val })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="mpesa">M-Pesa</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Reference Number</Label>
                <Input
                  value={paymentForm.reference_number}
                  onChange={(e) =>
                    setPaymentForm({
                      ...paymentForm,
                      reference_number: e.target.value,
                    })
                  }
                />
              </div>

              <div>
                <Label>Payment Date</Label>
                <Input
                  type="date"
                  value={paymentForm.payment_date}
                  onChange={(e) =>
                    setPaymentForm({
                      ...paymentForm,
                      payment_date: e.target.value,
                    })
                  }
                />
              </div>

              <Button onClick={handleRecordPayment} className="w-full">
                Record Payment
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
