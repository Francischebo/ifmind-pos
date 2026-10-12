import { useContext } from "react";
import { OfflineQueueContext } from "@/hooks/offline-queue-context";

export const useOfflineQueue = () => {
  const context = useContext(OfflineQueueContext);
  if (!context) {
    throw new Error("useOfflineQueue must be used inside OfflineQueueProvider.");
  }
  return context;
};
