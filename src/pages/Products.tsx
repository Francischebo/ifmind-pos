import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiService } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, AlertCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface Product {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  unit_cost: number;
  retail_price: number;
  stock_on_hand: number;
  reorder_level: number;
  is_parent?: boolean;
  variant_attributes?: Record<string, string>;
}

export default function Products() {
  const navigate = useNavigate();
  const { userRole } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProducts();
  }, []);

  useEffect(() => {
    if (searchTerm) {
      const filtered = products.filter(
        (p) =>
          p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
          p.barcode?.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredProducts(filtered);
    } else {
      setFilteredProducts(products);
    }
  }, [searchTerm, products]);

  const loadProducts = async () => {
    try {
      const data = await ApiService.get<Product[]>('/products');
      
      // Filter out parent container products since they don't hold physical stock, we only want sellable items
      const sellableProducts = (data || []).filter(p => !p.is_parent);
      
      const sortedData = sellableProducts.sort((a, b) => a.name.localeCompare(b.name));
      setProducts(sortedData);
      setFilteredProducts(sortedData);
    } catch (error) {
      console.error('Error loading products:', error);
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
    <div className="p-2 sm:p-4 md:p-6 space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Products</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Manage your product catalog</p>
        </div>
        {userRole === 'admin' && (
          <Button onClick={() => navigate('/products/new')}>
            <Plus className="h-4 w-4 mr-2" />
            Add Product
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg sm:text-xl">Product Catalog</CardTitle>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, SKU, or barcode..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 text-sm sm:text-base"
            />
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs sm:text-sm">SKU</TableHead>
                <TableHead className="hidden md:table-cell text-xs sm:text-sm">Barcode</TableHead>
                <TableHead className="text-xs sm:text-sm">Name</TableHead>
                <TableHead className="text-right text-xs sm:text-sm">Cost</TableHead>
                <TableHead className="text-right text-xs sm:text-sm">Price</TableHead>
                <TableHead className="text-right text-xs sm:text-sm">Stock</TableHead>
                <TableHead className="text-xs sm:text-sm">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts.map((product) => {
                const isLowStock = product.stock_on_hand <= product.reorder_level;
                return (
                  <TableRow key={product.id}>
                    <TableCell className="font-medium text-xs sm:text-sm">{product.sku}</TableCell>
                    <TableCell className="hidden md:table-cell text-xs sm:text-sm">{product.barcode || '-'}</TableCell>
                    <TableCell className="text-xs sm:text-sm">
                      {product.name}
                      {product.variant_attributes && (
                        <span className="ml-2 text-muted-foreground text-xs">
                          ({Object.entries(product.variant_attributes).map(([k, v]) => `${v}`).join(' / ')})
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-xs sm:text-sm">
                      {product.unit_cost.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </TableCell>
                    <TableCell className="text-right text-xs sm:text-sm">
                      {product.retail_price.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </TableCell>
                    <TableCell className="text-right text-xs sm:text-sm">{product.stock_on_hand}</TableCell>
                    <TableCell>
                      {isLowStock ? (
                        <Badge variant="destructive" className="gap-1">
                          <AlertCircle className="h-3 w-3" />
                          Low Stock
                        </Badge>
                      ) : (
                        <Badge variant="default" className="bg-accent">In Stock</Badge>
                      )}
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
