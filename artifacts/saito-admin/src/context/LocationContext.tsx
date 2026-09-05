'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';

export interface Location {
  id: string;
  name: string;
  code: string;
  slug: string;
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  is_primary: boolean;
}

export interface LocationContextValue {
  activeLocation: Location | null;
  activeLocationId: string | null;
  locations: Location[];
  loading: boolean;
  error: string | null;
  switchLocation: (locationId: string) => Promise<boolean>;
  refresh: () => Promise<void>;
}

const LocationContext = createContext<LocationContextValue | null>(null);

export function useLocation(): LocationContextValue {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error('useLocation must be used within LocationProvider');
  return ctx;
}

export function LocationProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [activeLocation, setActiveLocation] = useState<Location | null>(null);
  const [activeLocationId, setActiveLocationId] = useState<string | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchContext = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch('/api/locations/context');
      if (!res.ok) {
        if (res.status === 401) {
          router.replace('/login');
          return;
        }
        throw new Error(`Failed to load location context (${res.status})`);
      }
      const data = await res.json();
      if (!mountedRef.current) return;

      const locs: Location[] = data.accessible_locations ?? [];
      setLocations(locs);
      setActiveLocationId(data.active_location_id ?? null);
      setActiveLocation(
        locs.find((l) => l.id === data.active_location_id) ?? null
      );
    } catch (e: any) {
      if (!mountedRef.current) return;
      setError(e.message || 'Failed to load location context');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchContext();
  }, [fetchContext]);

  const switchLocation = useCallback(
    async (locationId: string): Promise<boolean> => {
      if (locationId === activeLocationId) return true;

      setError(null);
      try {
        const res = await fetch('/api/locations/switch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ location_id: locationId }),
        });

        const data = await res.json();
        if (!res.ok) {
          setError(data.error || 'Failed to switch location');
          return false;
        }

        if (!mountedRef.current) return false;

        const locs: Location[] = data.accessible_locations ?? [];
        setLocations(locs);
        setActiveLocationId(data.active_location_id);
        setActiveLocation(
          locs.find((l) => l.id === data.active_location_id) ?? null
        );

        router.refresh();
        return true;
      } catch (e: any) {
        if (!mountedRef.current) return false;
        setError(e.message || 'Failed to switch location');
        return false;
      }
    },
    [activeLocationId, router]
  );

  const value: LocationContextValue = {
    activeLocation,
    activeLocationId,
    locations,
    loading,
    error,
    switchLocation,
    refresh: fetchContext,
  };

  return (
    <LocationContext.Provider value={value}>
      {children}
    </LocationContext.Provider>
  );
}
