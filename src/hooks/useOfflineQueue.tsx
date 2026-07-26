import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface QueuedTransaction {
  id: string;
  type: 'sale' | 'product' | 'customer';
  data: any;
  timestamp: number;
}

const QUEUE_KEY = 'ifmind_offline_queue';

export const useOfflineQueue = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);

  const getQueue = (): QueuedTransaction[] => {
    const queue = localStorage.getItem(QUEUE_KEY);
    return queue ? JSON.parse(queue) : [];
  };

  const addToQueue = (type: 'sale' | 'product' | 'customer', data: any) => {
    const queue = getQueue();
    const transaction: QueuedTransaction = {
      id: crypto.randomUUID(),
      type,
      data,
      timestamp: Date.now(),
    };
    queue.push(transaction);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    toast.info('Transaction queued for sync when online');
  };

  const syncQueue = async () => {
    if (!isOnline || isSyncing) return;

    const queue = getQueue();
    if (queue.length === 0) return;

    setIsSyncing(true);
    let successCount = 0;
    let failedTransactions: QueuedTransaction[] = [];

    for (const transaction of queue) {
      try {
        let result;
        switch (transaction.type) {
          case 'sale':
            result = await supabase.from('sales').insert(transaction.data);
            break;
          case 'product':
            result = await supabase.from('products').insert(transaction.data);
            break;
          case 'customer':
            result = await supabase.from('customers').insert(transaction.data);
            break;
        }

        if (result?.error) {
          failedTransactions.push(transaction);
        } else {
          successCount++;
        }
      } catch (error) {
        console.error('Sync error:', error);
        failedTransactions.push(transaction);
      }
    }

    // Update queue with only failed transactions
    localStorage.setItem(QUEUE_KEY, JSON.stringify(failedTransactions));

    if (successCount > 0) {
      toast.success(`Synced ${successCount} transaction(s)`);
    }
    if (failedTransactions.length > 0) {
      toast.error(`${failedTransactions.length} transaction(s) failed to sync`);
    }

    setIsSyncing(false);
  };

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (isOnline) {
      syncQueue();
    }
  }, [isOnline]);

  return {
    isOnline,
    isSyncing,
    addToQueue,
    queueLength: getQueue().length,
  };
};
