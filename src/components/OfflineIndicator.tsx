import { useEffect, useState, useCallback, useRef } from "react";
import { Loader2, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useOfflineQueue } from "@/hooks/useOfflineQueueContext";

export const OfflineIndicator = () => {
  const { isOnline, isSyncing, queueLength, conflictCount, syncError, syncQueue } = useOfflineQueue();
  const [showAlert, setShowAlert] = useState(() => !navigator.onLine);
  const wasOnline = useRef(isOnline);

  useEffect(() => {
    if (!isOnline || queueLength > 0) {
      setShowAlert(true);
    } else if (!wasOnline.current || showAlert) {
      setShowAlert(true);
      const timeout = window.setTimeout(() => setShowAlert(false), 4000);
      wasOnline.current = true;
      return () => window.clearTimeout(timeout);
    }

    wasOnline.current = isOnline;
  }, [isOnline, queueLength, showAlert]);

  const handleDismiss = useCallback(() => {
    if (isOnline && queueLength === 0) {
      setShowAlert(false);
    }
  }, [isOnline, queueLength]);

  if (!showAlert) return null;

  return (
    <Alert
      className={`pointer-events-none fixed top-4 right-4 z-50 w-auto max-w-sm shadow-lg transition-all duration-300 animate-fade-in ${
        isOnline ? "border-accent bg-accent/10" : "border-warning bg-warning/10"
      }`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3">
        {isOnline ? (
          <Wifi className="h-4 w-4 text-accent" />
        ) : (
          <WifiOff className="h-4 w-4 text-warning offline-pulse" />
        )}
        <AlertDescription
          className={`flex-1 text-sm font-medium ${
            isOnline ? "text-accent" : "text-warning"
          }`}
        >
          {isOnline
            ? conflictCount > 0
              ? `${conflictCount} offline sale(s) need review`
              : isSyncing
                ? "Reconnecting and syncing offline sales…"
                : queueLength > 0
                  ? `${queueLength} offline sale(s) awaiting sync`
                  : "Back online - server operations available"
            : "Server unavailable - offline POS mode"}
        </AlertDescription>
        {isOnline && queueLength > 0 && !isSyncing && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void syncQueue()}
            className="pointer-events-auto"
          >
            <RefreshCw className="mr-1 h-3 w-3" />
            Sync
          </Button>
        )}
        {isSyncing && <Loader2 className="h-4 w-4 animate-spin" />}
        {isOnline && queueLength === 0 && !isSyncing && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
            className="pointer-events-auto h-6 w-6 p-0 hover:bg-accent/20"
          >
            <span className="sr-only">Dismiss</span>×
          </Button>
        )}
      </div>
      {!isOnline && (
        <p className="mt-2 text-xs text-muted-foreground">
          Only cached products and provisional walk-in cash sales are available. Other changes need the server.
        </p>
      )}
      {syncError && isOnline && (
        <p className="mt-2 text-xs text-destructive">{syncError}</p>
      )}
    </Alert>
  );
};
