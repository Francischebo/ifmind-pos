import { useEffect, useState, useCallback, useRef } from "react";
import { Wifi, WifiOff } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useOfflineQueue } from "@/hooks/useOfflineQueue";

export const OfflineIndicator = () => {
  const { isOnline, isSyncing } = useOfflineQueue();
  const [showAlert, setShowAlert] = useState(!navigator.onLine);
  const wasOnline = useRef(isOnline);

  useEffect(() => {
    if (!isOnline) {
      setShowAlert(true);
    } else if (!wasOnline.current) {
      setShowAlert(true);
      const timeout = window.setTimeout(() => setShowAlert(false), 4000);
      wasOnline.current = true;
      return () => window.clearTimeout(timeout);
    }

    wasOnline.current = isOnline;
  }, [isOnline]);

  const handleDismiss = useCallback(() => {
    if (isOnline) {
      setShowAlert(false);
    }
  }, [isOnline]);

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
            ? "Back online - server operations available"
            : "Offline - server operations unavailable"}
        </AlertDescription>
        {isOnline && !isSyncing && (
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
          Reconnect before completing sales or other server-backed changes.
        </p>
      )}
    </Alert>
  );
};
