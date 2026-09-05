'use client';

import { useState, useRef, useEffect } from 'react';
import { useLocation, type Location } from '@/context/LocationContext';

interface LocationSwitcherProps {
  compact?: boolean;
}

export function LocationSwitcher({ compact = false }: LocationSwitcherProps) {
  const { activeLocation, locations, loading, error, switchLocation } =
    useLocation();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSwitch = async (loc: Location) => {
    if (loc.id === activeLocation?.id || switching) return;
    setSwitching(true);
    try {
      const ok = await switchLocation(loc.id);
      if (ok) setOpen(false);
    } finally {
      setSwitching(false);
    }
  };

  if (loading) {
    return compact ? null : (
      <div className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
        <span>Loading locations...</span>
      </div>
    );
  }

  if (!activeLocation) {
    return compact ? null : (
      <div className="px-3 py-2 text-sm text-red-500">
        {error || 'No location assigned'}
      </div>
    );
  }

  if (locations.length <= 1) {
    return compact ? (
      <span className="text-xs text-gray-500">{activeLocation.name}</span>
    ) : (
      <div className="flex items-center gap-2 px-3 py-2 text-sm">
        <span className="h-2 w-2 rounded-full bg-green-500" />
        <span className="font-medium">{activeLocation.name}</span>
      </div>
    );
  }

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={switching}
        className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium shadow-sm transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700"
      >
        <span className="h-2 w-2 rounded-full bg-green-500" />
        <span>{activeLocation.name}</span>
        <svg
          className={`h-4 w-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
        {switching && (
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1 w-64 rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
          <div className="border-b border-gray-100 px-4 py-2 dark:border-gray-700">
            <p className="text-xs font-medium text-gray-400">Locations</p>
          </div>
          <div className="py-1">
            {locations.map((loc) => {
              const isActive = loc.id === activeLocation.id;
              return (
                <button
                  key={loc.id}
                  onClick={() => handleSwitch(loc)}
                  disabled={isActive || switching}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-sm transition ${
                    isActive
                      ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
                      : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700'
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      loc.status === 'ACTIVE' ? 'bg-green-500' : 'bg-yellow-500'
                    }`}
                  />
                  <div className="flex-1 text-left">
                    <div className="font-medium">{loc.name}</div>
                    <div className="text-xs text-gray-400">{loc.code}</div>
                  </div>
                  {isActive && (
                    <svg className="h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
          {error && (
            <div className="border-t border-gray-100 px-4 py-2 text-xs text-red-500 dark:border-gray-700">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
