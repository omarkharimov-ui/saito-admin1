'use client';

import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from 'react';
import type { StaffProfile, StaffApp } from '../lib/staffTypes';

const StaffAppContext = createContext<StaffApp>({
  profile: null,
  loading: true,
  error: null,
  refresh: async () => {},
});

export function StaffAppProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/staff/me', { cache: 'no-store' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed to load profile');
        setLoading(false);
        return;
      }
      const data = await res.json();
      setProfile(data);
      setError(null);
    } catch (e: any) {
      setError(e.message || 'Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <StaffAppContext.Provider value={{ profile, loading, error, refresh }}>
      {children}
    </StaffAppContext.Provider>
  );
}

export const useStaffApp = () => useContext(StaffAppContext);
