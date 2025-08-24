import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/hooks/useI18n';
import { useWebSocket } from '@/hooks/useWebSocket';
import { apiClient } from '@/services/api-client';
import { HelpCircle, Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

interface HelpRequestCounter {
  open: number;
  total: number;
}

export function HelpRequestCounter() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [counter, setCounter] = useState<HelpRequestCounter>({ open: 0, total: 0 });
  const [loading, setLoading] = useState(true);

  // WebSocket connection for real-time updates
  const webSocket = useWebSocket({
    namespace: '/ws/help',
    autoReconnect: true,
    maxReconnectAttempts: 5,
    reconnectInterval: 2000,
    heartbeatInterval: 30000
  });

  // Fetch initial counter data
  const fetchCounter = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/api/help/stats');
      
      if (response.success) {
        setCounter({
          open: response.data.open || 0,
          total: response.data.total || 0
        });
      }
    } catch (err) {
      console.error('Error fetching help request counter:', err);
    } finally {
      setLoading(false);
    }
  };

  // Handle real-time WebSocket events
  useEffect(() => {
    if (!webSocket.isConnected) return;

    // Handle new help requests
    const handleHelpRequested = (data: any) => {
      console.log('New help request received for counter:', data);
      
      // Update counter
      setCounter(prev => ({
        open: prev.open + 1,
        total: prev.total + 1
      }));
      
      // Show notification
      toast.info(t('help.newRequestNotification'), {
        description: `${data.kiosk_id} - ${data.category}`,
        action: {
          label: t('common.view'),
          onClick: () => navigate('/help')
        }
      });
    };

    // Handle help request status updates
    const handleHelpStatusUpdated = (data: any) => {
      console.log('Help request status updated for counter:', data);
      
      // Update counter based on status change
      if (data.old_status !== data.new_status) {
        setCounter(prev => {
          const newCounter = { ...prev };
          
          // Decrease old status count
          if (data.old_status === 'open') {
            newCounter.open = Math.max(0, newCounter.open - 1);
          }
          
          // Increase new status count
          if (data.new_status === 'open') {
            newCounter.open += 1;
          }
          
          return newCounter;
        });
      }
    };

    // Register event listeners
    const unsubscribeHelpRequested = webSocket.addEventListener('help_requested', handleHelpRequested);
    const unsubscribeStatusUpdated = webSocket.addEventListener('help_status_updated', handleHelpStatusUpdated);

    // Cleanup function
    return () => {
      unsubscribeHelpRequested();
      unsubscribeStatusUpdated();
    };
  }, [webSocket.isConnected, webSocket.addEventListener, t, navigate]);

  // Initial data fetch
  useEffect(() => {
    fetchCounter();
  }, []);

  // Navigate to help center
  const handleClick = () => {
    navigate('/help');
  };

  if (loading) {
    return (
      <Button variant="ghost" size="sm" disabled>
        <HelpCircle className="h-4 w-4" />
        <span className="sr-only">{t('help.title')}</span>
      </Button>
    );
  }

  return (
    <Button 
      variant="ghost" 
      size="sm" 
      onClick={handleClick}
      className="relative flex items-center gap-2"
    >
      <HelpCircle className="h-4 w-4" />
      <span className="hidden sm:inline">{t('help.title')}</span>
      
      {counter.open > 0 && (
        <>
          <Badge 
            variant="destructive" 
            className="ml-1 px-1.5 py-0.5 text-xs min-w-[1.25rem] h-5 flex items-center justify-center"
          >
            {counter.open}
          </Badge>
          <Bell className="h-3 w-3 text-red-500 animate-pulse" />
        </>
      )}
      
      <span className="sr-only">
        {counter.open > 0 
          ? t('help.pendingRequestsCount', { count: counter.open })
          : t('help.noPendingRequests')
        }
      </span>
    </Button>
  );
}