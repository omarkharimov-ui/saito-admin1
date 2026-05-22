'use client';

import React, { createContext, useContext, useRef, useEffect, useState, useCallback } from 'react';

interface FormDirtyContextType {
  registerField: (name: string, initialValue: any) => void;
  updateField: (name: string, value: any) => void;
  isDirty: boolean;
  resetDirty: () => void;
}

const FormDirtyContext = createContext<FormDirtyContextType | null>(null);

export const useFormDirty = () => {
  const context = useContext(FormDirtyContext);
  if (!context) {
    throw new Error('useFormDirty must be used within FormDirtyProvider');
  }
  return context;
};

export const useFormDirtyField = (name: string, initialValue: any) => {
  const context = useContext(FormDirtyContext);
  
  useEffect(() => {
    if (context) {
      context.registerField(name, initialValue);
    }
  }, [context, name]);

  const updateValue = useCallback((value: any) => {
    if (context) {
      context.updateField(name, value);
    }
  }, [context, name]);

  return { updateValue, isDirty: context?.isDirty ?? false };
};

interface FormDirtyProviderProps {
  children: React.ReactNode;
  onDirtyChange?: (isDirty: boolean) => void;
}

export const FormDirtyProvider: React.FC<FormDirtyProviderProps> = ({ 
  children, 
  onDirtyChange 
}) => {
  const initialValuesRef = useRef<Map<string, any>>(new Map());
  const currentValuesRef = useRef<Map<string, any>>(new Map());
  const [isDirty, setIsDirty] = useState(false);

  const registerField = useCallback((name: string, initialValue: any) => {
    if (!initialValuesRef.current.has(name)) {
      initialValuesRef.current.set(name, JSON.stringify(initialValue));
      currentValuesRef.current.set(name, JSON.stringify(initialValue));
    }
  }, []);

  const updateField = useCallback((name: string, value: any) => {
    const stringifiedValue = JSON.stringify(value);
    currentValuesRef.current.set(name, stringifiedValue);
    
    // Check if any field is dirty
    let dirty = false;
    for (const [fieldName, currentVal] of currentValuesRef.current.entries()) {
      const initialVal = initialValuesRef.current.get(fieldName);
      if (currentVal !== initialVal) {
        dirty = true;
        break;
      }
    }
    setIsDirty(dirty);
    onDirtyChange?.(dirty);
  }, [onDirtyChange]);

  const resetDirty = useCallback(() => {
    // Reset initial values to current values
    for (const [name, value] of currentValuesRef.current.entries()) {
      initialValuesRef.current.set(name, value);
    }
    setIsDirty(false);
    onDirtyChange?.(false);
  }, [onDirtyChange]);

  // Clear refs when unmounting
  useEffect(() => {
    return () => {
      initialValuesRef.current.clear();
      currentValuesRef.current.clear();
    };
  }, []);

  const value: FormDirtyContextType = {
    registerField,
    updateField,
    isDirty,
    resetDirty,
  };

  return (
    <FormDirtyContext.Provider value={value}>
      {children}
    </FormDirtyContext.Provider>
  );
};

// Hook to check dirty state without registering a field
export const useIsFormDirty = () => {
  const context = useContext(FormDirtyContext);
  return context?.isDirty ?? false;
};

export default FormDirtyContext;
