import { useEffect, useState, useCallback } from 'react';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export const OfflineIndicator = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showAlert, setShowAlert] = useState(!navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowAlert(true);
      setIsSyncing(true);
      // Simulate sync completion
      setTimeout(() => {
        setIsSyncing(false);
        setTimeout(() => setShowAlert(false), 2000);
      }, 1500);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowAlert(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleDismiss = useCallback(() => {
    if (isOnline) {
      setShowAlert(false);
    }
  }, [isOnline]);

  if (!showAlert) return null;

  return (
    <Alert 
      className={`fixed top-4 right-4 z-50 w-auto max-w-sm shadow-lg transition-all duration-300 animate-fade-in ${
        isOnline 
          ? 'border-accent bg-accent/10' 
          : 'border-warning bg-warning/10'
      }`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3">
        {isOnline ? (
          isSyncing ? (
            <RefreshCw className="h-4 w-4 text-accent animate-spin" />
          ) : (
            <Wifi className="h-4 w-4 text-accent" />
          )
        ) : (
          <WifiOff className="h-4 w-4 text-warning offline-pulse" />
        )}
        <AlertDescription className={`flex-1 text-sm font-medium ${
          isOnline ? 'text-accent' : 'text-warning'
        }`}>
          {isOnline 
            ? isSyncing 
              ? 'Back online - syncing data...' 
              : 'Connected - data synced!'
            : 'Working offline - data saves locally'
          }
        </AlertDescription>
        {isOnline && !isSyncing && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleDismiss}
            className="h-6 w-6 p-0 hover:bg-accent/20"
          >
            <span className="sr-only">Dismiss</span>
            ×
          </Button>
        )}
      </div>
      {!isOnline && (
        <p className="mt-2 text-xs text-muted-foreground">
          Your changes will sync automatically when connected.
        </p>
      )}
    </Alert>
  );
};
