'use client';

import { Search } from '@/components/ui/saito-icons';

interface FilterOption {
  key: string;
  label: string;
}

interface TableActionBarProps {
  search: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder?: string;
  filter?: string | null;
  filters?: FilterOption[];
  onFilterChange?: (f: string | null) => void;
  children?: React.ReactNode;
}

export function TableActionBar({
  search, onSearchChange, searchPlaceholder = 'Axtar...',
  filter, filters, onFilterChange, children,
}: TableActionBarProps) {
  // 13m: theme-var based (was dark-only white/25 + gold #D4AF37 — light-mode
  // bug) + pill filters with hover/active feedback (audit D15).
  return (
    <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
      <div className="relative flex-1">
        <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--theme-text-muted)] pointer-events-none" />
        <input
          value={search} onChange={e => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm bg-[var(--theme-surface)] border border-[var(--theme-border)] text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none focus:border-[var(--theme-text)]/40 transition-colors"
        />
      </div>
      {filters && onFilterChange && (
        <div className="flex flex-wrap gap-1.5">
          {filters.map(f => (
            <button
              key={f.key}
              onClick={() => onFilterChange(filter === f.key ? null : f.key)}
              className={`px-3.5 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider border transition-all active:scale-[0.97] ${
                filter === f.key
                  ? 'bg-[var(--theme-text)] text-[var(--theme-bg)] border-transparent'
                  : 'text-[var(--theme-text-muted)] border-[var(--theme-border)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-text)]/[0.05]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}
      {children}
    </div>
  );
}
