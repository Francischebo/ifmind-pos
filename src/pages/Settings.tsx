import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Settings as SettingsIcon, Save, Award, Plus, Trash2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { ApiService } from '@/lib/api';

interface TaxClass {
  id: string;
  name: string;
  rate: number;
  is_default: boolean;
}

export default function Settings() {
  const { role } = useAuth();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const { data } = await supabase.from('settings').select('*');
    const settingsMap: Record<string, string> = {};
    data?.forEach((s) => {
      settingsMap[s.key] = s.value;
    });
    setSettings(settingsMap);
  };

  const [taxes, setTaxes] = useState<TaxClass[]>([]);
  const [newTax, setNewTax] = useState({ name: '', rate: '' });

  const loadTaxes = async () => {
    try {
      const data = await ApiService.get<TaxClass[]>('/taxes');
      setTaxes(data || []);
    } catch (error) {
      console.error('Error loading taxes:', error);
    }
  };

  useEffect(() => {
    loadTaxes();
  }, []);

  const handleAddTax = async () => {
    if (!newTax.name || !newTax.rate) return;
    setLoading(true);
    try {
      await ApiService.post('/taxes', {
        name: newTax.name,
        rate: parseFloat(newTax.rate),
        is_default: taxes.length === 0, // make default if it's the first one
      });
      setNewTax({ name: '', rate: '' });
      await loadTaxes();
      toast.success('Tax class added');
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTax = async (id: string) => {
    if (!confirm('Are you sure you want to delete this tax class?')) return;
    setLoading(true);
    try {
      await ApiService.delete(`/taxes/${id}`);
      await loadTaxes();
      toast.success('Tax class deleted');
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSetDefaultTax = async (id: string) => {
    setLoading(true);
    try {
      const tax = taxes.find(t => t.id === id);
      if (tax) {
        await ApiService.put(`/taxes/${id}`, { ...tax, is_default: true });
        await loadTaxes();
        toast.success('Default tax class updated');
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (role !== 'admin') {
      toast.error('Only admins can update settings');
      return;
    }

    setLoading(true);
    try {
      for (const [key, value] of Object.entries(settings)) {
        await supabase
          .from('settings')
          .upsert({ key, value }, { onConflict: 'key' });
      }
      toast.success('Settings saved successfully');
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const updateSetting = (key: string, value: string) => {
    setSettings({ ...settings, [key]: value });
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <SettingsIcon className="h-8 w-8" />
          Settings
        </h1>
        <p className="text-muted-foreground">Configure your POS system</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Company Information</CardTitle>
            <CardDescription>Business details for receipts and invoices</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="company_name">Company Name</Label>
              <Input
                id="company_name"
                value={settings.company_name || ''}
                onChange={(e) => updateSetting('company_name', e.target.value)}
                disabled={role !== 'admin'}
              />
            </div>
            <div>
              <Label htmlFor="company_address">Address</Label>
              <Textarea
                id="company_address"
                value={settings.company_address || ''}
                onChange={(e) => updateSetting('company_address', e.target.value)}
                rows={2}
                disabled={role !== 'admin'}
              />
            </div>
            <div>
              <Label htmlFor="company_phone">Phone</Label>
              <Input
                id="company_phone"
                value={settings.company_phone || ''}
                onChange={(e) => updateSetting('company_phone', e.target.value)}
                disabled={role !== 'admin'}
              />
            </div>
            <div>
              <Label htmlFor="tax_pin">KRA PIN</Label>
              <Input
                id="tax_pin"
                value={settings.tax_pin || ''}
                onChange={(e) => updateSetting('tax_pin', e.target.value)}
                placeholder="P000000000A"
                disabled={role !== 'admin'}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>MPESA Configuration</CardTitle>
            <CardDescription>Payment gateway settings for STK Push</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="mpesa_shortcode">Till Number / Shortcode *</Label>
              <Input
                id="mpesa_shortcode"
                value={settings.mpesa_shortcode || ''}
                onChange={(e) => updateSetting('mpesa_shortcode', e.target.value)}
                placeholder="Enter your M-Pesa Till Number (e.g., 174379)"
                disabled={role !== 'admin'}
              />
              <p className="text-xs text-muted-foreground mt-1">
                This is your M-Pesa Till Number used for STK Push payments
              </p>
            </div>
            <div>
              <Label htmlFor="mpesa_paybill">Paybill Number (Optional)</Label>
              <Input
                id="mpesa_paybill"
                value={settings.mpesa_paybill || ''}
                onChange={(e) => updateSetting('mpesa_paybill', e.target.value)}
                placeholder="123456"
                disabled={role !== 'admin'}
              />
            </div>
            <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                <strong>Important:</strong> The Till Number above is used for automatic STK Push payments. Make sure it matches your Safaricom Daraja API configuration.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Loyalty Program Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-5 w-5" />
              Loyalty Program
            </CardTitle>
            <CardDescription>Configure customer loyalty points and tiers</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="loyalty_points_rate">Points Earned</Label>
                <Input
                  id="loyalty_points_rate"
                  type="number"
                  min="1"
                  value={settings.loyalty_points_rate || '1'}
                  onChange={(e) => updateSetting('loyalty_points_rate', e.target.value)}
                  disabled={role !== 'admin'}
                />
              </div>
              <div>
                <Label htmlFor="loyalty_points_per_amount">Per KES Spent</Label>
                <Input
                  id="loyalty_points_per_amount"
                  type="number"
                  min="1"
                  value={settings.loyalty_points_per_amount || '100'}
                  onChange={(e) => updateSetting('loyalty_points_per_amount', e.target.value)}
                  disabled={role !== 'admin'}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Customers earn {settings.loyalty_points_rate || '1'} point(s) for every KSh {settings.loyalty_points_per_amount || '100'} spent
            </p>

            <div className="border-t pt-4 mt-4">
              <Label className="text-sm font-semibold mb-3 block">Points Redemption Value</Label>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <Label htmlFor="loyalty_points_value">KES per Point</Label>
                  <Input
                    id="loyalty_points_value"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={settings.loyalty_points_value || '1'}
                    onChange={(e) => updateSetting('loyalty_points_value', e.target.value)}
                    disabled={role !== 'admin'}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Each loyalty point is worth KSh {settings.loyalty_points_value || '1'} when redeemed as a discount
              </p>
            </div>

            <div className="border-t pt-4 mt-4">
              <Label className="text-sm font-semibold mb-3 block">Tier Thresholds (Total Spend in KES)</Label>
              <div className="grid gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full bg-gray-400" />
                  <Label htmlFor="loyalty_tier_silver_min" className="w-20">Silver</Label>
                  <Input
                    id="loyalty_tier_silver_min"
                    type="number"
                    min="0"
                    value={settings.loyalty_tier_silver_min || '50000'}
                    onChange={(e) => updateSetting('loyalty_tier_silver_min', e.target.value)}
                    disabled={role !== 'admin'}
                    className="flex-1"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full bg-yellow-500" />
                  <Label htmlFor="loyalty_tier_gold_min" className="w-20">Gold</Label>
                  <Input
                    id="loyalty_tier_gold_min"
                    type="number"
                    min="0"
                    value={settings.loyalty_tier_gold_min || '150000'}
                    onChange={(e) => updateSetting('loyalty_tier_gold_min', e.target.value)}
                    disabled={role !== 'admin'}
                    className="flex-1"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full bg-purple-500" />
                  <Label htmlFor="loyalty_tier_platinum_min" className="w-20">Platinum</Label>
                  <Input
                    id="loyalty_tier_platinum_min"
                    type="number"
                    min="0"
                    value={settings.loyalty_tier_platinum_min || '300000'}
                    onChange={(e) => updateSetting('loyalty_tier_platinum_min', e.target.value)}
                    disabled={role !== 'admin'}
                    className="flex-1"
                  />
                </div>
              </div>
            </div>

            <div className="p-4 bg-primary/10 border border-primary/20 rounded-lg">
              <p className="text-sm">
                <strong>How it works:</strong> When a customer makes a payment (Cash or M-Pesa), they automatically earn loyalty points based on the amount spent. Points and tier are calculated in real-time.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Receipt Settings</CardTitle>
            <CardDescription>Customize receipt footer message</CardDescription>
          </CardHeader>
          <CardContent>
            <div>
              <Label htmlFor="receipt_footer">Receipt Footer</Label>
              <Textarea
                id="receipt_footer"
                value={settings.receipt_footer || ''}
                onChange={(e) => updateSetting('receipt_footer', e.target.value)}
                rows={3}
                placeholder="Thank you for your business!"
                disabled={role !== 'admin'}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Tax Engine</CardTitle>
            <CardDescription>Manage tax classes for your products</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex gap-2 items-end">
                <div className="flex-1 space-y-1">
                  <Label>Tax Name</Label>
                  <Input 
                    placeholder="e.g. VAT 16%" 
                    value={newTax.name}
                    onChange={(e) => setNewTax({ ...newTax, name: e.target.value })}
                    disabled={role !== 'admin'}
                  />
                </div>
                <div className="w-32 space-y-1">
                  <Label>Rate (%)</Label>
                  <Input 
                    type="number" 
                    placeholder="16" 
                    value={newTax.rate}
                    onChange={(e) => setNewTax({ ...newTax, rate: e.target.value })}
                    disabled={role !== 'admin'}
                  />
                </div>
                <Button onClick={handleAddTax} disabled={loading || role !== 'admin'}>
                  <Plus className="h-4 w-4 mr-2" /> Add Tax
                </Button>
              </div>

              <div className="border rounded-md divide-y">
                {taxes.map((tax) => (
                  <div key={tax.id} className="p-3 flex items-center justify-between hover:bg-muted/50">
                    <div>
                      <p className="font-medium flex items-center gap-2">
                        {tax.name}
                        {tax.is_default && (
                          <span className="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Default
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-muted-foreground">{Number(tax.rate).toFixed(2)}%</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {!tax.is_default && role === 'admin' && (
                        <Button variant="outline" size="sm" onClick={() => handleSetDefaultTax(tax.id)} disabled={loading}>
                          Set Default
                        </Button>
                      )}
                      {role === 'admin' && (
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDeleteTax(tax.id)} disabled={loading}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                {taxes.length === 0 && (
                  <div className="p-4 text-center text-muted-foreground">No tax classes configured.</div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {role === 'admin' && (
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={loading} size="lg">
            <Save className="h-4 w-4 mr-2" />
            {loading ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>
      )}
    </div>
  );
}
