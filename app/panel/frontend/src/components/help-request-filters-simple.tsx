import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/hooks/useI18n';
import type { HelpRequestFilter } from '@/hooks/useHelpRequests';
import { Filter, X } from 'lucide-react';

interface HelpRequestFiltersSimpleProps {
  filter: HelpRequestFilter;
  onFilterChange: (filter: HelpRequestFilter) => void;
  onClearFilter: () => void;
}

export function HelpRequestFiltersSimple({
  filter,
  onFilterChange,
  onClearFilter
}: HelpRequestFiltersSimpleProps) {
  const { t } = useI18n();

  const handleStatusChange = (value: string) => {
    const newFilter = { ...filter };
    if (value === 'all') {
      delete newFilter.status;
    } else {
      newFilter.status = value as 'open' | 'resolved';
    }
    onFilterChange(newFilter);
  };

  const hasActiveFilters = Object.keys(filter).length > 0;

  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">{t('common.filter')}:</span>
      </div>

      {/* Status Filter */}
      <div className="min-w-[140px]">
        <Select
          value={filter.status || 'all'}
          onValueChange={handleStatusChange}
        >
          <SelectTrigger>
            <SelectValue placeholder={t('help.filterByStatus')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('common.all')}</SelectItem>
            <SelectItem value="open">{t('help.statuses.open')}</SelectItem>
            <SelectItem value="resolved">{t('help.statuses.resolved')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Clear Filters Button */}
      {hasActiveFilters && (
        <Button
          variant="outline"
          size="sm"
          onClick={onClearFilter}
          className="flex items-center gap-2"
        >
          <X className="h-4 w-4" />
          {t('common.clear')}
        </Button>
      )}
    </div>
  );
}