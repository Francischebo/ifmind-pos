import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Gift, Star, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface LoyaltyRedemptionProps {
  customerId: string;
  totalAmount: number;
  onApplyDiscount: (discount: number, pointsUsed: number) => void;
  appliedDiscount: number;
  appliedPoints: number;
}

interface LoyaltyMember {
  id: string;
  points: number;
  tier: string;
}

export function LoyaltyRedemption({
  customerId,
  totalAmount,
  onApplyDiscount,
  appliedDiscount,
  appliedPoints,
}: LoyaltyRedemptionProps) {
  const [member, setMember] = useState<LoyaltyMember | null>(null);
  const [pointsToRedeem, setPointsToRedeem] = useState(0);
  const [pointsValue, setPointsValue] = useState(1); // KES per point
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [customerId]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load loyalty member
      const { data: memberData } = await supabase
        .from('loyalty_members')
        .select('id, points, tier')
        .eq('customer_id', customerId)
        .single();

      if (memberData) {
        setMember(memberData);
      }

      // Load points value setting
      const { data: settingsData } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'loyalty_points_value')
        .single();

      if (settingsData) {
        setPointsValue(parseFloat(settingsData.value) || 1);
      }
    } catch (error) {
      console.error('Error loading loyalty data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="border border-dashed">
        <CardContent className="p-4 text-center text-muted-foreground">
          Loading loyalty info...
        </CardContent>
      </Card>
    );
  }

  if (!member) {
    return (
      <Card className="border border-dashed border-muted-foreground/30">
        <CardContent className="p-4 flex items-center gap-2 text-muted-foreground">
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm">Customer not enrolled in loyalty program</span>
        </CardContent>
      </Card>
    );
  }

  const availablePoints = member.points - appliedPoints;
  const maxRedeemableValue = Math.min(availablePoints * pointsValue, totalAmount * 0.5); // Max 50% discount
  const maxRedeemablePoints = Math.floor(maxRedeemableValue / pointsValue);
  const discountValue = pointsToRedeem * pointsValue;

  const handleApplyRedemption = () => {
    if (pointsToRedeem <= 0) {
      toast.error('Select points to redeem');
      return;
    }

    if (pointsToRedeem > availablePoints) {
      toast.error('Insufficient points');
      return;
    }

    onApplyDiscount(discountValue, pointsToRedeem);
    toast.success(`KSh ${discountValue.toLocaleString()} discount applied!`);
    setPointsToRedeem(0);
  };

  const handleRemoveRedemption = () => {
    onApplyDiscount(0, 0);
    setPointsToRedeem(0);
  };

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'Platinum': return 'bg-gradient-to-r from-slate-300 to-slate-500 text-slate-900';
      case 'Gold': return 'bg-gradient-to-r from-yellow-400 to-amber-500 text-amber-900';
      case 'Silver': return 'bg-gradient-to-r from-gray-300 to-gray-400 text-gray-800';
      default: return 'bg-gradient-to-r from-amber-600 to-amber-800 text-amber-100';
    }
  };

  return (
    <Card className="border-2 border-accent/30 bg-gradient-to-br from-accent/5 to-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Gift className="h-4 w-4 text-accent" />
            Redeem Loyalty Points
          </CardTitle>
          <Badge className={`${getTierColor(member.tier)} text-xs`}>
            {member.tier}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Available Points */}
        <div className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2">
            <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
            <span className="text-sm">Available Points:</span>
          </div>
          <span className="font-bold text-primary">{availablePoints.toLocaleString()}</span>
        </div>

        {appliedDiscount > 0 ? (
          // Show applied discount
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-green-500/10 rounded-lg border border-green-500/30">
              <div>
                <p className="font-semibold text-green-600">Discount Applied!</p>
                <p className="text-sm text-muted-foreground">
                  {appliedPoints} points = KSh {appliedDiscount.toLocaleString()}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRemoveRedemption}
                className="border-destructive text-destructive hover:bg-destructive/10"
              >
                Remove
              </Button>
            </div>
          </div>
        ) : (
          // Redemption slider
          <div className="space-y-4">
            {maxRedeemablePoints > 0 ? (
              <>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    Points to redeem: <span className="font-bold text-foreground">{pointsToRedeem}</span>
                    <span className="text-muted-foreground"> = KSh {discountValue.toLocaleString()}</span>
                  </Label>
                  <Slider
                    value={[pointsToRedeem]}
                    onValueChange={(value) => setPointsToRedeem(value[0])}
                    max={maxRedeemablePoints}
                    step={1}
                    className="py-2"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>0 pts</span>
                    <span>{maxRedeemablePoints} pts (max)</span>
                  </div>
                </div>

                {/* Quick redemption buttons */}
                <div className="flex flex-wrap gap-2">
                  {[25, 50, 75, 100].map((percent) => {
                    const pts = Math.floor((maxRedeemablePoints * percent) / 100);
                    if (pts <= 0) return null;
                    return (
                      <Button
                        key={percent}
                        variant="outline"
                        size="sm"
                        onClick={() => setPointsToRedeem(pts)}
                        className="text-xs"
                      >
                        {percent}% ({pts} pts)
                      </Button>
                    );
                  })}
                </div>

                <Button
                  onClick={handleApplyRedemption}
                  disabled={pointsToRedeem <= 0}
                  className="w-full"
                  variant="secondary"
                >
                  <Gift className="h-4 w-4 mr-2" />
                  Apply {pointsToRedeem} Points (-KSh {discountValue.toLocaleString()})
                </Button>
              </>
            ) : (
              <p className="text-sm text-center text-muted-foreground">
                No points available to redeem
              </p>
            )}
          </div>
        )}

        {/* Info */}
        <p className="text-xs text-center text-muted-foreground">
          {pointsValue} point = KSh {pointsValue} • Max 50% of total
        </p>
      </CardContent>
    </Card>
  );
}
