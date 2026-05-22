'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { FormDirtyProvider } from '@/context/FormDirtyContext';
import { DirtyCheckButton } from './DirtyCheckButton';

interface DirtyFormWrapperProps {
  /** Form children */
  children: React.ReactNode;
  /** Initial form values object */
  initialValues: Record<string, any>;
  /** Current form values object */
  currentValues: Record<string, any>;
  /** Whether to use context-based tracking (false = uses internal comparison) */
  useContextTracking?: boolean;
  /** Dependencies that trigger initial value recapture (e.g., [open, editingId]) */
  captureDeps?: React.DependencyList;
  /** Callback when dirty state changes */
  onDirtyChange?: (isDirty: boolean) => void;
  /** Delay before capturing initial values (ms) */
  captureDelay?: number;
}

/**
 * DirtyFormWrapper - Auto-detects form changes
 * 
 * Wraps children with dirty checking logic. Can work in two modes:
 * 1. Internal comparison mode (default): Compares initialValues with currentValues
 * 2. Context mode: Provides FormDirtyContext for child components
 * 
 * @example
 * <DirtyFormWrapper
 *   initialValues={{ name: 'Lahmacun', price: 5 }}
 *   currentValues={form}
 *   captureDeps={[isModalOpen, editingProduct?.id]}
 *   onDirtyChange={(dirty) => console.log('Dirty:', dirty)}
 * >
 *   <form>
 *     <input value={form.name} onChange={...} />
 *     <DirtyCheckButton isSubmitting={updating}>Yadda Saxla</DirtyCheckButton>
 *   </form>
 * </DirtyFormWrapper>
 */
export const DirtyFormWrapper: React.FC<DirtyFormWrapperProps> = ({
  children,
  initialValues,
  currentValues,
  useContextTracking = false,
  captureDeps = [],
  onDirtyChange,
  captureDelay = 50,
}) => {
  const initialValuesRef = useRef<string>('');
  const [isDirty, setIsDirty] = useState(false);
  const hasCaptured = useRef(false);
  const lastDepsString = useRef<string>('');

  // Capture initial values when dependencies change
  useEffect(() => {
    const depsString = JSON.stringify(captureDeps);
    
    // Only recapture if dependencies actually changed
    if (lastDepsString.current !== depsString) {
      lastDepsString.current = depsString;
      hasCaptured.current = false;
    }

    if (!hasCaptured.current) {
      const timeout = setTimeout(() => {
        initialValuesRef.current = JSON.stringify(initialValues);
        hasCaptured.current = true;
        setIsDirty(false);
        onDirtyChange?.(false);
      }, captureDelay);
      return () => clearTimeout(timeout);
    }
  }, [captureDeps, initialValues, captureDelay, onDirtyChange]);

  // Check dirty state
  useEffect(() => {
    if (!hasCaptured.current) return;

    const currentStringified = JSON.stringify(currentValues);
    const newIsDirty = currentStringified !== initialValuesRef.current;

    if (newIsDirty !== isDirty) {
      setIsDirty(newIsDirty);
      onDirtyChange?.(newIsDirty);
    }
  }, [currentValues, isDirty, onDirtyChange]);

  // Context-based tracking
  if (useContextTracking) {
    return (
      <FormDirtyProvider onDirtyChange={onDirtyChange}>
        {children}
      </FormDirtyProvider>
    );
  }

  // Provide isDirty via a div data attribute for CSS targeting if needed
  return (
    <div data-form-dirty={isDirty} data-form-dirty-captured={hasCaptured.current}>
      {children}
    </div>
  );
};

/**
 * Combined form wrapper with built-in dirty checking and submit button
 * Provides a complete solution with minimal configuration
 */
interface SmartFormProps extends Omit<DirtyFormWrapperProps, 'children'> {
  /** Form element */
  children: React.ReactNode;
  /** Submit handler */
  onSubmit: (e: React.FormEvent) => void;
  /** Whether form is submitting */
  isSubmitting?: boolean;
  /** Whether image is uploading */
  isUploading?: boolean;
  /** Submit button text */
  submitText?: string;
  /** Cancel button text */
  cancelText?: string;
  /** Cancel handler */
  onCancel?: () => void;
  /** Form ID */
  formId?: string;
  /** Additional form classes */
  formClassName?: string;
  /** Button variant */
  buttonVariant?: 'gold' | 'outline' | 'ghost';
  /** Button alignment */
  buttonAlign?: 'left' | 'right' | 'center' | 'full';
  /** Show cancel button */
  showCancel?: boolean;
  /** Custom button icon */
  buttonIcon?: React.ReactNode;
}

export const SmartForm: React.FC<SmartFormProps> = ({
  children,
  onSubmit,
  isSubmitting = false,
  isUploading = false,
  submitText,
  cancelText,
  onCancel,
  formId = 'smart-form',
  formClassName = '',
  buttonVariant = 'gold',
  buttonAlign = 'right',
  showCancel = true,
  buttonIcon,
  initialValues,
  currentValues,
  captureDeps = [],
  captureDelay = 50,
}) => {
  const [isDirty, setIsDirty] = useState(false);

  const handleDirtyChange = useCallback((dirty: boolean) => {
    setIsDirty(dirty);
  }, []);

  const buttonContainerClasses = {
    left: 'justify-start',
    right: 'justify-end',
    center: 'justify-center',
    full: '',
  };

  return (
    <DirtyFormWrapper
      initialValues={initialValues}
      currentValues={currentValues}
      captureDeps={captureDeps}
      onDirtyChange={handleDirtyChange}
      captureDelay={captureDelay}
    >
      <form id={formId} onSubmit={onSubmit} className={formClassName}>
        {children}
        
        <div className={`flex items-center gap-3 pt-4 ${buttonContainerClasses[buttonAlign]} ${buttonAlign === 'full' ? 'flex-col' : ''}`}>
          {showCancel && onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className="px-8 py-3.5 rounded-xl bg-white/5 text-white/40 border border-white/10 hover:bg-white/10 hover:text-white text-[10px] font-bold tracking-wide uppercase whitespace-nowrap transition-all duration-200 disabled:opacity-50"
            >
              {cancelText || 'LƏĞV ET'}
            </button>
          )}
          
          <DirtyCheckButton
            type="submit"
            form={formId}
            isSubmitting={isSubmitting}
            isUploading={isUploading}
            disabled={!isDirty}
            variant={buttonVariant}
            fullWidth={buttonAlign === 'full'}
            icon={buttonIcon}
            checkDirty={false} // We handle dirty check externally in this component
            className={buttonAlign === 'full' ? 'w-full' : ''}
          >
            {submitText}
          </DirtyCheckButton>
        </div>
      </form>
    </DirtyFormWrapper>
  );
};

export default DirtyFormWrapper;
