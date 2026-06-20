'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { Plus, Edit3, Trash2, Loader2, Tag, X, Save } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useTheme } from '@/lib/theme/ThemeContext';
import { useModalFormDirty } from '@/hooks/useFormDirty';
import { Category } from '@/types';

interface CategoryForm {
  id: string;
  name: string;
  slug: string;
  image_url: string;
}

interface ProductCategoryModalProps {
  open: boolean;
  categories: Category[];
  categoryForm: CategoryForm;
  catNameError: boolean;
  updating: boolean;
  onClose: () => void;
  onFormChange: (form: CategoryForm) => void;
  onCatNameErrorChange: (v: boolean) => void;
  onSubmit: (e: React.FormEvent) => void;
  onEditCategory: (cat: Category) => void;
  onDeleteCategory: (id: string, name: string) => void;
  getCategoryName: (cat: Category) => string;
}

const toSlug = (s: string) => s.toLowerCase()
  .replace(/ə/g, 'e').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/i̇/g, 'i')
  .replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ç/g, 'c')
  .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

export function ProductCategoryModal({
  open, categories, categoryForm, catNameError, updating,
  onClose, onFormChange, onCatNameErrorChange, onSubmit,
  onEditCategory, onDeleteCategory, getCategoryName,
}: ProductCategoryModalProps) {
  const { t, language } = useLanguage();
  const { lightMode } = useTheme();
  const [slugManuallyEdited, setSlugManuallyEdited] = React.useState(false);

  // Use global hook for dirty checking
  const { isDirty: _isDirty } = useModalFormDirty(categoryForm, open, categoryForm.id);
  // For new categories (no id), enable save whenever name is filled
  const isDirty = categoryForm.id ? _isDirty : categoryForm.name.trim().length > 0;

  React.useEffect(() => { setSlugManuallyEdited(false); }, [categoryForm.id]);

  const emptyForm: CategoryForm = { id: '', name: '', slug: '', image_url: '' };

  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} onClick={onClose} className="absolute inset-0 bg-black/55 backdrop-blur-sm" />
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 30 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 30 }} transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
            className="relative w-full max-w-full sm:max-w-3xl backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden max-h-[90vh] flex flex-col"
            style={{ background: 'var(--theme-surface-muted)', border: '1px solid var(--theme-border)' }}
          >
            <div className="px-8 md:px-12 pt-7 pb-5 border-b border-[var(--theme-border)] flex items-center justify-between shrink-0 bg-[var(--theme-surface-soft)]">
              <div>
                <h2 className="text-2xl font-serif font-bold tracking-tight text-white">{t('category_management')}</h2>
                <p className="text-[10px] text-white/50 uppercase tracking-[0.4em] mt-0.5">{t('saito_menu_architecture')}</p>
              </div>
              <div className="flex items-center gap-2.5">
                <button onClick={() => onFormChange(emptyForm)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gold/[0.06] text-gold/70 border border-gold/20 text-[10px] font-bold tracking-widest uppercase transition-transform duration-200 hover:bg-gold/[0.12] hover:text-gold hover:border-gold/40">
                  <Plus size={13} /> {t('new_category_btn')}
                </button>
                <button onClick={onClose} className="w-9 h-9 rounded-xl bg-[var(--theme-surface-soft)] hover:bg-[var(--theme-surface)] border border-[var(--theme-border)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] flex items-center justify-center transition-transform duration-200">
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-0 flex-1 overflow-hidden">
              {/* Left: Form */}
              <div className="relative px-8 md:px-12 py-7 border-r border-[var(--theme-border)] overflow-y-auto">
                <div className="absolute bottom-0 left-0 w-40 h-40 bg-[var(--theme-surface-soft)] rounded-full blur-3xl pointer-events-none" />
                <h3 className="text-[9px] uppercase tracking-[0.3em] text-[var(--theme-text-muted)] font-bold mb-5 relative">{categoryForm.id ? t('edit_category') : t('new_category_create')}</h3>
                <form noValidate onSubmit={onSubmit} className="space-y-4 relative">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] uppercase tracking-widest text-[var(--theme-text-muted)]">{t('category_name_label')}</label>
                      <span className={`text-[9px] font-mono transition-colors duration-300 ${categoryForm.name.length > 25 ? 'text-[var(--theme-text-secondary)]' : 'text-[var(--theme-text-muted)]'}`}>{categoryForm.name.length}/30</span>
                    </div>
                    <input
                      type="text" maxLength={30} value={categoryForm.name}
                      onChange={(e) => {
                        const name = e.target.value;
                        const patch: CategoryForm = { ...categoryForm, name };
                        if (!slugManuallyEdited) patch.slug = toSlug(name);
                        onFormChange(patch);
                        if (catNameError) onCatNameErrorChange(false);
                      }}
                      onBlur={async (e) => {
                        const val = e.target.value.trim();
                        if (!val) return;
                        const titleCased = val.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                        const applyName = (corrected: string) => {
                          const patch: CategoryForm = { ...categoryForm, name: corrected };
                          if (!slugManuallyEdited) patch.slug = toSlug(corrected);
                          onFormChange(patch);
                        };
                        if (titleCased !== val) applyName(titleCased);
                        try {
                          const res = await fetch('/api/correct-name', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: titleCased, language }) });
                          if (res.ok) {
                            const data = await res.json();
                            if (data.corrected && data.corrected !== titleCased) applyName(data.corrected);
                          }
                        } catch { /* silent */ }
                      }}
                      className={`w-full bg-white/[0.07] border rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/30 outline-none transition-all ${catNameError ? 'border-red-500/70 focus:border-red-400' : 'border-white/[0.12] focus:border-white/35'}`}
                      placeholder={t('example') + ': Rolls'}
                    />
                    {catNameError && <p className="text-[10px] text-red-400 mt-1">{t('category_name_label')} {t('required')}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase tracking-widest text-[var(--theme-text-muted)]">Slug {t('optional')}</label>
                    <input type="text" value={categoryForm.slug} onChange={(e) => { setSlugManuallyEdited(true); onFormChange({ ...categoryForm, slug: e.target.value }); }}
                      className="w-full bg-[var(--theme-surface)] border border-[var(--theme-border)] rounded-xl px-4 py-3 text-sm text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] focus:border-[var(--theme-border-strong)] outline-none transition-all"
                      placeholder={t('slug_example')} />
                  </div>
                  <div className="flex gap-2 pt-1">
                    {categoryForm.id && (
                      <button type="button" onClick={() => onFormChange(emptyForm)}
                        className="shrink-0 px-4 py-2.5 rounded-xl bg-[var(--theme-surface-muted)] text-[var(--theme-text-secondary)] border border-[var(--theme-border)] hover:bg-[var(--theme-surface-hover)] hover:text-[var(--theme-text-primary)] text-[10px] font-bold tracking-wide uppercase whitespace-nowrap transition-all transition-premium">
                        {t('cancel')}
                      </button>
                    )}
                    <button type="submit" disabled={updating || !isDirty}
                      className={`shrink-0 px-5 py-2.5 rounded-xl bg-gradient-to-r from-gold via-[#E7C85A] to-gold text-white font-bold tracking-wide text-[11px] uppercase whitespace-nowrap hover:brightness-110 hover:scale-[1.02] active:scale-100 transition-transform duration-200 shadow-lg shadow-gold/10 flex items-center justify-center gap-2 disabled:opacity-50 ${!isDirty && !updating ? 'opacity-40 pointer-events-none' : ''}`}>
                      {updating ? <Loader2 className="animate-spin" size={16} /> : <Save size={14} />}
                      {categoryForm.id ? t('save_changes') : t('create')}
                    </button>
                  </div>
                </form>
              </div>

              {/* Right: List */}
              <div className="px-6 md:px-8 py-7 flex flex-col min-h-0">
                <h3 className="text-[9px] uppercase tracking-[0.3em] text-white/25 font-bold mb-4 shrink-0">{t('existing_categories')}</h3>
                <div className="space-y-1.5 overflow-y-auto flex-1 pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.06) transparent' }}>
                  {categories.map((cat) => (
                    <div key={cat.id} className={`group flex items-center justify-between px-4 py-3 rounded-xl border transition-transform duration-200 ${categoryForm.id === cat.id ? 'bg-[var(--theme-surface-soft)] border-[var(--theme-border-strong)]' : 'bg-[var(--theme-surface-muted)] border-[var(--theme-border)] hover:bg-[var(--theme-surface-soft)] hover:border-[var(--theme-border-strong)]'}`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-transform duration-200 ${categoryForm.id === cat.id ? 'bg-[var(--theme-surface)]' : 'bg-[var(--theme-surface-soft)] group-hover:bg-[var(--theme-surface)]'}`}>
                          <Tag size={12} className={categoryForm.id === cat.id ? 'text-white' : 'text-white/30'} />
                        </div>
                        <span className={`text-sm font-semibold transition-colors ${categoryForm.id === cat.id ? 'text-white' : 'text-white/70 group-hover:text-white/90'}`}>
                          {getCategoryName(cat)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => onEditCategory(cat)} className="w-8 h-8 rounded-lg bg-white/[0.03] border border-white/[0.06] text-white/20 flex items-center justify-center transition-transform duration-200">
                          <Edit3 size={13} />
                        </button>
                        <button onClick={() => onDeleteCategory(cat.id, cat.name)} className="w-8 h-8 rounded-lg bg-white/[0.03] hover:bg-red-500/10 border border-white/[0.06] hover:border-red-500/20 text-white/20 hover:text-red-400 flex items-center justify-center transition-transform duration-200">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
