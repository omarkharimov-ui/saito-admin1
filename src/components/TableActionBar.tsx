'use client';

import { Search } from 'lucide-react';

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
  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <div className="relative flex-1">
        <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
        <input
          value={search} onChange={e => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-white/20 outline-none focus:border-[#D4AF37]/30 transition-colors"
        />
      </div>
      {filters && onFilterChange && (
        <div className="flex gap-2">
          {filters.map(f => (
            <button
              key={f.key}
              onClick={() => onFilterChange(filter === f.key ? null : f.key)}
              className={`px-3 py-2 rounded-xl text-xs font-bold tracking-wide transition-all ${
                filter === f.key
                  ? 'bg-white/10 text-white border border-white/15'
                  : 'text-white/30 hover:text-white/60 border border-transparent'
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
