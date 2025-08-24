import { useState, useCallback } from 'react';
import { LockerGrid } from '../components/locker-grid';
import { LockerDetailModal } from '../components/locker-detail-modal';
import type { LockerState } from '../hooks/useLockerUpdates';
import { useI18n } from '../hooks/useI18n';
import { apiClient } from '../services/api-client';
import { toast } from 'sonner';

export function Lockers() {
  const { t } = useI18n();
  const [selectedLocker, setSelectedLocker] = useState<LockerState | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Handle locker click for details view
  const handleLockerClick = useCallback((locker: LockerState) => {
    setSelectedLocker(locker);
    setIsDetailModalOpen(true);
  }, []);

  // Handle locker actions
  const handleLockerAction = useCallback(async (locker: LockerState, action: string): Promise<boolean> => {
    try {
      const response = await apiClient.post(
        `/api/kiosks/${locker.kiosk_id}/lockers/${locker.id}/action`,
        {
          action,
          staffUser: 'current_user', // TODO: Get from auth context
          reason: `Manual ${action} from panel`
        }
      );

      if (response.data.success) {
        toast.success(response.data.message || t(`lockers.actions.${action}_success`));
        return true;
      } else {
        toast.error(response.data.error || t(`lockers.actions.${action}_error`));
        return false;
      }
    } catch (error) {
      console.error('Error performing locker action:', error);
      toast.error(t('errors.serverError'));
      return false;
    }
  }, [t]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('lockers.title')}</h1>
        <p className="text-muted-foreground">
          {t('navigation.lockers')} - Real-time locker status and control interface.
        </p>
      </div>

      <LockerGrid
        showStats={true}
        showControls={true}
        onLockerClick={handleLockerClick}
        onLockerAction={handleLockerAction}
      />

      {/* Locker Detail Modal */}
      <LockerDetailModal
        locker={selectedLocker}
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedLocker(null);
        }}
        onLockerAction={handleLockerAction}
      />
    </div>
  );
}
