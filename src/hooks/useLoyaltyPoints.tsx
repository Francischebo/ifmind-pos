import { ApiService } from "@/lib/api";
import { toast } from "sonner";

interface LoyaltySettings {
  pointsRate: number;
  pointsPerAmount: number;
  tierSilverMin: number;
  tierGoldMin: number;
  tierPlatinumMin: number;
}

export function useLoyaltyPoints() {
  const loadLoyaltySettings = async (): Promise<LoyaltySettings> => {
    const settingsMap =
      await ApiService.get<Record<string, string>>("/loyalty/settings");

    return {
      pointsRate: parseFloat(settingsMap.loyalty_points_rate) || 1,
      pointsPerAmount: parseFloat(settingsMap.loyalty_points_per_amount) || 100,
      tierSilverMin: parseFloat(settingsMap.loyalty_tier_silver_min) || 50000,
      tierGoldMin: parseFloat(settingsMap.loyalty_tier_gold_min) || 150000,
      tierPlatinumMin:
        parseFloat(settingsMap.loyalty_tier_platinum_min) || 300000,
    };
  };

  const calculateTier = (
    totalSpent: number,
    settings: LoyaltySettings,
  ): string => {
    if (totalSpent >= settings.tierPlatinumMin) return "Platinum";
    if (totalSpent >= settings.tierGoldMin) return "Gold";
    if (totalSpent >= settings.tierSilverMin) return "Silver";
    return "Bronze";
  };

  const calculatePoints = (
    amount: number,
    settings: LoyaltySettings,
  ): number => {
    // Server-side calculation - this is now just for display
    return Math.floor(
      (amount / settings.pointsPerAmount) * settings.pointsRate,
    );
  };

  const awardLoyaltyPoints = async (
    customerId: string,
    saleAmount: number,
  ): Promise<number> => {
    try {
      const settings = await loadLoyaltySettings();
      const pointsToAdd = calculatePoints(saleAmount, settings);

      if (pointsToAdd <= 0) {
        return 0;
      }

      const members =
        await ApiService.get<
          Array<{
            id: string;
            customer_id: string;
            points: number;
            total_spent: number;
            tier: string;
          }>
        >("/loyalty/members");
      const existingMember = members.find(
        (member) => member.customer_id === customerId,
      );

      if (existingMember) {
        const newTotalSpent =
          Number(existingMember.total_spent || 0) + saleAmount;
        const newPoints = Number(existingMember.points || 0) + pointsToAdd;
        const newTier = calculateTier(newTotalSpent, settings);

        await ApiService.post(`/loyalty/members/${existingMember.id}/points`, {
          points: pointsToAdd,
          amount: saleAmount,
        });

        toast.success(`+${pointsToAdd} loyalty points awarded!`, {
          description: `Total: ${newPoints} points | Tier: ${newTier}`,
        });
      } else {
        const newTier = calculateTier(saleAmount, settings);

        await ApiService.post("/loyalty/members", {
          customer_id: customerId,
          points: pointsToAdd,
          total_spent: saleAmount,
          tier: newTier,
        });

        toast.success("Welcome to Loyalty Program!", {
          description: `+${pointsToAdd} points earned | Tier: ${newTier}`,
        });
      }

      return pointsToAdd;
    } catch (error) {
      console.error("Error awarding loyalty points:", error);
      toast.error("Unable to award loyalty points");
      return 0;
    }
  };

  const redeemLoyaltyPoints = async (
    customerId: string,
    pointsToRedeem: number,
  ): Promise<boolean> => {
    try {
      const members =
        await ApiService.get<
          Array<{ id: string; customer_id: string; points: number }>
        >("/loyalty/members");
      const member = members.find((row) => row.customer_id === customerId);

      if (!member) {
        toast.error("Loyalty member not found");
        return false;
      }

      if (member.points < pointsToRedeem) {
        toast.error("Insufficient loyalty points");
        return false;
      }

      await ApiService.post(`/loyalty/members/${member.id}/redeem`, {
        points: pointsToRedeem,
      });
      return true;
    } catch (error) {
      console.error("Error redeeming loyalty points:", error);
      toast.error("Unable to redeem loyalty points");
      return false;
    }
  };

  return {
    awardLoyaltyPoints,
    redeemLoyaltyPoints,
    loadLoyaltySettings,
    calculatePoints,
    calculateTier,
  };
}
