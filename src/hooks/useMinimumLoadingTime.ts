'use client';

import { useState, useEffect } from 'react';

/**
 * Hook to enforce minimum loading time
 * Prevents skeleton/loader from disappearing too quickly
 * @param isLoading Current loading state
 * @param minDuration Minimum milliseconds to show loading state (default: 600ms)
 * @returns Loading state that won't transition from true to false faster than minDuration
 */
export function useMinimumLoadingTime(
  isLoading: boolean,
  minDuration: number = 600
): boolean {
  const [displayLoading, setDisplayLoading] = useState(isLoading);
  const [loadingStartTime, setLoadingStartTime] = useState<number | null>(null);

  useEffect(() => {
    if (isLoading) {
      // Start loading - record the time
      setLoadingStartTime(Date.now());
      setDisplayLoading(true);
    } else if (displayLoading && loadingStartTime !== null) {
      // Stop loading - but respect minimum duration
      const elapsed = Date.now() - loadingStartTime;
      const remaining = minDuration - elapsed;

      if (remaining > 0) {
        // Need to wait longer
        const timer = setTimeout(() => {
          setDisplayLoading(false);
          setLoadingStartTime(null);
        }, remaining);
        return () => clearTimeout(timer);
      } else {
        // Already waited long enough
        setDisplayLoading(false);
        setLoadingStartTime(null);
      }
    }
  }, [isLoading, displayLoading, loadingStartTime, minDuration]);

  return displayLoading;
}
