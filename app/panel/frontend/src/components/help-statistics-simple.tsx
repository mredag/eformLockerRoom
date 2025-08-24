import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useI18n } from '@/hooks/useI18n';
import type { HelpRequestStatistics } from '@/hooks/useHelpRequests';
import { 
  AlertCircle, 
  CheckCircle, 
  BarChart3
} from 'lucide-react';

interface HelpStatisticsSimpleProps {
  statistics: HelpRequestStatistics | null;
  loading: boolean;
}

export function HelpStatisticsSimple({ statistics, loading }: HelpStatisticsSimpleProps) {
  const { t } = useI18n();

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <div className="h-4 bg-muted animate-pulse rounded" />
            </CardHeader>
            <CardContent>
              <div className="h-8 bg-muted animate-pulse rounded mb-2" />
              <div className="h-3 bg-muted animate-pulse rounded w-2/3" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!statistics) {
    return null;
  }

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {/* Total Requests */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            {t('common.total')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{statistics.total}</div>
          <p className="text-xs text-muted-foreground">
            {t('help.requests')}
          </p>
        </CardContent>
      </Card>

      {/* Open Requests */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-500" />
            {t('help.statuses.open')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-red-600">{statistics.open}</div>
          <p className="text-xs text-muted-foreground">
            {statistics.total > 0 ? Math.round((statistics.open / statistics.total) * 100) : 0}% {t('common.ofTotal')}
          </p>
        </CardContent>
      </Card>

      {/* Resolved Requests */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-500" />
            {t('help.statuses.resolved')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-green-600">{statistics.resolved}</div>
          <p className="text-xs text-muted-foreground">
            {statistics.total > 0 ? Math.round((statistics.resolved / statistics.total) * 100) : 0}% {t('common.ofTotal')}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}