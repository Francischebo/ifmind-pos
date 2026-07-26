import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Plus, FileText, Search, Eye, CreditCard, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { format } from 'date-fns';

interface Invoice {
  id: string;
  invoice_number: string;
  customer_id: string | null;
  sale_id: string | null;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total_amount: number;
  paid_amount: number;
  balance_due: number;
  status: string;
  due_date: string | null;
  issued_at: string | null;
  created_at: string;
  customers: { name: string; phone: string } | null;
}

interface InvoicePayment {
  id: string;
  amount: number;
  payment_method: string;
  reference_number: string | null;
  created_at: string;
}

export default function Invoices() {
  const { user, role } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [payments, setPayments] = useState<InvoicePayment[]>([]);
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    payment_method: 'cash',
    reference_number: '',
  });

  useEffect(() => {
    loadInvoices();
  }, [statusFilter]);

  const loadInvoices = async () => {
    setLoading(true);
    let query = supabase
      .from('invoices')
      .select('*, customers(name, phone)')
      .order('created_at', { ascending: false });

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    const { data, error } = await query;
    if (error) {
      toast.error('Failed to load invoices');
    } else {
      setInvoices(data || []);
    }
    setLoading(false);
  };

  const loadPayments = async (invoiceId: string) => {
    const { data } = await supabase
      .from('invoice_payments')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('created_at', { ascending: false });
    setPayments(data || []);
  };

  const handleViewInvoice = async (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    await loadPayments(invoice.id);
  };

  const handleRecordPayment = async () => {
    if (!selectedInvoice || !user?.id) return;

    const amount = parseFloat(paymentForm.amount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    if (amount > selectedInvoice.balance_due) {
      toast.error('Payment amount exceeds balance due');
      return;
    }

    const { error } = await supabase.from('invoice_payments').insert({
      invoice_id: selectedInvoice.id,
      amount,
      payment_method: paymentForm.payment_method,
      reference_number: paymentForm.reference_number || null,
      received_by: user.id,
    });

    if (error) {
      toast.error('Failed to record payment: ' + error.message);
    } else {
      toast.success('Payment recorded successfully');
      setPaymentDialogOpen(false);
      setPaymentForm({ amount: '', payment_method: 'cash', reference_number: '' });
      loadInvoices();
      await loadPayments(selectedInvoice.id);
      // Refresh selected invoice
      const { data } = await supabase
        .from('invoices')
        .select('*, customers(name, phone)')
        .eq('id', selectedInvoice.id)
        .single();
      if (data) setSelectedInvoice(data);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'secondary';
      case 'issued': return 'default';
      case 'partially_paid': return 'outline';
      case 'paid': return 'default';
      case 'cancelled': return 'destructive';
      case 'void': return 'destructive';
      default: return 'default';
    }
  };

  const filteredInvoices = invoices.filter(
    (inv) =>
      inv.invoice_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.customers?.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <FileText className="h-8 w-8 text-primary" />
            Invoices
          </h1>
          <p className="text-muted-foreground">Manage sales invoices and payments</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by invoice number or customer..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="issued">Issued</SelectItem>
                <SelectItem value="partially_paid">Partially Paid</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Paid</TableHead>
                <TableHead>Balance</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">
                    Loading invoices...
                  </TableCell>
                </TableRow>
              ) : filteredInvoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No invoices found
                  </TableCell>
                </TableRow>
              ) : (
                filteredInvoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-mono font-medium">
                      {invoice.invoice_number}
                    </TableCell>
                    <TableCell>{invoice.customers?.name || 'Walk-in'}</TableCell>
                    <TableCell>
                      KSh {invoice.total_amount.toLocaleString('en-KE', { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-green-600">
                      KSh {invoice.paid_amount.toLocaleString('en-KE', { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className={invoice.balance_due > 0 ? 'text-destructive font-medium' : ''}>
                      KSh {invoice.balance_due.toLocaleString('en-KE', { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusColor(invoice.status)} className="capitalize">
                        {invoice.status.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {format(new Date(invoice.created_at), 'dd/MM/yyyy')}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleViewInvoice(invoice)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {invoice.balance_due > 0 && invoice.status !== 'cancelled' && (
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

      {/* Invoice Detail Dialog */}
      <Dialog open={!!selectedInvoice && !paymentDialogOpen} onOpenChange={() => setSelectedInvoice(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Invoice {selectedInvoice?.invoice_number}
            </DialogTitle>
          </DialogHeader>
          {selectedInvoice && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Customer</p>
                  <p className="font-medium">{selectedInvoice.customers?.name || 'Walk-in'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge variant={getStatusColor(selectedInvoice.status)} className="capitalize">
                    {selectedInvoice.status.replace('_', ' ')}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Amount</p>
                  <p className="font-bold text-lg">
                    KSh {selectedInvoice.total_amount.toLocaleString('en-KE', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Balance Due</p>
                  <p className={`font-bold text-lg ${selectedInvoice.balance_due > 0 ? 'text-destructive' : 'text-green-600'}`}>
                    KSh {selectedInvoice.balance_due.toLocaleString('en-KE', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-2">Payment History</h4>
                {payments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No payments recorded</p>
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
                      {payments.map((payment) => (
                        <TableRow key={payment.id}>
                          <TableCell>{format(new Date(payment.created_at), 'dd/MM/yyyy HH:mm')}</TableCell>
                          <TableCell className="text-green-600 font-medium">
                            KSh {payment.amount.toLocaleString('en-KE', { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="capitalize">{payment.payment_method}</TableCell>
                          <TableCell>{payment.reference_number || '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => window.print()}>
                  <Printer className="h-4 w-4 mr-2" />
                  Print
                </Button>
                {selectedInvoice.balance_due > 0 && selectedInvoice.status !== 'cancelled' && (
                  <Button onClick={() => setPaymentDialogOpen(true)}>
                    <CreditCard className="h-4 w-4 mr-2" />
                    Record Payment
                  </Button>
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
                  KSh {selectedInvoice.balance_due.toLocaleString('en-KE', { minimumFractionDigits: 2 })}
                </p>
              </div>

              <div>
                <Label htmlFor="amount">Payment Amount (KSh)</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                  placeholder="Enter amount"
                />
              </div>

              <div>
                <Label htmlFor="method">Payment Method</Label>
                <Select
                  value={paymentForm.payment_method}
                  onValueChange={(val) => setPaymentForm({ ...paymentForm, payment_method: val })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="mpesa">M-Pesa</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="reference">Reference Number</Label>
                <Input
                  id="reference"
                  value={paymentForm.reference_number}
                  onChange={(e) => setPaymentForm({ ...paymentForm, reference_number: e.target.value })}
                  placeholder="M-Pesa code, cheque #, etc."
                />
              </div>

              <div className="flex gap-2 pt-4">
                <Button variant="outline" onClick={() => setPaymentDialogOpen(false)} className="flex-1">
                  Cancel
                </Button>
                <Button onClick={handleRecordPayment} className="flex-1">
                  Record Payment
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
