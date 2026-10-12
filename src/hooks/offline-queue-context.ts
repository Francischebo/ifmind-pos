import { createContext } from "react";
import type { OfflineSaleRecord } from "@/lib/offlineStore";

export interface OfflineQueueContextValue {
  isOnline: boolean;
  isSyncing: boolean;
  queueLength: number;
  conflictCount: number;
  syncError: string | null;
  sales: OfflineSaleRecord[];
  enqueueSale: (record: OfflineSaleRecord) => Promise<void>;
  retrySale: (id: string) => Promise<void>;
  discardSale: (id: string) => Promise<void>;
  syncQueue: () => Promise<void>;
}

export const OfflineQueueContext = createContext<OfflineQueueContextValue | null>(null);
