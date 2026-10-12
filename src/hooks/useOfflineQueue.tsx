import {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ApiNetworkError, ApiRequestError, ApiService, API_BASE_URL } from "@/lib/api";
import {
  enqueueOfflineSale,
  OfflineSaleRecord,
  readOfflineSales,
  removeOfflineSale,
  saveOfflineSale,
} from "@/lib/offlineStore";
import { toast } from "sonner";
import { OfflineQueueContext, type OfflineQueueContextValue } from "@/hooks/offline-queue-context";

interface OfflineQueueProviderProps {
  children: ReactNode;
  userId: string | null;
  onlineVerified: boolean;
  offlineSession: boolean;
}

const getHealthUrl = () => {
  const apiUrl = new URL(API_BASE_URL, window.location.origin);
  apiUrl.pathname = `${apiUrl.pathname.replace(/\/$/, "")}/health`;
  apiUrl.search = "";
  apiUrl.hash = "";
  return apiUrl.toString();
};

export const OfflineQueueProvider = ({
  children,
  userId,
  onlineVerified,
  offlineSession,
}: OfflineQueueProviderProps) => {
  const [isOnline, setIsOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine,
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [sales, setSales] = useState<OfflineSaleRecord[]>([]);
  const [syncError, setSyncError] = useState<string | null>(null);
  const syncLock = useRef(false);

  const refreshSales = useCallback(async () => {
    if (!userId) {
      setSales([]);
      return;
    }
    try {
      setSales(await readOfflineSales(userId));
    } catch (error) {
      console.error("Unable to read offline sales:", error);
      setSyncError(error instanceof Error ? error.message : "Offline storage is unavailable.");
    }
  }, [userId]);

  const checkApiAvailability = useCallback(async () => {
    if (!navigator.onLine) {
      setIsOnline(false);
      return false;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(getHealthUrl(), {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      });
      const available = response.ok;
      setIsOnline(available);
      return available;
    } catch {
      setIsOnline(false);
      return false;
    } finally {
      window.clearTimeout(timeout);
    }
  }, []);

  const syncQueue = useCallback(async () => {
    if (
      syncLock.current ||
      !userId ||
      !onlineVerified ||
      offlineSession ||
      !isOnline
    ) {
      return;
    }

    syncLock.current = true;
    setIsSyncing(true);
    setSyncError(null);
    let syncedCount = 0;

    try {
      const queue = await readOfflineSales(userId);
      const unsyncedQueue = queue.filter(
        (record) => record.status !== "synced" && record.status !== "conflict",
      );
      if (unsyncedQueue.length === 0) return;

      const verifiedUser = await ApiService.get<{ id?: string }>("/auth/me");
      if (verifiedUser.id !== userId) {
        setSyncError("These offline sales belong to a different cashier. Sign in as the original cashier to synchronize them.");
        return;
      }

      for (const record of unsyncedQueue) {

        const sending: OfflineSaleRecord = {
          ...record,
          status: "syncing",
          attempts: record.attempts + 1,
          lastError: undefined,
        };
        await saveOfflineSale(sending);
        setSales((current) => current.map((sale) => sale.id === sending.id ? sending : sale));

        try {
          const result = await ApiService.post<{ id?: string; sale?: { id?: string } }>(
            "/sales",
            sending.payload,
          );
          const serverSaleId = result.id || result.sale?.id;
          if (!serverSaleId) {
            throw new ApiRequestError(
              "The server response did not include the sale ID; retry is safe and uses the same idempotency key.",
              502,
            );
          }

          const synced: OfflineSaleRecord = {
            ...sending,
            status: "synced",
            serverSaleId,
            syncedAt: new Date().toISOString(),
          };
          await saveOfflineSale(synced);
          setSales((current) => current.map((sale) => sale.id === synced.id ? synced : sale));
          syncedCount++;
        } catch (error) {
          const message = error instanceof Error ? error.message : "Sale synchronization failed.";
          const permanentFailure =
            error instanceof ApiRequestError &&
            error.status >= 400 &&
            error.status < 500 &&
            error.status !== 401 &&
            error.status !== 429;
          const failed: OfflineSaleRecord = {
            ...sending,
            status: permanentFailure ? "conflict" : "pending",
            lastError: message,
          };
          await saveOfflineSale(failed);
          setSales((current) => current.map((sale) => sale.id === failed.id ? failed : sale));
          setSyncError(message);

          if (error instanceof ApiNetworkError || !(error instanceof ApiRequestError) ||
              error.status >= 500 || error.status === 401 || error.status === 429) {
            break;
          }
        }
      }

      if (syncedCount > 0) {
        toast.success(`${syncedCount} offline sale(s) synchronized with the server.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to synchronize offline sales.";
      setSyncError(message);
      console.error("Offline sale synchronization failed:", error);
    } finally {
      syncLock.current = false;
      setIsSyncing(false);
      await refreshSales();
    }
  }, [isOnline, offlineSession, onlineVerified, refreshSales, userId]);

  const enqueueSale = useCallback(async (record: OfflineSaleRecord) => {
    if (!userId || record.userId !== userId) {
      throw new Error("Offline sale does not belong to the signed-in cashier.");
    }
    await enqueueOfflineSale(record);
    await refreshSales();
  }, [refreshSales, userId]);

  const retrySale = useCallback(async (id: string) => {
    const record = sales.find((sale) => sale.id === id);
    if (!record || record.userId !== userId || record.status !== "conflict") return;
    const retry = { ...record, status: "pending" as const, lastError: undefined };
    await saveOfflineSale(retry);
    await refreshSales();
    if (isOnline && onlineVerified && !offlineSession) void syncQueue();
  }, [isOnline, offlineSession, onlineVerified, refreshSales, sales, syncQueue, userId]);

  const discardSale = useCallback(async (id: string) => {
    const record = sales.find((sale) => sale.id === id);
    if (!record || record.userId !== userId || record.status === "syncing" || record.status === "synced") return;
    await removeOfflineSale(id);
    await refreshSales();
  }, [refreshSales, sales, userId]);

  useEffect(() => {
    void refreshSales();
  }, [refreshSales]);

  useEffect(() => {
    let disposed = false;
    const probe = async () => {
      if (disposed) return;
      await checkApiAvailability();
    };
    const handleOnline = () => void probe();
    const handleOffline = () => setIsOnline(false);
    const handleFocus = () => {
      void refreshSales();
      void probe();
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("focus", handleFocus);
    const interval = window.setInterval(() => void probe(), 20_000);
    void probe();

    return () => {
      disposed = true;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("focus", handleFocus);
      window.clearInterval(interval);
    };
  }, [checkApiAvailability, refreshSales]);

  useEffect(() => {
    if (isOnline && onlineVerified && !offlineSession) {
      void syncQueue();
    }
  }, [isOnline, offlineSession, onlineVerified, syncQueue]);

  const value = useMemo<OfflineQueueContextValue>(() => ({
    isOnline,
    isSyncing,
    queueLength: sales.filter((sale) => sale.status === "pending" || sale.status === "syncing" || sale.status === "conflict").length,
    conflictCount: sales.filter((sale) => sale.status === "conflict").length,
    syncError,
    sales,
    enqueueSale,
    retrySale,
    discardSale,
    syncQueue,
  }), [discardSale, enqueueSale, isOnline, isSyncing, retrySale, sales, syncError, syncQueue]);

  return (
    <OfflineQueueContext.Provider value={value}>
      {children}
    </OfflineQueueContext.Provider>
  );
};
