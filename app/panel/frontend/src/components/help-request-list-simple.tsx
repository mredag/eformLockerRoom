import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/hooks/useI18n';
import type { HelpRequest } from '@/hooks/useHelpRequests';
import { 
  MapPin, 
  AlertCircle,
  CheckCircle,
  Hash
} from 'lucide-react';

interface HelpRequestListSimpleProps {
  helpRequests: HelpRequest[];
  onResolve: (id: number) => Promise<void>;
}

export function HelpRequestListSimple({
  helpRequests,
  onResolve
}: HelpRequestListSimpleProps) {
  const { t } = useI18n();

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const formatTimeAgo = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMinutes < 1) return t('time.justNow');
    if (diffMinutes < 60) return t('time.minutesAgo', { count: diffMinutes });
    if (diffHours < 24) return t('time.hoursAgo', { count: diffHours });
    return t('time.daysAgo', { count: diffDays });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'resolved':
        return 'bg-green-100 text-green-800 border-green-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'open':
        return <AlertCircle className="h-4 w-4" />;
      case 'resolved':
        return <CheckCircle className="h-4 w-4" />;
      default:
        return null;
    }
  };

  if (helpRequests.length === 0) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-medium text-muted-foreground mb-2">
          {t('help.noRequests')}
        </h3>
      </div>
    );
  }

  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[80px]">{t('help.requestId')}</TableHead>
            <TableHead>{t('help.status')}</TableHead>
            <TableHead>{t('help.kioskId')}</TableHead>
            <TableHead>{t('help.lockerNumber')}</TableHead>
            <TableHead>{t('help.category')}</TableHead>
            <TableHead>{t('help.description')}</TableHead>
            <TableHead>{t('help.createdAt')}</TableHead>
            <TableHead className="w-[100px]">{t('common.actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {helpRequests.map((request) => (
            <TableRow key={request.id}>
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  <Hash className="h-4 w-4 text-muted-foreground" />
                  {request.id}
                </div>
              </TableCell>
              
              <TableCell>
                <Badge className={`${getStatusColor(request.status)} flex items-center gap-1 w-fit`}>
                  {getStatusIcon(request.status)}
                  {t(`help.statuses.${request.status}`)}
                </Badge>
              </TableCell>
              
              <TableCell>
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  {request.kiosk_id}
                </div>
              </TableCell>
              
              <TableCell>
                {request.locker_no ? (
                  <div className="flex items-center gap-2">
                    <Hash className="h-4 w-4 text-muted-foreground" />
                    {request.locker_no}
                  </div>
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </TableCell>
              
              <TableCell>
                <span className="text-sm">
                  {t(`help.categories.${request.category}`)}
                </span>
              </TableCell>
              
              <TableCell>
                {request.note ? (
                  <span className="text-sm">{request.note}</span>
                ) : (
                  <span className="text-muted-foreground text-sm">-</span>
                )}
              </TableCell>
              
              <TableCell>
                <div className="flex flex-col">
                  <span className="text-sm">{formatTimeAgo(request.created_at)}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(request.created_at)}
                  </span>
                </div>
              </TableCell>
              
              <TableCell>
                {request.status === 'open' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onResolve(request.id)}
                    className="flex items-center gap-2"
                  >
                    <CheckCircle className="h-4 w-4" />
                    {t('help.resolve')}
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}