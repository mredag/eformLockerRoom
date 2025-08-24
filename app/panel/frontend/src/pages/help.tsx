
import { Button } from '@/components/ui/button';
import { useI18n } from '@/hooks/useI18n';
import { useHelpRequests } from '@/hooks/useHelpRequests';
import { HelpStatisticsSimple } from '@/components/help-statistics-simple';
import { HelpRequestFiltersSimple } from '@/components/help-request-filters-simple';
import { HelpRequestListSimple } from '@/components/help-request-list-simple';
import { WebSocketStatus } from '@/components/websocket-status';
import { 
  RefreshCw, 
  AlertCircle, 
  Wifi, 
  WifiOff,
  Activity
} from 'lucide-react';

export function Help() {
  const { t } = useI18n();

  const {
    helpRequests,
    statistics,
    loading,
    error,
    filter,
    isConnected,
    connectionHealth,
    resolveHelpRequest,
    applyFilter,
    clearFilter,
    refresh,
    reconnect
  } = useHelpRequests();

  const handleResolveHelpRequest = async (id: number) => {
    await resolveHelpRequest(id);
  };

  const getConnectionStatusIcon = () => {
    if (!isConnected) return <WifiOff className="h-4 w-4 text-red-500" />;
    
    switch (connectionHealth) {
      case 'healthy':
        return <Wifi className="h-4 w-4 text-green-500" />;
      case 'degraded':
        return <Activity className="h-4 w-4 text-yellow-500" />;
      case 'unhealthy':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Wifi className="h-4 w-4 text-gray-500" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('help.title')}</h1>
          <p className="text-muted-foreground">
            {t('help.manageRequests')}
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          {/* WebSocket Status */}
          <div className="flex items-center gap-2">
            {getConnectionStatusIcon()}
            <span className="text-sm text-muted-foreground">
              {isConnected ? t('websocket.status.connected') : t('websocket.status.disconnected')}
            </span>
          </div>
          
          {/* Refresh Button */}
          <Button
            variant="outline"
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {t('common.refresh')}
          </Button>
          
          {/* Reconnect Button (shown when disconnected) */}
          {!isConnected && (
            <Button
              variant="outline"
              onClick={reconnect}
              className="flex items-center gap-2"
            >
              <Wifi className="h-4 w-4" />
              {t('common.reconnect')}
            </Button>
          )}
        </div>
      </div>

      {/* WebSocket Status Component */}
      <WebSocketStatus namespace="/ws/help" />

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <span className="text-red-800 font-medium">{t('common.error')}</span>
          </div>
          <p className="text-red-700 mt-1">{error}</p>
        </div>
      )}

      {/* Statistics */}
      <HelpStatisticsSimple statistics={statistics} loading={loading} />

      {/* Filters */}
      <HelpRequestFiltersSimple
        filter={filter}
        onFilterChange={applyFilter}
        onClearFilter={clearFilter}
      />

      {/* Help Request List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">
            {t('help.requests')} ({helpRequests.length})
          </h2>
        </div>

        {loading && helpRequests.length === 0 ? (
          <div className="text-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">{t('help.loadingRequests')}</p>
          </div>
        ) : (
          <HelpRequestListSimple
            helpRequests={helpRequests}
            onResolve={handleResolveHelpRequest}
          />
        )}
      </div>
    </div>
  );
}
