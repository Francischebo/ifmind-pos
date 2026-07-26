import { useState, useEffect } from 'react';
import { ApiService } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { RefreshCw, Plus, Search, RotateCcw, Package, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Checkbox } from '@/components/ui/checkbox';

interface ReturnItem {
  id: string;
  quantity: number;
  condition: string;
  sale_item: {
    id: string;
    quantity: number;
    unit_price: number;
    tax_rate: number;
    product: { name: string };
  };
}

interface Return {
  id: string;
  sale_id: string;
  reason: string;
  status: string;
  created_at: string;
  rejection_reason: string | null;
  pesapal_refund_logged: boolean;
  pesapal_refund_notes: string | null;
  sale?: Sale;
  requested_by?: any;
  approved_by?: any;
  items?: ReturnItem[];
}

interface SaleItem {
    id: string;
    quantity: number;
    unit_price: number;
    tax_rate: number;
    product: { name: string } | null;
}

interface Sale {
  id: string;
  total_amount: number;
  created_at: string;
  payment_method: string;
  items: SaleItem[];
}

export default function Returns() {
  const { user, role } = useAuth();
  const [returns, setReturns] = useState<Return[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Request Modal State
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [saleSearchTerm, setSaleSearchTerm] = useState('');
  const [salesSearchResults, setSalesSearchResults] = useState<Sale[]>([]);
  const [searchingSales, setSearchingSales] = useState(false);
  
  // selectedItems: { sale_item_id: quantity_to_return }
  const [selectedReturnItems, setSelectedReturnItems] = useState<Record<string, number>>({});
  
  // Approval Modal State
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [approvingReturn, setApprovingReturn] = useState<Return | null>(null);
  const [itemConditions, setItemConditions] = useState<Record<string, string>>({});
  const [refundMethod, setRefundMethod] = useState<string>('cash');

  const [formData, setFormData] = useState({
    reason: '',
    refund_method: 'cash',
  });

  useEffect(() => {
    loadReturns();
  }, []);

  const loadReturns = async () => {
    try {
      const data = await ApiService.get<Return[]>('/returns');
      setReturns(data || []);
    } catch (error: any) {
      toast.error('Error loading returns: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const searchSales = async () => {
    if (!saleSearchTerm.trim()) return;
    
    setSearchingSales(true);
    try {
      const allSales = await ApiService.get<Sale[]>('/sales');
      const filtered = allSales.filter(s => 
        s.id.toLowerCase().includes(saleSearchTerm.toLowerCase()) && 
        s.status !== 'voided'
      ).slice(0, 10);
      
      setSalesSearchResults(filtered);
    } catch (error: any) {
      toast.error('Error searching sales: ' + error.message);
    } finally {
      setSearchingSales(false);
    }
  };

  const handleSelectSale = (sale: Sale) => {
    setSelectedSale(sale);
    setSelectedReturnItems({});
  };

  const handleToggleItem = (itemId: string, maxQty: number, checked: boolean) => {
    const newItems = { ...selectedReturnItems };
    if (checked) {
      newItems[itemId] = maxQty;
    } else {
      delete newItems[itemId];
    }
    setSelectedReturnItems(newItems);
  };

  const handleUpdateItemQuantity = (itemId: string, maxQty: number, value: string) => {
    const parsed = parseInt(value, 10);
    if (!isNaN(parsed) && parsed > 0 && parsed <= maxQty) {
      setSelectedReturnItems({ ...selectedReturnItems, [itemId]: parsed });
    }
  };

  const calculateReturnAmount = () => {
    if (!selectedSale) return 0;
    let total = 0;
    for (const itemId in selectedReturnItems) {
        const saleItem = selectedSale.items.find(i => i.id === itemId);
        if (saleItem) {
            const qty = selectedReturnItems[itemId];
            const proportionalPrice = (saleItem.unit_price * qty); // assuming unit_price is base
            const tax = (saleItem.tax_rate / 100) * proportionalPrice;
            total += proportionalPrice + tax;
        }
    }
    return total;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedSale) {
      toast.error('Please select a sale to return');
      return;
    }

    const itemsPayload = Object.keys(selectedReturnItems).map(id => ({
        sale_item_id: id,
        quantity: selectedReturnItems[id]
    }));

    if (itemsPayload.length === 0) {
        toast.error('Please select at least one item to return');
        return;
    }

    try {
      await ApiService.post<any>('/returns/request', {
        sale_id: selectedSale.id,
        reason: formData.reason,
        items: itemsPayload
      });

      toast.success('Return request created successfully');
      setDialogOpen(false);
      setSelectedSale(null);
      setSalesSearchResults([]);
      setSaleSearchTerm('');
      setSelectedReturnItems({});
      setFormData({
        reason: '',
        refund_method: 'cash',
      });
      loadReturns();
    } catch (error: any) {
      toast.error(error.message || 'Error creating return request');
    }
  };

  const openApproveDialog = (ret: Return) => {
      setApprovingReturn(ret);
      const initialConditions: Record<string, string> = {};
      ret.items?.forEach(item => {
          initialConditions[item.id] = 'sellable';
      });
      setItemConditions(initialConditions);
      setApprovalDialogOpen(true);
  };

  const submitApproveReturn = async () => {
    if (!approvingReturn) return;
    try {
      const conditionsPayload = Object.keys(itemConditions).map(id => ({
          return_item_id: id,
          condition: itemConditions[id]
      }));

      const response: any = await ApiService.post('/admin/returns/approve/' + approvingReturn.id, {
          items_conditions: conditionsPayload,
          refund_method: refundMethod
      });
      
      toast.success(response.message || 'Return approved successfully');
      if (response.pesapalRefundRequired) {
        toast.info("Pesapal manual refund requested on Dashboard");
      }
      setApprovalDialogOpen(false);
      setApprovingReturn(null);
      loadReturns();
    } catch (error: any) {
      toast.error(error.message || 'Error approving return');
    }
  };

  const rejectReturn = async (id: string) => {
    const reason = prompt("Enter rejection reason (optional):");
    try {
      await ApiService.post('/admin/returns/reject/' + id, { rejection_reason: reason });
      toast.success('Return rejected');
      loadReturns();
    } catch (error: any) {
      toast.error(error.message || 'Error rejecting return');
    }
  };

  const filteredReturns = returns.filter(ret => 
    ret.sale_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    ret.reason.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'default';
      case 'pending': return 'secondary';
      case 'rejected': return 'destructive';
      default: return 'secondary';
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <RotateCcw className="h-7 w-7" />
            Returns & Refunds
          </h1>
          <p className="text-muted-foreground">Manage product returns and authorize refunds</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Request Return
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create Partial/Full Return Request</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Search Original Sale Invoice</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter sale UUID..."
                    value={saleSearchTerm}
                    onChange={(e) => setSaleSearchTerm(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), searchSales())}
                  />
                  <Button type="button" variant="outline" onClick={searchSales} disabled={searchingSales}>
                    <Search className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {salesSearchResults.length > 0 && (
                <div className="border rounded-lg max-h-48 overflow-y-auto">
                  {salesSearchResults.map((sale) => (
                    <div
                      key={sale.id}
                      onClick={() => handleSelectSale(sale)}
                      className={`p-3 cursor-pointer hover:bg-muted transition-colors border-b last:border-b-0 ${
                        selectedSale?.id === sale.id ? 'bg-primary/10 border-primary' : ''
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-mono text-sm">{sale.id.slice(0, 8)}...</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(sale.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <p className="font-semibold">
                          KSh {sale.total_amount.toLocaleString('en-KE', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {selectedSale && (
                <div className="space-y-4">
                    <div className="p-3 bg-muted rounded-lg border">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <Package className="h-4 w-4" />
                                <span className="font-semibold">Select Items to Return</span>
                            </div>
                        </div>
                        
                        <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                            {selectedSale.items?.map((item) => {
                                const isSelected = selectedReturnItems.hasOwnProperty(item.id);
                                return (
                                <div key={item.id} className="flex items-center justify-between p-2 bg-background border rounded-md">
                                    <div className="flex items-center gap-3">
                                        <Checkbox 
                                            checked={isSelected}
                                            onCheckedChange={(checked) => handleToggleItem(item.id, item.quantity, checked as boolean)}
                                        />
                                        <div>
                                            <p className="text-sm font-medium">{item.product?.name}</p>
                                            <p className="text-xs text-muted-foreground">Purchased: {item.quantity} | KSh {item.unit_price} each</p>
                                        </div>
                                    </div>
                                    {isSelected && (
                                        <div className="flex items-center gap-2">
                                            <Label className="text-xs">Return Qty:</Label>
                                            <Input 
                                                type="number" 
                                                className="w-20 h-8" 
                                                min="1" 
                                                max={item.quantity} 
                                                value={selectedReturnItems[item.id]}
                                                onChange={(e) => handleUpdateItemQuantity(item.id, item.quantity, e.target.value)}
                                            />
                                        </div>
                                    )}
                                </div>
                            )})}
                        </div>
                        <div className="mt-3 flex justify-between items-center text-sm font-bold pt-2 border-t">
                            <span>Estimated Refund:</span>
                            <span className="text-primary text-lg">KSh {calculateReturnAmount().toLocaleString('en-KE', { minimumFractionDigits: 2 })}</span>
                        </div>
                    </div>

                  <div>
                    <Label htmlFor="reason">Cashier Note / Reason</Label>
                    <Textarea
                      id="reason"
                      required
                      value={formData.reason}
                      onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                      placeholder="Explain exactly why the customer is returning these specific items..."
                      rows={2}
                    />
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!selectedSale || Object.keys(selectedReturnItems).length === 0}>
                  Submit Request to Manager
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle>Requested Returns</CardTitle>
            <div className="flex gap-2">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button variant="outline" size="icon" onClick={loadReturns}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sale ID</TableHead>
                  <TableHead>Requested By</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      Loading returns...
                    </TableCell>
                  </TableRow>
                ) : filteredReturns.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No returns found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredReturns.map((ret: Return) => (
                    <TableRow key={ret.id}>
                      <TableCell className="font-mono text-xs">
                        {ret.sale?.id.slice(0, 8)}...
                      </TableCell>
                      <TableCell className="capitalize">{ret.requested_by?.profile?.full_name || ret.requested_by?.email || 'System'}</TableCell>
                      <TableCell>
                          <Badge variant="outline">{ret.items?.length || 0} Items</Badge>
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-sm">
                        {ret.reason}
                        {ret.rejection_reason && <span className="text-xs text-red-500 block mt-1">Rejected: {ret.rejection_reason}</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusColor(ret.status)} className="capitalize">
                          {ret.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(ret.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        {ret.status === 'pending' && (role === 'admin' || role === 'supervisor' || role === 'manager') && (
                          <div className="flex gap-1">
                            <Button size="sm" onClick={() => openApproveDialog(ret)}>
                              Review
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => rejectReturn(ret.id)}>
                              Reject
                            </Button>
                          </div>
                        )}
                        {ret.status === 'pending' && role === 'cashier' && (
                           <span className="text-xs text-muted-foreground italic">Awaiting Mgmt</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Admin Approval & Condition Triage Modal */}
      <Dialog open={approvalDialogOpen} onOpenChange={setApprovalDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Management Return Approval</DialogTitle>
          </DialogHeader>
          {approvingReturn && (
            <div className="space-y-4">
                <div className="bg-amber-50 dark:bg-amber-950/20 p-4 rounded-md border border-amber-200 dark:border-amber-900 flex gap-3 items-start">
                    <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
                    <div>
                        <p className="text-sm font-semibold text-amber-800 dark:text-amber-400">Inventory Triage Required</p>
                        <p className="text-xs text-amber-700 dark:text-amber-500 mt-1">
                            You must classify the returning physical condition of each item. 
                            <br/>- <b>Sellable:</b> Returns to warehouse stock automatically.
                            <br/>- <b>Damaged:</b> Writes off as inventory shrinkage financially.
                        </p>
                    </div>
                </div>

                <div className="space-y-3 max-h-64 overflow-y-auto">
                    {approvingReturn.items?.map(it => (
                        <div key={it.id} className="p-3 border rounded-lg bg-card flex items-center justify-between">
                            <div>
                                <p className="font-medium text-sm">{it.sale_item?.product?.name}</p>
                                <p className="text-xs text-muted-foreground">Qty: {it.quantity} returned</p>
                            </div>
                            <div className="w-40">
                                <Label className="text-xs mb-1 block">Condition Flag</Label>
                                <Select 
                                    value={itemConditions[it.id] || 'sellable'} 
                                    onValueChange={(val) => setItemConditions({...itemConditions, [it.id]: val})}
                                >
                                    <SelectTrigger className="h-8 text-sm">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="sellable">✅ Sellable Stock</SelectItem>
                                        <SelectItem value="damaged">💥 Damaged / Spoilage</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="bg-muted p-3 rounded-md border mt-2">
                    <Label className="text-sm font-semibold mb-2 block">Refund Method</Label>
                    <Select value={refundMethod} onValueChange={setRefundMethod}>
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="cash">💵 Cash (From Drawer)</SelectItem>
                            <SelectItem value="mpesa">📱 M-Pesa / Card (Manual via Terminal)</SelectItem>
                            <SelectItem value="store_credit">💳 Issue Store Credit</SelectItem>
                        </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-2">
                        Note: Store Credit will be tied to the customer profile. If it was a walk-in, a Store Credit Barcode receipt should be provided.
                    </p>
                </div>

                <div className="bg-muted p-3 rounded-md text-sm mt-2">
                    <strong>Cashier Note:</strong> {approvingReturn.reason}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => setApprovalDialogOpen(false)}>Cancel</Button>
                    <Button onClick={submitApproveReturn}>Approve & Finalize Ledger</Button>
                </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
