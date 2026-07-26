import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface LoyaltySettings {
  pointsRate: number;
  pointsPerAmount: number;
  tierSilverMin: number;
  tierGoldMin: number;
  tierPlatinumMin: number;
}

export function useLoyaltyPoints() {
  
  const loadLoyaltySettings = async (): Promise<LoyaltySettings> => {
    const { data } = await supabase.from('settings').select('key, value');
    
    const settingsMap: Record<string, string> = {};
    data?.forEach((s) => {
      settingsMap[s.key] = s.value;
    });

    return {
      pointsRate: parseFloat(settingsMap.loyalty_points_rate) || 1,
      pointsPerAmount: parseFloat(settingsMap.loyalty_points_per_amount) || 100,
      tierSilverMin: parseFloat(settingsMap.loyalty_tier_silver_min) || 50000,
      tierGoldMin: parseFloat(settingsMap.loyalty_tier_gold_min) || 150000,
      tierPlatinumMin: parseFloat(settingsMap.loyalty_tier_platinum_min) || 300000,
    };
  };

  const calculateTier = (totalSpent: number, settings: LoyaltySettings): string => {
    if (totalSpent >= settings.tierPlatinumMin) return 'Platinum';
    if (totalSpent >= settings.tierGoldMin) return 'Gold';
    if (totalSpent >= settings.tierSilverMin) return 'Silver';
    return 'Bronze';
  };

  const calculatePoints = (amount: number, settings: LoyaltySettings): number => {
    // Server-side calculation - this is now just for display
    return Math.floor((amount / settings.pointsPerAmount) * settings.pointsRate);
  };

  const awardLoyaltyPoints = async (customerId: string, saleAmount: number): Promise<number> => {
    try {
      const settings = await loadLoyaltySettings();
      const pointsToAdd = calculatePoints(saleAmount, settings);
      
      if (pointsToAdd <= 0) {
        return 0; // No points to award
      }

      // Check if customer is already a loyalty member
      const { data: existingMember, error: fetchError } = await supabase
        .from('loyalty_members')
        .select('*')
        .eq('customer_id', customerId)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        // PGRST116 is "no rows returned" - not an error for us
        console.error('Error fetching loyalty member:', fetchError);
        return 0;
      }

      if (existingMember) {
        // Update existing member
        const newTotalSpent = existingMember.total_spent + saleAmount;
        const newPoints = existingMember.points + pointsToAdd;
        const newTier = calculateTier(newTotalSpent, settings);

        const { error: updateError } = await supabase
          .from('loyalty_members')
          .update({
            points: newPoints,
            total_spent: newTotalSpent,
            tier: newTier,
          })
          .eq('id', existingMember.id);

        if (updateError) {
          console.error('Error updating loyalty member:', updateError);
          return 0;
        }

        toast.success(`+${pointsToAdd} loyalty points awarded!`, {
          description: `Total: ${newPoints} points | Tier: ${newTier}`
        });
      } else {
        // Create new loyalty member
        const newTier = calculateTier(saleAmount, settings);

        const { error: insertError } = await supabase
          .from('loyalty_members')
          .insert({
            customer_id: customerId,
            points: pointsToAdd,
            total_spent: saleAmount,
            tier: newTier,
          });

        if (insertError) {
          console.error('Error creating loyalty member:', insertError);
          return 0;
        }

        toast.success(`Welcome to Loyalty Program!`, {
          description: `+${pointsToAdd} points earned | Tier: ${newTier}`
        });
      }

      return pointsToAdd;
    } catch (error) {
      console.error('Error awarding loyalty points:', error);
      return 0;
    }
  };

  const redeemLoyaltyPoints = async (customerId: string, pointsToRedeem: number): Promise<boolean> => {
    try {
      const { data: member, error: fetchError } = await supabase
        .from('loyalty_members')
        .select('id, points')
        .eq('customer_id', customerId)
        .single();

      if (fetchError || !member) {
        toast.error('Loyalty member not found');
        return false;
      }

      if (member.points < pointsToRedeem) {
        toast.error('Insufficient loyalty points');
        return false;
      }

      const { error: updateError } = await supabase
        .from('loyalty_members')
        .update({ points: member.points - pointsToRedeem })
        .eq('id', member.id);

      if (updateError) {
        console.error('Error redeeming points:', updateError);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error redeeming loyalty points:', error);
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