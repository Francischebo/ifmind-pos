import { useState, useEffect } from 'react';
import { ApiService } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Package, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface PurchaseOrder {
  id: string;
  po_number: string;
  vendor_id: string;
  status: string;
  total_amount: number;
  created_at: string;
  vendors?: { name: string } | null;
  vendor?: { name: string } | null;
}

export default function PurchaseOrders() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    try {
      const data = await ApiService.get<PurchaseOrder[]>('/purchase-orders');
      setOrders(data || []);
    } catch (e: any) {
      toast.error('Failed to load purchase orders: ' + e.message);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'secondary';
      case 'sent': return 'default';
      case 'partially_received': return 'outline';
      case 'received': return 'default';
      case 'cancelled': return 'destructive';
      default: return 'default';
    }
  };

  const updateStatus = async (id: string, newStatus: string) => {
    try {
      await ApiService.put(`/purchase-orders/${id}/status`, { status: newStatus });
      toast.success(`PO ${newStatus}`);
      
      if (newStatus === 'sent') {
        sendPOEmail(id); // Supabase edge functions still handled via frontend or we keep the mock? We can leave sendPOEmail as is for now if it invokes a supabase function directly or we update it.
      }
      loadOrders();
    } catch (error: any) {
      toast.error(error.message || 'Error updating status');
    }
  };

  const sendPOEmail = async (poId: string) => {
    try {
      // Get PO details with items
      const po: any = await ApiService.get(`/purchase-orders/${poId}`);

      if (!po || (!po.vendor?.email && !po.vendors?.email)) {
        toast.error('Vendor email not found');
        return;
      }

      const itemsForEmail = po.items.map((item: any) => ({
        product_name: item.product?.name || 'Unknown',
        quantity: item.quantity,
        unit_cost: item.unit_cost,
      }));

      // Mock email sending until backend implements it
      console.log('Sending PO Email (Mock) with data:', {
        poId: po.id,
        vendorEmail: po.vendor?.email || po.vendors?.email,
        vendorName: po.vendor?.name || po.vendors?.name,
        poNumber: po.po_number,
        totalAmount: po.total_amount,
        items: itemsForEmail,
      });
      // Await a fake delay to simulate network call
      await new Promise(resolve => setTimeout(resolve, 500));
      toast.success('Purchase order sent to vendor via email');
    } catch (error: any) {
      console.error('Error sending PO email:', error);
      toast.error('Failed to send email to vendor');
    }
  };

  const isAdmin = role === 'admin';

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Purchase Orders</h1>
          <p className="text-muted-foreground">Manage inventory procurement</p>
        </div>
        {isAdmin && (
          <Button onClick={() => navigate('/purchase-orders/new')}>
            <Plus className="h-4 w-4 mr-2" />
            New PO
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Purchase Orders</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO Number</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Total Amount</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-medium">{order.po_number}</TableCell>
                  <TableCell>{order.vendor?.name || order.vendors?.name || 'N/A'}</TableCell>
                  <TableCell>
                    <Badge variant={getStatusColor(order.status)}>
                      {order.status}
                    </Badge>
                  </TableCell>
                  <TableCell>KSh {order.total_amount.toLocaleString('en-KE', { minimumFractionDigits: 2 })}</TableCell>
                  <TableCell>{new Date(order.created_at).toLocaleDateString('en-KE')}</TableCell>
                  <TableCell className="text-right space-x-2">
                    {isAdmin && order.status === 'draft' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateStatus(order.id, 'sent')}
                      >
                        Send
                      </Button>
                    )}
                    {isAdmin && order.status === 'sent' && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigate(`/purchase-orders/${order.id}/receive`)}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          Receive
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => updateStatus(order.id, 'cancelled')}
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                    {isAdmin && order.status === 'partially_received' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate(`/purchase-orders/${order.id}/receive`)}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1" />
                        Receive More
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
