import { validatePhoneNumber, normalizeKenyanPhoneNumber, sanitizeInput, secureApiCall, apiRateLimiter } from '@/lib/security';
import { ApiService } from '@/lib/api';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, Users, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  total_purchases: number;
  purchase_count: number;
  is_frequent: boolean;
  credit_limit: number;
  credit_balance: number;
}

export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [deleteCustomerId, setDeleteCustomerId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
  });

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    try {
      const data = await ApiService.get<Customer[]>('/customers');
      setCustomers(data || []);
    } catch (error: any) {
      toast.error('Failed to load customers: ' + error.message);
    }
  };

  const filteredCustomers = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.phone.includes(searchTerm)
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate inputs
    const sanitizedName = sanitizeInput(formData.name);
    const sanitizedPhone = formData.phone.replace(/\s+/g, '');
    const sanitizedEmail = formData.email ? sanitizeInput(formData.email) : '';

    if (!sanitizedName || sanitizedName.length < 2) {
      toast.error('Name must be at least 2 characters long');
      return;
    }

    if (!validatePhoneNumber(sanitizedPhone)) {
      toast.error('Please enter a valid Kenyan phone number (e.g. 0712345678 or 254712345678)');
      return;
    }

    if (sanitizedEmail && !sanitizedEmail.includes('@')) {
      toast.error('Please enter a valid email address');
      return;
    }

    try {
      const normalizedPhone = normalizeKenyanPhoneNumber(sanitizedPhone);

      if (!normalizedPhone) {
        toast.error('Please enter a valid Kenyan phone number (e.g. 0712345678 or 254712345678)');
        return;
      }

      const customerData = {
        name: sanitizedName,
        phone: normalizedPhone,
        email: sanitizedEmail || null,
      };

      await secureApiCall(async () => {
        if (editingCustomer) {
          await ApiService.put(`/customers/${editingCustomer.id}`, customerData);
          toast.success('Customer updated successfully');
        } else {
          await ApiService.post('/customers', customerData);
          toast.success('Customer added successfully');
        }
      }, apiRateLimiter, 'customer_operation');

      setIsDialogOpen(false);
      setFormData({ name: '', phone: '', email: '' });
      setEditingCustomer(null);
      loadCustomers();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setFormData({
      name: customer.name,
      phone: customer.phone,
      email: customer.email || '',
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteCustomerId) return;
    try {
      await ApiService.delete(`/customers/${deleteCustomerId}`);
      toast.success('Customer deleted');
      loadCustomers();
    } catch (error: any) {
      toast.error(error.message);
    }
    setDeleteCustomerId(null);
  };

  return (
    <div className="p-2 sm:p-4 md:p-6 space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Customers</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Manage your customer database</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => { setEditingCustomer(null); setFormData({ name: '', phone: '', email: '' }); }}>
              <Plus className="h-4 w-4 mr-2" />
              Add Customer
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingCustomer ? 'Edit' : 'Add'} Customer</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="phone">Phone *</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+254 700 000000"
                  required
                />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
              <Button type="submit" className="w-full">
                {editingCustomer ? 'Update' : 'Add'} Customer
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search customers by name or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs sm:text-sm">Name</TableHead>
                <TableHead className="text-xs sm:text-sm">Phone</TableHead>
                <TableHead className="hidden md:table-cell text-xs sm:text-sm">Email</TableHead>
                <TableHead className="text-xs sm:text-sm">Purchases</TableHead>
                <TableHead className="hidden lg:table-cell text-xs sm:text-sm">Total Spent</TableHead>
                <TableHead className="hidden xl:table-cell text-xs sm:text-sm">Credit Balance</TableHead>
                <TableHead className="hidden sm:table-cell text-xs sm:text-sm">Status</TableHead>
                <TableHead className="text-right text-xs sm:text-sm">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCustomers.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell className="font-medium text-xs sm:text-sm">{customer.name}</TableCell>
                  <TableCell className="text-xs sm:text-sm">{customer.phone}</TableCell>
                  <TableCell className="hidden md:table-cell text-xs sm:text-sm">{customer.email || '-'}</TableCell>
                  <TableCell className="text-xs sm:text-sm">{customer.purchase_count}</TableCell>
                  <TableCell className="hidden lg:table-cell text-xs sm:text-sm">KSh {customer.total_purchases.toLocaleString('en-KE', { minimumFractionDigits: 0 })}</TableCell>
                  <TableCell className="hidden xl:table-cell text-xs sm:text-sm">
                    {customer.credit_balance > 0 ? (
                      <Badge variant="destructive">KSh {customer.credit_balance.toLocaleString('en-KE')}</Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {customer.is_frequent && (
                      <Badge variant="secondary">
                        <Users className="h-3 w-3 mr-1" />
                        Frequent
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(customer)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteCustomerId(customer.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteCustomerId} onOpenChange={(open) => !open && setDeleteCustomerId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Customer</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this customer? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
