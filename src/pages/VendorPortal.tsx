import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { Package, FileText, MessageSquare, Upload } from 'lucide-react';

interface PurchaseOrder {
  id: string;
  po_number: string;
  total_amount: number;
  status: string;
  created_at: string;
  notes: string | null;
}

interface Invoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  amount: number;
  status: string;
  po_id: string;
}

export default function VendorPortal() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedPO, setSelectedPO] = useState<string>('');
  const [invoiceForm, setInvoiceForm] = useState({
    invoice_number: '',
    invoice_date: new Date().toISOString().split('T')[0],
    due_date: '',
    amount: 0,
    notes: '',
  });

  useEffect(() => {
    loadVendorData();
  }, [user]);

  const loadVendorData = async () => {
    if (!user?.email) return;

    // Get vendor ID from email
    const { data: vendor } = await supabase
      .from('vendors')
      .select('id')
      .eq('email', user.email)
      .maybeSingle();

    if (!vendor) {
      toast.error('No vendor account found for this email');
      return;
    }

    setVendorId(vendor.id);

    // Load purchase orders
    const { data: pos } = await supabase
      .from('purchase_orders')
      .select('*')
      .eq('vendor_id', vendor.id)
      .order('created_at', { ascending: false });

    setOrders(pos || []);

    // Load invoices
    const { data: invs } = await supabase
      .from('vendor_invoices' as any)
      .select('*')
      .eq('vendor_id', vendor.id)
      .order('created_at', { ascending: false });

    setInvoices((invs as unknown as Invoice[]) || []);
  };

  const handleSubmitInvoice = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!vendorId || !selectedPO) {
      toast.error('Please select a purchase order');
      return;
    }

    const { error } = await supabase
      .from('vendor_invoices' as any)
      .insert([{
        ...invoiceForm,
        po_id: selectedPO,
        vendor_id: vendorId,
        status: 'pending',
      }]);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Invoice submitted successfully');
      setDialogOpen(false);
      resetForm();
      loadVendorData();
    }
  };

  const resetForm = () => {
    setInvoiceForm({
      invoice_number: '',
      invoice_date: new Date().toISOString().split('T')[0],
      due_date: '',
      amount: 0,
      notes: '',
    });
    setSelectedPO('');
  };

  const updatePOStatus = async (poId: string, status: string) => {
    const { error } = await supabase
      .from('purchase_orders')
      .update({ status })
      .eq('id', poId);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`Status updated to ${status}`);
      loadVendorData();
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'sent': return 'default';
      case 'received': return 'outline';
      case 'pending': return 'secondary';
      default: return 'outline';
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Vendor Portal</h1>
        <p className="text-muted-foreground">Manage your purchase orders and invoices</p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Orders</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {orders.filter(o => o.status === 'sent').length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Invoices</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {invoices.filter(i => i.status === 'pending').length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Value</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              KSh {orders.reduce((sum, o) => sum + Number(o.total_amount), 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Purchase Orders</CardTitle>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Upload className="h-4 w-4 mr-2" />
                Submit Invoice
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Submit Invoice</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmitInvoice} className="space-y-4">
                <div>
                  <Label htmlFor="po">Purchase Order *</Label>
                  <select
                    id="po"
                    className="w-full p-2 border rounded"
                    value={selectedPO}
                    onChange={(e) => setSelectedPO(e.target.value)}
                    required
                  >
                    <option value="">Select PO</option>
                    {orders.filter(o => o.status === 'sent').map(order => (
                      <option key={order.id} value={order.id}>
                        {order.po_number} - KSh {order.total_amount.toLocaleString()}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="invoice_number">Invoice Number *</Label>
                  <Input
                    id="invoice_number"
                    value={invoiceForm.invoice_number}
                    onChange={(e) => setInvoiceForm({ ...invoiceForm, invoice_number: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="invoice_date">Invoice Date *</Label>
                  <Input
                    id="invoice_date"
                    type="date"
                    value={invoiceForm.invoice_date}
                    onChange={(e) => setInvoiceForm({ ...invoiceForm, invoice_date: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="due_date">Due Date</Label>
                  <Input
                    id="due_date"
                    type="date"
                    value={invoiceForm.due_date}
                    onChange={(e) => setInvoiceForm({ ...invoiceForm, due_date: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="amount">Amount *</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    value={invoiceForm.amount}
                    onChange={(e) => setInvoiceForm({ ...invoiceForm, amount: parseFloat(e.target.value) })}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={invoiceForm.notes}
                    onChange={(e) => setInvoiceForm({ ...invoiceForm, notes: e.target.value })}
                  />
                </div>
                <div className="flex justify-end space-x-2">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit">Submit Invoice</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO Number</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-medium">{order.po_number}</TableCell>
                  <TableCell>KSh {order.total_amount.toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge variant={getStatusColor(order.status)}>
                      {order.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{new Date(order.created_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">
                    {order.status === 'sent' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updatePOStatus(order.id, 'in_transit')}
                      >
                        Mark In Transit
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>My Invoices</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>PO Number</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((invoice) => {
                const po = orders.find(o => o.id === invoice.po_id);
                return (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium">{invoice.invoice_number}</TableCell>
                    <TableCell>{po?.po_number || 'N/A'}</TableCell>
                    <TableCell>KSh {invoice.amount.toLocaleString()}</TableCell>
                    <TableCell>{new Date(invoice.invoice_date).toLocaleDateString()}</TableCell>
                    <TableCell>
                      {invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : 'N/A'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusColor(invoice.status)}>
                        {invoice.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
