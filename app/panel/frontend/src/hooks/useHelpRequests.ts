import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../services/api-client';
import { useWebSocket } from './useWebSocket';
import { toast } from 'sonner';

export interface HelpRequest {
  id: number;
  kiosk_id: string;
  locker_no?: number;
  category: 'lock_problem' | 'other';
  note?: string;
  status: 'open' | 'resolved';
  created_at: string;
  resolved_at?: string;
}

export interface HelpRequestFilter {
  status?: 'open' | 'resolved';
  kiosk_id?: string;
  category?: 'lock_problem' | 'other';
}

export interface HelpRequestStatistics {
  total: number;
  open: number;
  resolved: number;
  by_category: Record<string, number>;
}

export function useHelpRequests() {
  const [helpRequests, setHelpRequests] = useState<HelpRequest[]>([]);
  const [statistics, setStatistics] = useState<HelpRequestStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<HelpRequestFilter>({});

  // WebSocket connection for real-time updates
  const webSocket = useWebSocket({
    namespace: '/ws/help',
    autoReconnect: true,
    maxReconnectAttempts: 10,
    reconnectInterval: 1000,
    heartbeatInterval: 30000
  });

  // Fetch help requests from API
  const fetchHelpRequests = useCallback(async (currentFilter: HelpRequestFilter = {}) => {
    try {
      setLoading(true);
      setError(null);

      const queryParams = new URLSearchParams();
      if (currentFilter.status) queryParams.append('status', currentFilter.status);
      if (currentFilter.kiosk_id) queryParams.append('kiosk_id', currentFilter.kiosk_id);
      if (currentFilter.category) queryParams.append('category', currentFilter.category);

      const url = `/api/help${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      const response = await apiClient.get(url);

      if (response.success) {
        setHelpRequests(response.data);
      } else {
        throw new Error(response.error || 'Failed to fetch help requests');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch help requests';
      setError(errorMessage);
      console.error('Error fetching help requests:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch help request statistics
  const fetchStatistics = useCallback(async () => {
    try {
      const response = await apiClient.get('/api/help/stats');
      if (response.success) {
        setStatistics(response.data);
      }
    } catch (err) {
      console.error('Error fetching help statistics:', err);
    }
  }, []);

  // Resolve help request (Simplified)
  const resolveHelpRequest = useCallback(async (id: number) => {
    try {
      const response = await apiClient.post(`/api/help/${id}/resolve`);
      
      if (response.success) {
        // Update local state optimistically
        setHelpRequests(prev => prev.map(request => 
          request.id === id 
            ? { 
                ...request, 
                status: 'resolved', 
                resolved_at: new Date().toISOString()
              }
            : request
        ));
        
        toast.success('Help request resolved successfully');
        return response.data;
      } else {
        throw new Error(response.error || 'Failed to resolve help request');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to resolve help request';
      toast.error(errorMessage);
      throw err;
    }
  }, []);

  // Update help request
  const updateHelpRequest = useCallback(async (id: number, updates: Partial<HelpRequest>) => {
    try {
      const response = await apiClient.put(`/api/help/${id}`, updates);
      
      if (response.success) {
        // Update local state optimistically
        setHelpRequests(prev => prev.map(request => 
          request.id === id 
            ? { ...request, ...updates }
            : request
        ));
        
        toast.success('Help request updated successfully');
        return response.data;
      } else {
        throw new Error(response.error || 'Failed to update help request');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update help request';
      toast.error(errorMessage);
      throw err;
    }
  }, []);

  // Get help request by ID
  const getHelpRequestById = useCallback(async (id: number): Promise<HelpRequest | null> => {
    try {
      const response = await apiClient.get(`/api/help/${id}`);
      
      if (response.success) {
        return response.data;
      } else {
        throw new Error(response.error || 'Failed to fetch help request');
      }
    } catch (err) {
      console.error('Error fetching help request:', err);
      return null;
    }
  }, []);

  // Apply filter and refresh data
  const applyFilter = useCallback((newFilter: HelpRequestFilter) => {
    setFilter(newFilter);
    fetchHelpRequests(newFilter);
  }, [fetchHelpRequests]);

  // Clear filter
  const clearFilter = useCallback(() => {
    const emptyFilter = {};
    setFilter(emptyFilter);
    fetchHelpRequests(emptyFilter);
  }, [fetchHelpRequests]);

  // Refresh data
  const refresh = useCallback(() => {
    fetchHelpRequests(filter);
    fetchStatistics();
  }, [fetchHelpRequests, fetchStatistics, filter]);

  // Handle real-time WebSocket events
  useEffect(() => {
    if (!webSocket.isConnected) return;

    // Handle new help requests
    const handleHelpRequested = (data: any) => {
      console.log('New help request received:', data);
      
      // Add new help request to the list
      setHelpRequests(prev => [data, ...prev]);
      
      // Update statistics
      setStatistics(prev => prev ? {
        ...prev,
        total: prev.total + 1,
        open: prev.open + 1,
        by_category: {
          ...prev.by_category,
          [data.category]: (prev.by_category[data.category] || 0) + 1
        }
      } : null);
      
      // Show notification with action button
      toast.info(`New help request from ${data.kiosk_id}`, {
        description: data.note || `${data.category} - Locker ${data.locker_no || 'N/A'}`,
        duration: 8000, // Show longer for help requests
        action: {
          label: 'View',
          onClick: () => {
            // The notification will be handled by the counter component
            // This is just for the help page notifications
          }
        }
      });
    };

    // Handle help request status updates
    const handleHelpStatusUpdated = (data: any) => {
      console.log('Help request status updated:', data);
      
      // Update the help request in the list
      setHelpRequests(prev => prev.map(request => {
        if (request.id === data.id) {
          const updatedRequest = { ...request };
          
          if (data.new_status) updatedRequest.status = data.new_status;
          if (data.new_status === 'resolved') updatedRequest.resolved_at = data.updated_at;
          
          return updatedRequest;
        }
        return request;
      }));
      
      // Update statistics based on status change
      if (data.old_status !== data.new_status) {
        setStatistics(prev => {
          if (!prev) return null;
          
          const newStats = { ...prev };
          
          // Decrease old status count
          if (data.old_status === 'open') newStats.open = Math.max(0, newStats.open - 1);
          else if (data.old_status === 'resolved') newStats.resolved = Math.max(0, newStats.resolved - 1);
          
          // Increase new status count
          if (data.new_status === 'open') newStats.open += 1;
          else if (data.new_status === 'resolved') newStats.resolved += 1;
          
          return newStats;
        });
      }
      
      // Show notification for status changes
      const statusMessages = {
        resolved: 'Help request resolved',
        open: 'Help request reopened'
      };
      
      if (statusMessages[data.new_status as keyof typeof statusMessages]) {
        toast.success(statusMessages[data.new_status as keyof typeof statusMessages]);
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
  }, [webSocket.isConnected, webSocket.addEventListener]);

  // Initial data fetch
  useEffect(() => {
    fetchHelpRequests(filter);
    fetchStatistics();
  }, [fetchHelpRequests, fetchStatistics, filter]);

  return {
    // Data
    helpRequests,
    statistics,
    loading,
    error,
    filter,
    
    // WebSocket state
    isConnected: webSocket.isConnected,
    connectionHealth: webSocket.connectionHealth,
    
    // Actions
    resolveHelpRequest,
    updateHelpRequest,
    getHelpRequestById,
    applyFilter,
    clearFilter,
    refresh,
    
    // WebSocket actions
    reconnect: webSocket.reconnect
  };
}