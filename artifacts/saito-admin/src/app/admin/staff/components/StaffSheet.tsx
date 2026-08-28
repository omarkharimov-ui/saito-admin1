'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, UserPlus, Shield, Phone, Mail, Clock, KeyRound, DollarSign } from 'lucide-react';
import { toast } from '@/lib/toast';

interface StaffSheetProps {
  open: boolean;
  onClose: () => void;
  editingStaff: any;
  roles: any[];
  saving: boolean;
  form: {
    name: string;
    email: string;
    phone: string;
    role_id: string;
    shift: string;
    is_active: boolean;
    pin: string;
    hourly_rate?: number;
  };
  onFormChange: (form: any) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export function StaffSheet({
  open,
  onClose,
  editingStaff,
  roles,
  saving,
  form,
  onFormChange,
  onSubmit,
}: StaffSheetProps) {
  const handlePinChange = (value: string) => {
    const cleaned = value.replace(/\D/g, '').slice(0, 4);
    onFormChange({ ...form, pin: cleaned });
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-xl"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: '100%', opacity: 0.8 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0.8 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30, mass: 0.5 }}
            className="fixed right-0 top-0 bottom-0 z-[101] w-full max-w-md bg-[var(--theme-surface)] border-l border-[var(--theme-border)] shadow-2xl flex flex-col"
          >
            <div className="flex items-center justify-between p-6 border-b border-[var(--theme-border)]">
              <div>
                <h2 className="text-base font-black text-[var(--theme-text)] flex items-center gap-2">
                  <UserPlus size={18} className="text-gold" />
                  {editingStaff ? 'Edit Staff' : 'Add Staff'}
                </h2>
                <p className="text-[10px] text-[var(--theme-text-muted)] mt-1 uppercase tracking-widest">
                  {editingStaff ? 'Update information' : 'New team member'}
                </p>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/5 text-white/30 hover:text-white hover:bg-white/10 transition-all"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={onSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-[var(--theme-text-secondary)] font-bold">
                  Name *
                </label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => onFormChange({ ...form, name: e.target.value })}
                  placeholder="Full name"
                  className="w-full bg-[var(--theme-surface)] border border-[var(--theme-border)] focus:border-[var(--theme-border-strong)] px-4 py-3 text-sm text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none rounded-2xl transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-[var(--theme-text-secondary)] font-bold">
                  <Mail size={10} className="text-gold/60" /> Email
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => onFormChange({ ...form, email: e.target.value })}
                  placeholder="email@example.com"
                  className="w-full bg-[var(--theme-surface)] border border-[var(--theme-border)] focus:border-[var(--theme-border-strong)] px-4 py-3 text-sm text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none rounded-2xl transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-[var(--theme-text-secondary)] font-bold">
                  <Phone size={10} className="text-gold/60" /> Phone
                </label>
                <input
                  value={form.phone}
                  onChange={(e) => onFormChange({ ...form, phone: e.target.value })}
                  placeholder="050 000 00 00"
                  className="w-full bg-[var(--theme-surface)] border border-[var(--theme-border)] focus:border-[var(--theme-border-strong)] px-4 py-3 text-sm text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none rounded-2xl transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-[var(--theme-text-secondary)] font-bold">
                  <Shield size={10} className="text-gold/60" /> Role
                </label>
                <select
                  value={form.role_id}
                  onChange={(e) => onFormChange({ ...form, role_id: e.target.value })}
                  className="w-full bg-[var(--theme-surface)] border border-[var(--theme-border)] focus:border-[var(--theme-border-strong)] px-4 py-3 text-sm text-[var(--theme-text)] outline-none rounded-2xl transition-all appearance-none cursor-pointer"
                >
                  <option value="">Select role</option>
                  {roles.map((r: any) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-[var(--theme-text-secondary)] font-bold">
                  <Clock size={10} className="text-gold/60" /> Shift
                </label>
                <input
                  value={form.shift}
                  onChange={(e) => onFormChange({ ...form, shift: e.target.value })}
                  placeholder="e.g. 08:00 — 16:00"
                  className="w-full bg-[var(--theme-surface)] border border-[var(--theme-border)] focus:border-[var(--theme-border-strong)] px-4 py-3 text-sm text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none rounded-2xl transition-all"
                />
              </div>

               <div className="space-y-1.5">
                 <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-[var(--theme-text-secondary)] font-bold">
                   <DollarSign size={10} className="text-gold/60" /> Hourly Rate (₼)
                 </label>
                 <input
                   type="number"
                   step="0.01"
                   value={form.hourly_rate ?? ''}
                   onChange={(e) => onFormChange({ ...form, hourly_rate: e.target.value ? parseFloat(e.target.value) : undefined })}
                   placeholder="0.00"
                   className="w-full bg-[var(--theme-surface)] border border-[var(--theme-border)] focus:border-[var(--theme-border-strong)] px-4 py-3 text-sm text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none rounded-2xl transition-all"
                 />
               </div>

               {!editingStaff && (
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-[var(--theme-text-secondary)] font-bold">
                    <KeyRound size={10} className="text-gold/60" /> PIN
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    value={form.pin}
                    onChange={(e) => handlePinChange(e.target.value)}
                    placeholder="0000"
                    className="w-full bg-[var(--theme-surface)] border border-[var(--theme-border)] focus:border-[var(--theme-border-strong)] px-4 py-3 text-sm text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none rounded-2xl transition-all tracking-widest text-center font-mono"
                  />
                  <p className="text-[10px] text-[var(--theme-text-muted)]">4-digit PIN. Numbers only.</p>
                </div>
              )}

              <div className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
                <div>
                  <p className="text-xs font-bold text-[var(--theme-text)]">Status</p>
                  <p className="text-[10px] text-[var(--theme-text-muted)] mt-0.5">
                    {form.is_active ? 'Active — can log in' : 'Inactive — cannot log in'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onFormChange({ ...form, is_active: !form.is_active })}
                  className={`w-12 h-6 rounded-full transition-all duration-300 ${
                    form.is_active ? 'bg-emerald-500 shadow-lg shadow-emerald-500/30' : 'bg-white/10'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white shadow-md transition-transform duration-300 ${
                      form.is_active ? 'translate-x-7' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </form>

            <div className="p-6 border-t border-[var(--theme-border)] flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 text-xs font-bold text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] transition-colors rounded-xl hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                onClick={onSubmit}
                disabled={saving || !form.name.trim()}
                className="flex items-center gap-2 bg-white text-black px-6 py-2.5 rounded-2xl font-bold text-xs tracking-wide transition-all disabled:opacity-40 shadow-lg hover:bg-white/90 active:scale-95"
              >
                {saving ? (
                  <span className="w-3.5 h-3.5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                ) : (
                  <Plus size={12} />
                )}
                {editingStaff ? 'Save' : 'Add'}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
