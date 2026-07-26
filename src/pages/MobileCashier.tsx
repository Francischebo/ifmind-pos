import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { Scan, Plus, Minus, Trash2, ShoppingCart, Check } from 'lucide-react';
import { BarcodeScanner } from '@/components/BarcodeScanner';

interface Product {
  id: string;
  name: string;
  retail_price: number;
  stock_on_hand: number;
  barcode: string | null;
}

interface CartItem {
  product: Product;
  quantity: number;
}

export default function MobileCashier() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [activeShift, setActiveShift] = useState<string | null>(null);

  useEffect(() => {
    loadProducts();
    checkActiveShift();
  }, []);

  const checkActiveShift = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('shifts')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();
    setActiveShift(data?.id || null);
  };

  const loadProducts = async () => {
    const { data } = await supabase
      .from('products')
      .select('*')
      .gt('stock_on_hand', 0)
      .order('name');
    setProducts(data || []);
  };

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.barcode?.includes(searchTerm)
  );

  const handleBarcodeDetected = (barcode: string) => {
    const product = products.find(p => p.barcode === barcode);
    if (product) {
      addToCart(product);
      setShowScanner(false);
      toast.success(`Added ${product.name} to cart`);
    } else {
      toast.error('Product not found');
    }
  };

  const addToCart = (product: Product) => {
    const existingItem = cart.find(item => item.product.id === product.id);
    if (existingItem) {
      if (existingItem.quantity >= product.stock_on_hand) {
        toast.error('Insufficient stock');
        return;
      }
      setCart(cart.map(item =>
        item.product.id === product.id
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ));
    } else {
      setCart([...cart, { product, quantity: 1 }]);
    }
  };

  const updateQuantity = (productId: string, change: number) => {
    setCart(cart.map(item => {
      if (item.product.id === productId) {
        const newQuantity = item.quantity + change;
        if (newQuantity <= 0 || newQuantity > item.product.stock_on_hand) {
          return item;
        }
        return { ...item, quantity: newQuantity };
      }
      return item;
    }));
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter(item => item.product.id !== productId));
  };

  const getTotal = () => {
    return cart.reduce((sum, item) => sum + (item.product.retail_price * item.quantity), 0);
  };

  const handleCheckout = async () => {
    if (cart.length === 0) {
      toast.error('Cart is empty');
      return;
    }

    if (!activeShift) {
      toast.error('No active shift. Please start a shift first.');
      return;
    }

    try {
      const subtotal = getTotal();
      const taxRate = 0.16;
      const taxAmount = subtotal * taxRate;
      const total = subtotal + taxAmount;

      const { data: sale, error: saleError } = await supabase
        .from('sales')
        .insert({
          cashier_id: user!.id,
          subtotal,
          tax_amount: taxAmount,
          total_amount: total,
          payment_method: 'cash',
          status: 'completed',
        })
        .select()
        .single();

      if (saleError) throw saleError;

      const { error: itemsError } = await supabase.from('sale_items').insert(
        cart.map(item => ({
          sale_id: sale.id,
          product_id: item.product.id,
          quantity: item.quantity,
          unit_price: item.product.retail_price,
          tax_rate: taxRate,
          line_total: item.product.retail_price * item.quantity,
        }))
      );

      if (itemsError) throw itemsError;

      // Update stock
      const stockPromises = cart.map(item =>
        supabase.rpc('decrement_stock', {
          product_id: item.product.id,
          quantity_change: item.quantity
        })
      );
      await Promise.all(stockPromises);

      toast.success('Sale completed!');
      setCart([]);
      loadProducts();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 pb-24">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Quick Sale</h1>
        <p className="text-muted-foreground">Tap products to add to cart</p>
      </div>

      {/* Search and Scanner */}
      <div className="mb-6 space-y-3">
        <Input
          placeholder="Search products..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="h-14 text-lg"
        />
        <Button 
          onClick={() => setShowScanner(!showScanner)} 
          variant="outline" 
          className="w-full h-14 text-lg"
        >
          <Scan className="h-6 w-6 mr-2" />
          {showScanner ? 'Close Scanner' : 'Scan Barcode'}
        </Button>
      </div>

      {showScanner && (
        <div className="mb-6">
          <BarcodeScanner onScan={handleBarcodeDetected} />
        </div>
      )}

      {/* Product Grid */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {filteredProducts.slice(0, 20).map((product) => (
          <Card
            key={product.id}
            className="cursor-pointer active:scale-95 transition-transform"
            onClick={() => addToCart(product)}
          >
            <CardContent className="p-4">
              <h3 className="font-semibold text-lg mb-2 line-clamp-2">{product.name}</h3>
              <div className="space-y-2">
                <p className="text-2xl font-bold text-primary">
                  KSh {product.retail_price.toLocaleString('en-KE')}
                </p>
                <Badge variant={product.stock_on_hand > 10 ? 'default' : 'destructive'}>
                  Stock: {product.stock_on_hand}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Floating Cart */}
      {cart.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-background border-t shadow-lg">
          <div className="p-4 space-y-3 max-h-[50vh] overflow-y-auto">
            {cart.map((item) => (
              <div key={item.product.id} className="flex items-center gap-3 bg-muted/50 p-3 rounded-lg">
                <div className="flex-1">
                  <p className="font-semibold">{item.product.name}</p>
                  <p className="text-sm text-muted-foreground">
                    KSh {item.product.retail_price.toLocaleString('en-KE')} × {item.quantity}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => updateQuantity(item.product.id, -1)}
                    className="h-10 w-10"
                  >
                    <Minus className="h-5 w-5" />
                  </Button>
                  <span className="text-xl font-bold w-12 text-center">{item.quantity}</span>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => updateQuantity(item.product.id, 1)}
                    className="h-10 w-10"
                  >
                    <Plus className="h-5 w-5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="destructive"
                    onClick={() => removeFromCart(item.product.id)}
                    className="h-10 w-10"
                  >
                    <Trash2 className="h-5 w-5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
          
          <div className="p-4 bg-primary text-primary-foreground">
            <div className="flex justify-between items-center mb-3">
              <span className="text-lg">Total:</span>
              <span className="text-3xl font-bold">
                KSh {getTotal().toLocaleString('en-KE', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <Button
              onClick={handleCheckout}
              className="w-full h-14 text-lg bg-background text-foreground hover:bg-background/90"
            >
              <Check className="h-6 w-6 mr-2" />
              Complete Sale ({cart.length} items)
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
