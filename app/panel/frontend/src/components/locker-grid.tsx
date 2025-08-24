import React, { useState, useCallback, useMemo } from 'react';
import { useLockerUpdates, type LockerState } from '../hooks/useLockerUpdates';
import { useI18n } from '../hooks/useI18n';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { 
  AlertCircle, 
  Lock, 
  Unlock, 
  Clock, 
  Shield, 
  Wifi, 
  WifiOff,
  RefreshCw,
  Activity
} from 'lucide-react';
import { cn } from '../lib/utils';

interface LockerGridProps {
  kioskId?: string;
  showStats?: boolean;
  showControls?: boolean;
  onLockerClick?: (locker: LockerState) => void;
  onLockerAction?: (locker: LockerState, action: string) => Promise<boolean>;
}

interface LockerCardProps {
  locker: LockerState;
  onClick?: ((locker: LockerState) => void) | undefined;
  onAction?: ((locker: LockerState, action: string) => Promise<boolean>) | undefined;
  isOptimistic?: boolean;
}

const LockerCard: React.FC<LockerCardProps> = ({ 
  locker, 
  onClick, 
  onAction, 
  isOptimistic = false 
}) => {
  const { t } = useI18n();
  const [isActionLoading, setIsActionLoading] = useState(false);

  const getStatusColor = (status: LockerState['status']) => {
    switch (status) {
      case 'Free':
        return 'bg-green-100 border-green-300 text-green-800';
      case 'Reserved':
        return 'bg-yellow-100 border-yellow-300 text-yellow-800';
      case 'Owned':
        return 'bg-blue-100 border-blue-300 text-blue-800';
      case 'Opening':
        return 'bg-purple-100 border-purple-300 text-purple-800';
      case 'Blocked':
        return 'bg-red-100 border-red-300 text-red-800';
      default:
        return 'bg-gray-100 border-gray-300 text-gray-800';
    }
  };

  const getStatusIcon = (status: LockerState['status']) => {
    switch (status) {
      case 'Free':
        return <Unlock className="w-4 h-4" />;
      case 'Reserved':
        return <Clock className="w-4 h-4" />;
      case 'Owned':
        return <Lock className="w-4 h-4" />;
      case 'Opening':
        return <Activity className="w-4 h-4 animate-pulse" />;
      case 'Blocked':
        return <AlertCircle className="w-4 h-4" />;
      default:
        return <AlertCircle className="w-4 h-4" />;
    }
  };

  const handleAction = async (action: string) => {
    if (!onAction || isActionLoading) return;

    setIsActionLoading(true);
    try {
      await onAction(locker, action);
    } catch (error) {
      console.error('Error performing locker action:', error);
    } finally {
      setIsActionLoading(false);
    }
  };

  const getAvailableActions = () => {
    const actions = [];
    
    switch (locker.status) {
      case 'Free':
        actions.push({ key: 'block', label: t('lockers.actions.block'), variant: 'destructive' });
        break;
      case 'Reserved':
        actions.push({ key: 'release', label: t('lockers.actions.release'), variant: 'outline' });
        actions.push({ key: 'block', label: t('lockers.actions.block'), variant: 'destructive' });
        break;
      case 'Owned':
        actions.push({ key: 'force_open', label: t('lockers.actions.force_open'), variant: 'outline' });
        actions.push({ key: 'release', label: t('lockers.actions.release'), variant: 'outline' });
        actions.push({ key: 'block', label: t('lockers.actions.block'), variant: 'destructive' });
        break;
      case 'Blocked':
        actions.push({ key: 'unblock', label: t('lockers.actions.unblock'), variant: 'default' });
        break;
    }

    return actions;
  };

  return (
    <Card 
      className={cn(
        'relative transition-all duration-200 hover:shadow-md cursor-pointer',
        getStatusColor(locker.status),
        isOptimistic && 'opacity-75 animate-pulse',
        'min-h-[120px]'
      )}
      onClick={() => onClick?.(locker)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">
            {t('lockers.locker_number', { number: locker.id })}
          </CardTitle>
          <div className="flex items-center gap-1">
            {locker.is_vip && <Shield className="w-3 h-3 text-amber-600" />}
            {getStatusIcon(locker.status)}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        <div className="space-y-2">
          <Badge variant="outline" className="text-xs">
            {t(`lockers.status.${locker.status.toLowerCase()}`)}
          </Badge>
          
          {locker.owner_key && (
            <div className="text-xs text-muted-foreground truncate">
              {t('lockers.owner')}: {locker.owner_key.slice(-6)}
            </div>
          )}
          
          {locker.reserved_at && locker.status === 'Reserved' && (
            <div className="text-xs text-muted-foreground">
              {t('lockers.reserved_at')}: {new Date(locker.reserved_at).toLocaleTimeString()}
            </div>
          )}
          
          {locker.owned_at && locker.status === 'Owned' && (
            <div className="text-xs text-muted-foreground">
              {t('lockers.owned_at')}: {new Date(locker.owned_at).toLocaleTimeString()}
            </div>
          )}

          {onAction && (
            <div className="flex flex-wrap gap-1 mt-2">
              {getAvailableActions().map(action => (
                <Button
                  key={action.key}
                  size="sm"
                  variant={action.variant as any}
                  className="text-xs px-2 py-1 h-6"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAction(action.key);
                  }}
                  disabled={isActionLoading}
                >
                  {isActionLoading ? (
                    <RefreshCw className="w-3 h-3 animate-spin" />
                  ) : (
                    action.label
                  )}
                </Button>
              ))}
            </div>
          )}
        </div>
      </CardContent>
      
      {isOptimistic && (
        <div className="absolute top-1 right-1">
          <div className="w-2 h-2 bg-orange-400 rounded-full animate-pulse" />
        </div>
      )}
    </Card>
  );
};

export const LockerGrid: React.FC<LockerGridProps> = ({
  kioskId,
  showStats = true,
  showControls = true,
  onLockerClick,
  onLockerAction
}) => {
  const { t } = useI18n();
  const {
    lockers,
    isLoading,
    error,
    isConnected,
    isConnecting,
    reconnectAttempts,
    loadLockers,
    getKioskLockers,
    getLockerStats,
    performOptimisticUpdate,
  } = useLockerUpdates();

  const [selectedKiosk, setSelectedKiosk] = useState<string>(kioskId || '');

  // Get unique kiosk IDs for selection
  const kioskIds = useMemo(() => {
    const ids = new Set<string>();
    lockers.forEach(locker => ids.add(locker.kiosk_id));
    return Array.from(ids).sort();
  }, [lockers]);

  // Get lockers for display
  const displayLockers = useMemo(() => {
    if (selectedKiosk) {
      return getKioskLockers(selectedKiosk);
    }
    return lockers.sort((a, b) => {
      if (a.kiosk_id !== b.kiosk_id) {
        return a.kiosk_id.localeCompare(b.kiosk_id);
      }
      return a.id - b.id;
    });
  }, [lockers, selectedKiosk, getKioskLockers]);

  // Get statistics
  const stats = useMemo(() => getLockerStats(), [getLockerStats]);

  // Handle locker action with optimistic updates
  const handleLockerAction = useCallback(async (locker: LockerState, action: string): Promise<boolean> => {
    if (!onLockerAction) return false;

    // Determine expected new status for optimistic update
    let expectedStatus: LockerState['status'] | null = null;
    switch (action) {
      case 'block':
        expectedStatus = 'Blocked';
        break;
      case 'unblock':
        expectedStatus = 'Free';
        break;
      case 'release':
        expectedStatus = 'Free';
        break;
      case 'force_open':
        expectedStatus = 'Opening';
        break;
    }

    // Perform optimistic update if we can predict the outcome
    let optimisticUpdateId: string | null = null;
    if (expectedStatus) {
      optimisticUpdateId = performOptimisticUpdate(
        locker.kiosk_id,
        locker.id,
        expectedStatus,
        5000 // 5 second rollback timeout
      );
    }

    try {
      const success = await onLockerAction(locker, action);
      
      if (!success && optimisticUpdateId) {
        // Rollback optimistic update on failure
        loadLockers();
      }
      
      return success;
    } catch (error) {
      // Rollback optimistic update on error
      if (optimisticUpdateId) {
        loadLockers();
      }
      throw error;
    }
  }, [onLockerAction, performOptimisticUpdate, loadLockers]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="w-6 h-6 animate-spin mr-2" />
        {t('common.loading')}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <AlertCircle className="w-8 h-8 text-red-500 mb-2" />
        <p className="text-red-600 mb-4">{error}</p>
        <Button onClick={loadLockers} variant="outline">
          <RefreshCw className="w-4 h-4 mr-2" />
          {t('common.retry')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isConnected ? (
            <div className="flex items-center gap-2 text-green-600">
              <Wifi className="w-4 h-4" />
              <span className="text-sm">{t('lockers.connected')}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-red-600">
              <WifiOff className="w-4 h-4" />
              <span className="text-sm">
                {isConnecting 
                  ? t('lockers.connecting') 
                  : t('lockers.disconnected', { attempts: reconnectAttempts })
                }
              </span>
            </div>
          )}
        </div>

        {showControls && (
          <div className="flex items-center gap-2">
            {kioskIds.length > 1 && (
              <select
                value={selectedKiosk}
                onChange={(e) => setSelectedKiosk(e.target.value)}
                className="px-3 py-1 border rounded-md text-sm"
              >
                <option value="">{t('lockers.all_kiosks')}</option>
                {kioskIds.map(id => (
                  <option key={id} value={id}>{t('lockers.kiosk', { id })}</option>
                ))}
              </select>
            )}
            
            <Button onClick={loadLockers} variant="outline" size="sm">
              <RefreshCw className="w-4 h-4 mr-2" />
              {t('common.refresh')}
            </Button>
          </div>
        )}
      </div>

      {/* Statistics */}
      {showStats && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold">{stats.total}</div>
              <div className="text-sm text-muted-foreground">{t('lockers.stats.total')}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-green-600">{stats.free}</div>
              <div className="text-sm text-muted-foreground">{t('lockers.stats.free')}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-yellow-600">{stats.reserved}</div>
              <div className="text-sm text-muted-foreground">{t('lockers.stats.reserved')}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-blue-600">{stats.owned}</div>
              <div className="text-sm text-muted-foreground">{t('lockers.stats.owned')}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-red-600">{stats.blocked}</div>
              <div className="text-sm text-muted-foreground">{t('lockers.stats.blocked')}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-amber-600">{stats.vip}</div>
              <div className="text-sm text-muted-foreground">{t('lockers.stats.vip')}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Locker Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
        {displayLockers.map(locker => (
          <LockerCard
            key={`${locker.kiosk_id}:${locker.id}`}
            locker={locker}
            onClick={onLockerClick}
            onAction={showControls ? handleLockerAction : undefined}
          />
        ))}
      </div>

      {displayLockers.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          {selectedKiosk 
            ? t('lockers.no_lockers_kiosk', { kioskId: selectedKiosk })
            : t('lockers.no_lockers')
          }
        </div>
      )}
    </div>
  );
};