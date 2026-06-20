'use client';

import { useRef, useEffect, useState, useCallback } from 'react';

/**
 * Hook to compare initial and current form values to determine if form is dirty
 * 
 * @param currentValues - Current form values object
 * @param options - Configuration options
 * @returns Object with isDirty state and utility functions
 * 
 * @example
 * const [form, setForm] = useState({ name: '', price: '' });
 * const { isDirty, trackChange, resetDirty } = useFormDirty(form);
 * 
 * // In input onChange:
 * <input onChange={(e) => trackChange('name', e.target.value, setForm({...form, name: e.target.value}))} />
 * 
 * // Button:
 * <button disabled={!isDirty}>Save</button>
 */
export function useFormDirty<T extends Record<string, any>>(
  currentValues: T,
  options?: {
    /** Whether to enable dirty checking */
    enabled?: boolean;
    /** Callback when dirty state changes */
    onDirtyChange?: (isDirty: boolean) => void;
    /** Custom comparison function */
    compareFn?: (a: any, b: any) => boolean;
    /** Fields to exclude from comparison */
    excludeFields?: string[];
    /** Only track these fields */
    includeFields?: string[];
  }
) {
  const { 
    enabled = true, 
    onDirtyChange, 
    compareFn,
    excludeFields = [],
    includeFields,
  } = options || {};

  const initialValuesRef = useRef<string>('');
  const [isDirty, setIsDirty] = useState(false);
  const hasCapturedInitial = useRef(false);

  // Capture initial values on first render
  useEffect(() => {
    if (enabled && !hasCapturedInitial.current) {
      initialValuesRef.current = JSON.stringify(currentValues);
      hasCapturedInitial.current = true;
    }
  }, [enabled]);

  // Compare current values with initial values
  useEffect(() => {
    if (!enabled || !hasCapturedInitial.current) return;

    let valuesToCompare = currentValues;
    
    // Filter fields if includeFields or excludeFields specified
    if (includeFields || excludeFields.length > 0) {
      valuesToCompare = {} as T;
      const keys = includeFields || Object.keys(currentValues);
      
      for (const key of keys) {
        if (!excludeFields.includes(key)) {
          (valuesToCompare as any)[key] = currentValues[key];
        }
      }
    }

    const currentStringified = JSON.stringify(valuesToCompare);
    const newIsDirty = currentStringified !== initialValuesRef.current;
    
    if (newIsDirty !== isDirty) {
      setIsDirty(newIsDirty);
      onDirtyChange?.(newIsDirty);
    }
  }, [currentValues, enabled, isDirty, onDirtyChange, compareFn, excludeFields, includeFields]);

  /**
   * Manually set dirty state
   */
  const setDirty = useCallback((dirty: boolean) => {
    setIsDirty(dirty);
    onDirtyChange?.(dirty);
  }, [onDirtyChange]);

  /**
   * Reset dirty state - updates initial values to current values
   */
  const resetDirty = useCallback(() => {
    initialValuesRef.current = JSON.stringify(currentValues);
    setIsDirty(false);
    onDirtyChange?.(false);
  }, [currentValues, onDirtyChange]);

  /**
   * Force recapture initial values (useful when form data is reloaded)
   */
  const recaptureInitial = useCallback(() => {
    initialValuesRef.current = JSON.stringify(currentValues);
    hasCapturedInitial.current = true;
    setIsDirty(false);
  }, [currentValues]);

  /**
   * Track a field change with optional callback
   */
  const trackChange = useCallback(<K extends keyof T>(
    field: K,
    value: T[K],
    callback?: () => void
  ) => {
    callback?.();
  }, []);

  return {
    isDirty,
    setDirty,
    resetDirty,
    recaptureInitial,
    trackChange,
    hasCapturedInitial: hasCapturedInitial.current,
  };
}

/**
 * Simpler hook that captures initial values when dependencies change
 * Useful for modals where initial values change when different item is selected
 * 
 * @example
 * const { isDirty, resetDirty } = useFormDirtyCompare(form, [open, editingProduct?.id]);
 */
export function useFormDirtyCompare<T extends Record<string, any>>(
  currentValues: T,
  captureDeps: React.DependencyList = [],
  options?: {
    enabled?: boolean;
    onDirtyChange?: (isDirty: boolean) => void;
  }
) {
  const { enabled = true, onDirtyChange } = options || {};
  
  const initialValuesRef = useRef<string>('');
  const [isDirty, setIsDirty] = useState(false);
  // Capture initial values when dependencies change
  useEffect(() => {
    if (enabled) {
      // Small delay to ensure form values are settled
      const timeout = setTimeout(() => {
        initialValuesRef.current = JSON.stringify(currentValues);
        setIsDirty(false);
      }, 0);
      return () => clearTimeout(timeout);
    }
  }, captureDeps);

  // Check dirty state when values change
  useEffect(() => {
    if (!enabled) return;
    
    const currentStringified = JSON.stringify(currentValues);
    const newIsDirty = currentStringified !== initialValuesRef.current;
    
    if (newIsDirty !== isDirty) {
      setIsDirty(newIsDirty);
      onDirtyChange?.(newIsDirty);
    }
  }, [currentValues, enabled]);

  const resetDirty = useCallback(() => {
    initialValuesRef.current = JSON.stringify(currentValues);
    setIsDirty(false);
    onDirtyChange?.(false);
  }, [currentValues, onDirtyChange]);

  const recaptureInitial = useCallback(() => {
    initialValuesRef.current = JSON.stringify(currentValues);
    setIsDirty(false);
  }, [currentValues]);

  return {
    isDirty,
    setIsDirty,
    resetDirty,
    recaptureInitial,
    initialValues: initialValuesRef.current ? JSON.parse(initialValuesRef.current) : {},
  };
}

/**
 * Hook specifically designed for modal forms
 * Automatically captures initial values when modal opens and when editing item changes
 * 
 * @param excludeFields - Array of field keys to exclude from dirty check (e.g., ['category'] for new products)
 */
export function useModalFormDirty<T extends Record<string, any>>(
  currentValues: T,
  isOpen: boolean,
  editingItemId?: string | number | null,
  excludeFields: (keyof T)[] = []
) {
  const initialValuesRef = useRef<string>('');
  const [isDirty, setIsDirty] = useState(false);
  const lastEditingId = useRef<string | number | undefined>(undefined);
  const hasCaptured = useRef(false);
  
  // Filter out excluded fields for comparison
  const filterExcluded = useCallback((values: T) => {
    if (excludeFields.length === 0) return values;
    const filtered = { ...values };
    excludeFields.forEach(field => delete filtered[field]);
    return filtered;
  }, [excludeFields]);
  
  const currentValuesString = JSON.stringify(filterExcluded(currentValues));
  const captureTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const openCount = useRef(0);

  // Capture initial values when modal opens or editing item changes
  useEffect(() => {
    if (isOpen) {
      // Check if this is a different item or first open
      // Also recapture if we were closed and opened again (openCount changes)
      const isNewOpen = openCount.current === 0;
      const isDifferentItem = lastEditingId.current !== editingItemId;
      
      if (isNewOpen || isDifferentItem || !hasCaptured.current) {
        lastEditingId.current = editingItemId ?? undefined;
        hasCaptured.current = true;
        openCount.current++;
        
        // Clear any pending capture
        if (captureTimeoutRef.current) {
          clearTimeout(captureTimeoutRef.current);
        }
        
        // Wait for form values to settle (especially important for new products)
        captureTimeoutRef.current = setTimeout(() => {
          initialValuesRef.current = JSON.stringify(filterExcluded(currentValues));
          setIsDirty(false);
        }, 100);
      }
    } else {
      // Reset when modal closes
      hasCaptured.current = false;
      openCount.current = 0;
      if (captureTimeoutRef.current) {
        clearTimeout(captureTimeoutRef.current);
      }
    }
    
    return () => {
      if (captureTimeoutRef.current) {
        clearTimeout(captureTimeoutRef.current);
      }
    };
  }, [isOpen, editingItemId, filterExcluded, currentValues]);

  // Check dirty state whenever values change
  useEffect(() => {
    if (!isOpen || !hasCaptured.current) return;
    
    const newIsDirty = currentValuesString !== initialValuesRef.current;
    
    if (newIsDirty !== isDirty) {
      setIsDirty(newIsDirty);
    }
  }, [currentValuesString, isOpen, isDirty]);

  const resetDirty = useCallback(() => {
    initialValuesRef.current = JSON.stringify(currentValues);
    setIsDirty(false);
  }, [currentValues]);

  return {
    isDirty,
    setIsDirty,
    resetDirty,
    isEnabled: isOpen,
  };
}

export default useFormDirty;
