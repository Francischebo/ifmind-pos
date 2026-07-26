import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiService } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { BarcodeGenerator } from '@/components/BarcodeGenerator';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

interface TaxClass {
  id: string;
  name: string;
  rate: number;
  is_default: boolean;
}

interface VariantOption {
  name: string;
  values: string; // comma separated
}

export default function NewProduct() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showBarcode, setShowBarcode] = useState(false);
  const [createdProduct, setCreatedProduct] = useState<any>(null);
  
  const [taxClasses, setTaxClasses] = useState<TaxClass[]>([]);
  const [hasVariants, setHasVariants] = useState(false);
  const [options, setOptions] = useState<VariantOption[]>([{ name: '', values: '' }]);
  const [generatedVariants, setGeneratedVariants] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    sku: '',
    barcode: '',
    name: '',
    unit_cost: '',
    retail_price: '',
    stock_on_hand: '0',
    reorder_level: '10',
    tax_class_id: '',
  });

  useEffect(() => {
    loadTaxClasses();
  }, []);

  const loadTaxClasses = async () => {
    try {
      const data = await ApiService.get<TaxClass[]>('/taxes');
      setTaxClasses(data || []);
      const defaultTax = data?.find(t => t.is_default);
      if (defaultTax) {
        setFormData(prev => ({ ...prev, tax_class_id: defaultTax.id }));
      } else if (data && data.length > 0) {
        setFormData(prev => ({ ...prev, tax_class_id: data[0].id }));
      }
    } catch (error) {
      console.error('Error loading taxes:', error);
    }
  };

  // Generate permutations when options change
  useEffect(() => {
    if (!hasVariants) return;

    // Filter out incomplete options
    const validOptions = options.filter(o => o.name.trim() && o.values.trim());
    if (validOptions.length === 0) {
      setGeneratedVariants([]);
      return;
    }

    const arraysToCombine = validOptions.map(opt => 
      opt.values.split(',').map(v => v.trim()).filter(v => v).map(v => ({ [opt.name.trim()]: v }))
    );

    // Cartesian product
    const combinations = arraysToCombine.reduce((a, b) => 
      a.flatMap(d => b.map(e => ({ ...d, ...e })))
    );

    const variants = combinations.map(attrs => {
      const attrValuesString = Object.values(attrs).join('-');
      return {
        variant_attributes: attrs,
        sku: formData.sku ? `${formData.sku}-${attrValuesString.toUpperCase()}` : '',
        barcode: '',
        retail_price: formData.retail_price,
        unit_cost: formData.unit_cost,
        stock_on_hand: '0',
      };
    });

    setGeneratedVariants(variants);
  }, [options, formData.sku, formData.retail_price, formData.unit_cost, hasVariants]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const productData: any = {
        name: formData.name,
        sku: formData.sku,
        barcode: formData.barcode || formData.sku,
        unit_cost: parseFloat(formData.unit_cost || '0'),
        retail_price: parseFloat(formData.retail_price || '0'),
        stock_on_hand: parseInt(formData.stock_on_hand || '0'),
        reorder_level: parseInt(formData.reorder_level || '10'),
        tax_class_id: formData.tax_class_id || null,
      };

      if (hasVariants && generatedVariants.length > 0) {
        productData.variants = generatedVariants.map(v => ({
          ...v,
          unit_cost: parseFloat(v.unit_cost || '0'),
          retail_price: parseFloat(v.retail_price || '0'),
          stock_on_hand: parseInt(v.stock_on_hand || '0'),
          barcode: v.barcode || v.sku
        }));
      }

      const response = await ApiService.post('/products', productData);
      
      setCreatedProduct(response.parent || response); // Use parent if variants created
      setShowBarcode(true);
      toast.success('Product created successfully');
    } catch (error: any) {
      toast.error(error.message || 'Error creating product');
    } finally {
      setLoading(false);
    }
  };

  const handleVariantChange = (index: number, field: string, value: string) => {
    const updated = [...generatedVariants];
    updated[index] = { ...updated[index], [field]: value };
    setGeneratedVariants(updated);
  };

  if (showBarcode && createdProduct) {
    return (
      <div className="p-2 sm:p-4 md:p-6 space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/products')} className="self-start">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Products
          </Button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Product Created</h1>
            <p className="text-sm sm:text-base text-muted-foreground">Print labels or add another product</p>
          </div>
        </div>

        <div className="max-w-2xl">
          <BarcodeGenerator
            value={createdProduct.barcode}
            productName={createdProduct.name}
            price={createdProduct.retail_price}
            sku={createdProduct.sku}
          />
        </div>

        <div className="flex gap-2">
          <Button onClick={() => {
            setShowBarcode(false);
            setCreatedProduct(null);
            setFormData({
              sku: '', barcode: '', name: '', unit_cost: '', retail_price: '', stock_on_hand: '0', reorder_level: '10', tax_class_id: taxClasses.find(t => t.is_default)?.id || ''
            });
            setHasVariants(false);
            setOptions([{ name: '', values: '' }]);
            setGeneratedVariants([]);
          }}>
            Add Another Product
          </Button>
          <Button variant="outline" onClick={() => navigate('/products')}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-2 sm:p-4 md:p-6 space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/products')} className="self-start">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">New Product</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Add a new product to inventory</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle>Basic Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Product Name *</Label>
                <Input id="name" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tax_class">Tax Class</Label>
                <Select value={formData.tax_class_id} onValueChange={(val) => setFormData({ ...formData, tax_class_id: val })}>
                  <SelectTrigger id="tax_class">
                    <SelectValue placeholder="Select Tax Class" />
                  </SelectTrigger>
                  <SelectContent>
                    {taxClasses.map(tax => (
                      <SelectItem key={tax.id} value={tax.id}>{tax.name} ({Number(tax.rate)}%)</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="sku">Parent SKU *</Label>
                <Input id="sku" required value={formData.sku} onChange={(e) => setFormData({ ...formData, sku: e.target.value })} />
              </div>
              {!hasVariants && (
                <div className="space-y-2">
                  <Label htmlFor="barcode">Barcode</Label>
                  <Input id="barcode" value={formData.barcode} onChange={(e) => setFormData({ ...formData, barcode: e.target.value })} />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="retail_price">Base Retail Price (KSh) *</Label>
                <Input id="retail_price" type="number" step="0.01" min="0" required value={formData.retail_price} onChange={(e) => setFormData({ ...formData, retail_price: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="unit_cost">Base Unit Cost (KSh) *</Label>
                <Input id="unit_cost" type="number" step="0.01" min="0" required value={formData.unit_cost} onChange={(e) => setFormData({ ...formData, unit_cost: e.target.value })} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="space-y-0.5">
              <CardTitle>Product Variants</CardTitle>
              <CardDescription>Does this product come in multiple options like size or color?</CardDescription>
            </div>
            <Switch checked={hasVariants} onCheckedChange={setHasVariants} />
          </CardHeader>
          {hasVariants && (
            <CardContent className="space-y-4 pt-4 border-t">
              <div className="space-y-3">
                {options.map((opt, i) => (
                  <div key={i} className="flex gap-2 items-end">
                    <div className="flex-1 space-y-1">
                      <Label>Option Name</Label>
                      <Input placeholder="e.g. Size" value={opt.name} onChange={(e) => {
                        const newOpts = [...options]; newOpts[i].name = e.target.value; setOptions(newOpts);
                      }} />
                    </div>
                    <div className="flex-[2] space-y-1">
                      <Label>Option Values (comma separated)</Label>
                      <Input placeholder="e.g. Small, Medium, Large" value={opt.values} onChange={(e) => {
                        const newOpts = [...options]; newOpts[i].values = e.target.value; setOptions(newOpts);
                      }} />
                    </div>
                    {options.length > 1 && (
                      <Button variant="ghost" type="button" size="icon" onClick={() => setOptions(options.filter((_, idx) => idx !== i))}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => setOptions([...options, { name: '', values: '' }])}>
                  <Plus className="h-4 w-4 mr-2" /> Add another option
                </Button>
              </div>

              {generatedVariants.length > 0 && (
                <div className="mt-6 border rounded-md overflow-hidden">
                  <div className="grid grid-cols-12 bg-muted p-2 text-sm font-medium">
                    <div className="col-span-3">Variant</div>
                    <div className="col-span-3">SKU</div>
                    <div className="col-span-2">Price</div>
                    <div className="col-span-2">Cost</div>
                    <div className="col-span-2">Stock</div>
                  </div>
                  <div className="divide-y max-h-[300px] overflow-y-auto">
                    {generatedVariants.map((v, i) => (
                      <div key={i} className="grid grid-cols-12 p-2 gap-2 items-center">
                        <div className="col-span-3 text-sm">{Object.values(v.variant_attributes).join(' / ')}</div>
                        <div className="col-span-3"><Input className="h-8" value={v.sku} onChange={e => handleVariantChange(i, 'sku', e.target.value)} /></div>
                        <div className="col-span-2"><Input className="h-8" type="number" value={v.retail_price} onChange={e => handleVariantChange(i, 'retail_price', e.target.value)} /></div>
                        <div className="col-span-2"><Input className="h-8" type="number" value={v.unit_cost} onChange={e => handleVariantChange(i, 'unit_cost', e.target.value)} /></div>
                        <div className="col-span-2"><Input className="h-8" type="number" value={v.stock_on_hand} onChange={e => handleVariantChange(i, 'stock_on_hand', e.target.value)} /></div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          )}
        </Card>

        {!hasVariants && (
          <Card>
            <CardHeader>
              <CardTitle>Inventory Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="stock_on_hand">Initial Stock</Label>
                  <Input id="stock_on_hand" type="number" min="0" value={formData.stock_on_hand} onChange={(e) => setFormData({ ...formData, stock_on_hand: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reorder_level">Reorder Level</Label>
                  <Input id="reorder_level" type="number" min="0" value={formData.reorder_level} onChange={(e) => setFormData({ ...formData, reorder_level: e.target.value })} />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex gap-2">
          <Button type="submit" disabled={loading} size="lg">
            {loading ? 'Saving...' : 'Save Product'}
          </Button>
          <Button type="button" variant="outline" size="lg" onClick={() => navigate('/products')}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
