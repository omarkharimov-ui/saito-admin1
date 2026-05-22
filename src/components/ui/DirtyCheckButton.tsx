'use client';

import React from 'react';
import { Loader2, Save } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import FormDirtyContext from '@/context/FormDirtyContext';

interface DirtyCheckButtonProps {
  /** Whether form is currently submitting/saving */
  isSubmitting?: boolean;
  /** Whether image is uploading */
  isUploading?: boolean;
  /** Additional disabled state */
  disabled?: boolean;
  /** Button text - defaults to translated 'save_changes' or 'add_product_btn' */
  children?: React.ReactNode;
  /** Additional CSS classes */
  className?: string;
  /** Variant style */
  variant?: 'gold' | 'outline' | 'ghost';
  /** Type of button */
  type?: 'button' | 'submit' | 'reset';
  /** Form id to associate with */
  form?: string;
  /** Full width button */
  fullWidth?: boolean;
  /** Loading text override */
  loadingText?: string;
  /** Click handler */
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  /** Icon to show when not loading */
  icon?: React.ReactNode;
  /** Whether to use dirty check logic. If false, acts as normal button */
  checkDirty?: boolean;
}

/**
 * Global Dirty Check Button Component
 * 
 * This button automatically checks if the form is dirty using FormDirtyContext.
 * When wrapped in FormDirtyProvider, it will be disabled and faded when no changes are made.
 * 
 * @example
 * <FormDirtyProvider>
 *   <form>
 *     <input onChange={(e) => updateField('name', e.target.value)} />
 *     <DirtyCheckButton isSubmitting={updating}>Yadda Saxla</DirtyCheckButton>
 *   </form>
 * </FormDirtyProvider>
 */
export const DirtyCheckButton: React.FC<DirtyCheckButtonProps> = ({
  isSubmitting = false,
  isUploading = false,
  disabled = false,
  children,
  className = '',
  variant = 'gold',
  type = 'submit',
  form,
  fullWidth = false,
  loadingText,
  onClick,
  icon,
  checkDirty = true,
}) => {
  const { t } = useLanguage();
  const formDirtyContext = React.useContext(FormDirtyContext);
  
  // Determine if we should apply dirty checking
  const hasDirtyContext = formDirtyContext !== null && checkDirty;
  const isDirty = hasDirtyContext ? formDirtyContext.isDirty : true; // Default to true (enabled) if no context
  
  // Button is disabled when: submitting, uploading, explicitly disabled, or not dirty
  const isDisabled = isSubmitting || isUploading || disabled || (hasDirtyContext && !isDirty);
  
  // Base classes for different variants
  const variantClasses = {
    gold: 'bg-gradient-to-r from-gold via-[#E7C85A] to-gold text-black hover:brightness-110 shadow-lg shadow-gold/10',
    outline: 'bg-white/5 text-gold border border-gold/30',
    ghost: 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white border border-white/10',
  };

  const baseClasses = `
    ${variantClasses[variant]}
    ${fullWidth ? 'w-full flex-1' : ''}
    py-3 px-6 rounded-xl font-bold tracking-[0.25em] text-[11px] uppercase
    transition-all duration-200 flex items-center justify-center gap-3
    disabled:opacity-50 disabled:cursor-not-allowed
    ${hasDirtyContext && !isDirty && !isSubmitting ? 'opacity-40 pointer-events-none' : ''}
    ${className}
  `;

  return (
    <button
      type={type}
      form={form}
      disabled={isDisabled}
      onClick={onClick}
      className={baseClasses}
    >
      {isSubmitting ? (
        <>
          <Loader2 className="animate-spin" size={18} />
          {loadingText || children}
        </>
      ) : (
        <>
          {icon || <Save size={18} />}
          {children || t('save_changes')}
        </>
      )}
    </button>
  );
};

export default DirtyCheckButton;
