'use client';

import { useState, useEffect, useRef } from 'react';

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
  const loadingStartTimeRef = useRef<number | null>(isLoading ? Date.now() : null);

  useEffect(() => {
    if (isLoading) {
      // Start loading - record the time
      loadingStartTimeRef.current = Date.now();
      setDisplayLoading(true);
      return;
    }

    const loadingStartTime = loadingStartTimeRef.current;
    if (loadingStartTime === null) {
      setDisplayLoading(false);
      return;
    }

    // Stop loading - but respect minimum duration
    const elapsed = Date.now() - loadingStartTime;
    const remaining = minDuration - elapsed;

    if (remaining > 0) {
      // Need to wait longer
      const timer = setTimeout(() => {
        setDisplayLoading(false);
        loadingStartTimeRef.current = null;
      }, remaining);
      return () => clearTimeout(timer);
    }

    // Already waited long enough
    setDisplayLoading(false);
    loadingStartTimeRef.current = null;
  }, [isLoading, minDuration]);

  return displayLoading;
}
