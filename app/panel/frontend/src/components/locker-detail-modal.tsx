import React, { useState, useEffect } from 'react';
import type { LockerState } from '../hooks/useLockerUpdates';
import { useI18n } from '../hooks/useI18n';
import { apiClient } from '../services/api-client';
import { useAuth } from '../contexts/auth-context';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogFooter 
} from './ui/dialog';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { 
  AlertCircle, 
  Lock, 
  Unlock, 
  Clock, 
  Shield, 
  Activity,
  RefreshCw,
  Zap,
  History,
  AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../lib/utils';

interface LockerDetailModalProps {
  locker: LockerState | null;
  isOpen: boolean;
  onClose: () => void;
  onLockerAction?: (locker: LockerState, action: string) => Promise<boolean>;
}

interface CommandHistoryEntry {
  id: number;
  command_id: string;
  kiosk_id: string;
  locker_id: number | null;
  command_type: string;
  issued_by: string;
  success: number | null;
  message: string | null;
  error: string | null;
  execution_time_ms: number | null;
  created_at: string;
}

interface RemoteCommandConfirmProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  commandType: string;
  lockerNumber: number;
  isExecuting: boolean;
}

const RemoteCommandConfirm: React.FC<RemoteCommandConfirmProps> = ({
  isOpen,
  onClose,
  onConfirm,
  commandType,
  lockerNumber,
  isExecuting
}) => {
  const { t } = useI18n();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            {t('lockers.remote_control.confirm_title')}
          </DialogTitle>
        </DialogHeader>
        
        <div className="py-4">
          <p className="text-sm text-muted-foreground mb-4">
            {t('lockers.remote_control.confirm_message', { 
              command: t(`lockers.remote_control.commands.${commandType}`),
              locker: lockerNumber 
            })}
          </p>
          
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-sm text-amber-800">
              {t('lockers.remote_control.warning')}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isExecuting}>
            {t('common.cancel')}
          </Button>
          <Button 
            onClick={onConfirm} 
            disabled={isExecuting}
            className="bg-red-600 hover:bg-red-700"
          >
            {isExecuting ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                {t('lockers.remote_control.executing')}
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 mr-2" />
                {t('lockers.remote_control.execute')}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const LockerDetailModal: React.FC<LockerDetailModalProps> = ({
  locker,
  isOpen,
  onClose,
  onLockerAction
}) => {
  const { t } = useI18n();
  const { user } = useAuth();
  const [commandHistory, setCommandHistory] = useState<CommandHistoryEntry[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [showRemoteConfirm, setShowRemoteConfirm] = useState(false);
  const [pendingCommand, setPendingCommand] = useState<string>('');
  const [isExecutingCommand, setIsExecutingCommand] = useState(false);

  // Load command history when modal opens
  useEffect(() => {
    if (isOpen && locker) {
      loadCommandHistory();
    }
  }, [isOpen, locker]);

  const loadCommandHistory = async () => {
    if (!locker) return;

    setIsLoadingHistory(true);
    try {
      const response = await apiClient.get(
        `/api/commands/history?kioskId=${locker.kiosk_id}&limit=10`
      );
      
      if (response.success) {
        // Filter commands for this specific locker
        const lockerCommands = response.data.filter(
          (cmd: CommandHistoryEntry) => cmd.locker_id === locker.id || cmd.locker_id === null
        );
        setCommandHistory(lockerCommands);
      }
    } catch (error) {
      console.error('Failed to load command history:', error);
      toast.error(t('lockers.remote_control.history_load_error'));
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const getStatusColor = (status: LockerState['status']) => {
    switch (status) {
      case 'Free':
        return 'text-green-600 bg-green-100';
      case 'Reserved':
        return 'text-yellow-600 bg-yellow-100';
      case 'Owned':
        return 'text-blue-600 bg-blue-100';
      case 'Opening':
        return 'text-purple-600 bg-purple-100';
      case 'Blocked':
        return 'text-red-600 bg-red-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusIcon = (status: LockerState['status']) => {
    switch (status) {
      case 'Free':
        return <Unlock className="w-5 h-5" />;
      case 'Reserved':
        return <Clock className="w-5 h-5" />;
      case 'Owned':
        return <Lock className="w-5 h-5" />;
      case 'Opening':
        return <Activity className="w-5 h-5 animate-pulse" />;
      case 'Blocked':
        return <AlertCircle className="w-5 h-5" />;
      default:
        return <AlertCircle className="w-5 h-5" />;
    }
  };

  const canExecuteRemoteCommands = () => {
    // Basic authorization check - user must be authenticated
    return !!user;
  };

  const getAvailableRemoteCommands = () => {
    if (!locker || !canExecuteRemoteCommands()) return [];

    const commands = [];
    
    // Remote open is available for owned or stuck lockers
    if (locker.status === 'Owned' || locker.status === 'Blocked') {
      commands.push({
        key: 'open',
        label: t('lockers.remote_control.commands.open'),
        icon: <Unlock className="w-4 h-4" />,
        variant: 'default' as const,
        description: t('lockers.remote_control.descriptions.open')
      });
    }

    // Reset command for any problematic locker
    if (locker.status !== 'Free') {
      commands.push({
        key: 'reset',
        label: t('lockers.remote_control.commands.reset'),
        icon: <RefreshCw className="w-4 h-4" />,
        variant: 'outline' as const,
        description: t('lockers.remote_control.descriptions.reset')
      });
    }

    return commands;
  };

  const handleRemoteCommand = (commandType: string) => {
    setPendingCommand(commandType);
    setShowRemoteConfirm(true);
  };

  const executeRemoteCommand = async () => {
    if (!locker || !pendingCommand) return;

    setIsExecutingCommand(true);
    try {
      const response = await apiClient.post('/api/commands/execute', {
        type: pendingCommand,
        kioskId: locker.kiosk_id,
        lockerId: locker.id,
        priority: 'normal'
      });

      if (response.success) {
        toast.success(
          response.result?.message || 
          t('lockers.remote_control.command_success', { 
            command: t(`lockers.remote_control.commands.${pendingCommand}`)
          })
        );
        
        // Refresh command history
        loadCommandHistory();
        
        // Call parent action handler if available
        if (onLockerAction) {
          await onLockerAction(locker, pendingCommand);
        }
      } else {
        toast.error(response.error || t('lockers.remote_control.command_error'));
      }
    } catch (error) {
      console.error('Remote command execution failed:', error);
      toast.error(t('lockers.remote_control.command_error'));
    } finally {
      setIsExecutingCommand(false);
      setShowRemoteConfirm(false);
      setPendingCommand('');
    }
  };

  const formatCommandStatus = (entry: CommandHistoryEntry) => {
    if (entry.success === null) {
      return { text: t('lockers.remote_control.status.queued'), color: 'text-yellow-600' };
    } else if (entry.success === 1) {
      return { text: t('lockers.remote_control.status.success'), color: 'text-green-600' };
    } else {
      return { text: t('lockers.remote_control.status.failed'), color: 'text-red-600' };
    }
  };

  if (!locker) return null;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {getStatusIcon(locker.status)}
              {t('lockers.detail.title', { number: locker.id })}
              <Badge className={cn('ml-2', getStatusColor(locker.status))}>
                {t(`lockers.status.${locker.status.toLowerCase()}`)}
              </Badge>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Basic Information */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Activity className="w-5 h-5" />
                  {t('lockers.detail.basic_info')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">
                      {t('lockers.detail.kiosk_id')}
                    </label>
                    <p className="text-sm">{locker.kiosk_id}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">
                      {t('lockers.detail.locker_number')}
                    </label>
                    <p className="text-sm">{locker.id}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">
                      {t('lockers.detail.status')}
                    </label>
                    <p className="text-sm">{t(`lockers.status.${locker.status.toLowerCase()}`)}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">
                      {t('lockers.detail.vip_status')}
                    </label>
                    <p className="text-sm flex items-center gap-1">
                      {locker.is_vip ? (
                        <>
                          <Shield className="w-4 h-4 text-amber-600" />
                          {t('lockers.detail.vip_yes')}
                        </>
                      ) : (
                        t('lockers.detail.vip_no')
                      )}
                    </p>
                  </div>
                </div>

                {locker.owner_key && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">
                      {t('lockers.detail.owner_key')}
                    </label>
                    <p className="text-sm font-mono">{locker.owner_key}</p>
                  </div>
                )}

                {locker.reserved_at && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">
                      {t('lockers.detail.reserved_at')}
                    </label>
                    <p className="text-sm">{new Date(locker.reserved_at).toLocaleString()}</p>
                  </div>
                )}

                {locker.owned_at && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">
                      {t('lockers.detail.owned_at')}
                    </label>
                    <p className="text-sm">{new Date(locker.owned_at).toLocaleString()}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Remote Control */}
            {canExecuteRemoteCommands() && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Zap className="w-5 h-5" />
                    {t('lockers.detail.remote_control')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      {t('lockers.detail.remote_control_description')}
                    </p>
                    
                    <div className="flex flex-wrap gap-2">
                      {getAvailableRemoteCommands().map(command => (
                        <Button
                          key={command.key}
                          variant={command.variant}
                          size="sm"
                          onClick={() => handleRemoteCommand(command.key)}
                          className="flex items-center gap-2"
                        >
                          {command.icon}
                          {command.label}
                        </Button>
                      ))}
                    </div>

                    {getAvailableRemoteCommands().length === 0 && (
                      <p className="text-sm text-muted-foreground italic">
                        {t('lockers.detail.no_remote_commands')}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Command History */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <History className="w-5 h-5" />
                  {t('lockers.detail.command_history')}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={loadCommandHistory}
                    disabled={isLoadingHistory}
                  >
                    <RefreshCw className={cn('w-4 h-4', isLoadingHistory && 'animate-spin')} />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoadingHistory ? (
                  <div className="flex items-center justify-center py-4">
                    <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                    {t('common.loading')}
                  </div>
                ) : commandHistory.length > 0 ? (
                  <div className="space-y-2">
                    {commandHistory.map(entry => {
                      const status = formatCommandStatus(entry);
                      return (
                        <div key={entry.id} className="border rounded-lg p-3 text-sm">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                {t(`lockers.remote_control.commands.${entry.command_type}`)}
                              </Badge>
                              <span className={cn('text-xs font-medium', status.color)}>
                                {status.text}
                              </span>
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {new Date(entry.created_at).toLocaleString()}
                            </span>
                          </div>
                          
                          <div className="text-xs text-muted-foreground">
                            {t('lockers.detail.issued_by')}: {entry.issued_by}
                          </div>
                          
                          {entry.message && (
                            <div className="text-xs text-green-700 mt-1">
                              {entry.message}
                            </div>
                          )}
                          
                          {entry.error && (
                            <div className="text-xs text-red-700 mt-1">
                              {entry.error}
                            </div>
                          )}
                          
                          {entry.execution_time_ms && (
                            <div className="text-xs text-muted-foreground mt-1">
                              {t('lockers.detail.execution_time')}: {entry.execution_time_ms}ms
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {t('lockers.detail.no_command_history')}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              {t('common.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remote Command Confirmation Dialog */}
      <RemoteCommandConfirm
        isOpen={showRemoteConfirm}
        onClose={() => {
          setShowRemoteConfirm(false);
          setPendingCommand('');
        }}
        onConfirm={executeRemoteCommand}
        commandType={pendingCommand}
        lockerNumber={locker.id}
        isExecuting={isExecutingCommand}
      />
    </>
  );
};