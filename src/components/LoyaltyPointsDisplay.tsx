import { useCallback, useEffect, useState } from "react";
import { ApiService } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Star, Award, TrendingUp } from "lucide-react";

interface LoyaltyPointsDisplayProps {
  customerId: string;
  pointsEarned?: number;
  className?: string;
}

interface LoyaltyMember {
  points: number;
  tier: string;
  total_spent: number;
}

interface CustomerInfo {
  name: string;
  phone: string;
}

export function LoyaltyPointsDisplay({
  customerId,
  pointsEarned = 0,
  className,
}: LoyaltyPointsDisplayProps) {
  const [member, setMember] = useState<LoyaltyMember | null>(null);
  const [customer, setCustomer] = useState<CustomerInfo | null>(null);
  const [settings, setSettings] = useState<Record<string, string>>({});

  const loadData = useCallback(async () => {
    try {
      const [members, settingsMap] = await Promise.all([
        ApiService.get<
          Array<{
            id: string;
            customer_id: string;
            points: number;
            tier: string;
            total_spent: number;
            customer?: { id: string; name: string; phone: string };
          }>
        >("/loyalty/members"),
        ApiService.get<Record<string, string>>("/loyalty/settings"),
      ]);

      const memberData = members.find(
        (item) => item.customer_id === customerId,
      );
      if (memberData) {
        setMember({
          points: Number(memberData.points || 0),
          tier: memberData.tier || "Bronze",
          total_spent: Number(memberData.total_spent || 0),
        });

        if (memberData.customer) {
          setCustomer({
            name: memberData.customer.name,
            phone: memberData.customer.phone,
          });
        }
      }

      setSettings(settingsMap || {});
    } catch (error) {
      console.error("Error loading loyalty data:", error);
    }
  }, [customerId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  if (!member || !customer) return null;

  const getTierColor = (tier: string) => {
    switch (tier) {
      case "Platinum":
        return "bg-gradient-to-r from-slate-300 to-slate-500 text-slate-900";
      case "Gold":
        return "bg-gradient-to-r from-yellow-400 to-amber-500 text-amber-900";
      case "Silver":
        return "bg-gradient-to-r from-gray-300 to-gray-400 text-gray-800";
      default:
        return "bg-gradient-to-r from-amber-600 to-amber-800 text-amber-100";
    }
  };

  const getNextTier = () => {
    const tierSilverMin = parseFloat(settings.loyalty_tier_silver_min) || 50000;
    const tierGoldMin = parseFloat(settings.loyalty_tier_gold_min) || 150000;
    const tierPlatinumMin =
      parseFloat(settings.loyalty_tier_platinum_min) || 300000;

    if (member.tier === "Bronze") {
      const remaining = tierSilverMin - member.total_spent;
      return remaining > 0 ? { tier: "Silver", remaining } : null;
    } else if (member.tier === "Silver") {
      const remaining = tierGoldMin - member.total_spent;
      return remaining > 0 ? { tier: "Gold", remaining } : null;
    } else if (member.tier === "Gold") {
      const remaining = tierPlatinumMin - member.total_spent;
      return remaining > 0 ? { tier: "Platinum", remaining } : null;
    }
    return null;
  };

  const nextTier = getNextTier();

  return (
    <Card
      className={`border-2 border-primary/30 bg-gradient-to-br from-primary/5 to-accent/5 ${className}`}
    >
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Award className="h-5 w-5 text-primary" />
            <span className="font-semibold">Loyalty Rewards</span>
          </div>
          <Badge className={`${getTierColor(member.tier)} font-bold`}>
            {member.tier} Member
          </Badge>
        </div>

        {/* Customer Name */}
        <div className="text-center py-2 border-y border-primary/20">
          <p className="text-muted-foreground text-sm">Customer</p>
          <p className="font-bold text-lg">{customer.name}</p>
          <p className="text-sm text-muted-foreground">{customer.phone}</p>
        </div>

        {/* Points Earned This Purchase */}
        {pointsEarned > 0 && (
          <div className="flex items-center justify-center gap-2 py-2 bg-green-500/10 rounded-lg border border-green-500/30">
            <TrendingUp className="h-5 w-5 text-green-600" />
            <span className="text-green-600 font-bold">
              +{pointsEarned} points earned!
            </span>
          </div>
        )}

        {/* Current Balance */}
        <div className="text-center py-3 bg-muted/50 rounded-lg">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
            <span className="text-sm text-muted-foreground">
              Current Balance
            </span>
          </div>
          <p className="text-3xl font-bold text-primary">
            {member.points.toLocaleString()}
          </p>
          <p className="text-xs text-muted-foreground">points available</p>
        </div>

        {/* Total Spent */}
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Total Spent:</span>
          <span className="font-semibold">
            KSh {member.total_spent.toLocaleString("en-KE")}
          </span>
        </div>

        {/* Next Tier Progress */}
        {nextTier && (
          <div className="text-xs text-center text-muted-foreground bg-muted/30 p-2 rounded">
            Spend{" "}
            <span className="font-bold text-primary">
              KSh {nextTier.remaining.toLocaleString("en-KE")}
            </span>{" "}
            more to reach <span className="font-bold">{nextTier.tier}</span>{" "}
            tier!
          </div>
        )}

        {/* Thank You Message */}
        <div className="text-center text-sm text-muted-foreground pt-2 border-t">
          Thank you for being a valued customer! 🙏
        </div>
      </CardContent>
    </Card>
  );
}
