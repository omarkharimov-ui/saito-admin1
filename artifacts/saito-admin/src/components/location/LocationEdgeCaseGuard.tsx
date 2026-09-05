'use client';

import { useEffect, useRef } from 'react';
import { useLocation } from '@/context/LocationContext';

/**
 * Handles location edge cases:
 * - Location becomes INACTIVE while user is inside it
 * - Membership removed while session active
 * - Location archived
 *
 * On detection: refreshes context. If no valid location remains, shows error.
 */
export function LocationEdgeCaseGuard({ children }: { children: React.ReactNode }) {
  const { activeLocation, activeLocationId, locations, refresh, loading } = useLocation();
  const lastCheckRef = useRef(Date.now());

  useEffect(() => {
    if (!activeLocationId) return;

    const interval = setInterval(() => {
      if (Date.now() - lastCheckRef.current < 30_000) return;
      lastCheckRef.current = Date.now();

      const stillAccessible = locations.find((l) => l.id === activeLocationId);
      if (!stillAccessible || stillAccessible.status !== 'ACTIVE') {
        refresh();
      }
    }, 60_000);

    return () => clearInterval(interval);
  }, [activeLocationId, locations, refresh]);

  if (!loading && activeLocationId && !activeLocation) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="max-w-md rounded-xl border border-yellow-200 bg-white p-8 text-center shadow-lg dark:border-yellow-800 dark:bg-gray-800">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-yellow-100 dark:bg-yellow-900/30">
            <svg className="h-6 w-6 text-yellow-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
          </div>
          <h2 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
            Location Unavailable
          </h2>
          <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
            Your active location is no longer accessible. Please contact your administrator.
          </p>
          <button
            onClick={() => refresh()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
