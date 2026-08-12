'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Phone, Clock, Users, Star, ChevronRight, Pencil, Printer, UserX, Merge, Move, Ban, CheckCircle, PhoneCall } from 'lucide-react';
import { toast } from '@/lib/toast';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { appleBackdrop, slideUp, fastExit } from '@/lib/modal-transitions';

interface ReservedTableModalProps {
  open: boolean;
  onClose: () => void;
  table: {
    table_number: number;
    reservation_id: string | null;
    reservation_name: string | null;
    reservation_phone: string | null | undefined;
    reservation_time: string | null | undefined;
    guest_count: number | null;
    status: string;
    reservation_status_snapshot?: string | null;
    is_vip?: boolean | null;
  } | null;
  onGuestArrived: () => void;
  onEditReservation: () => void;
  onMoveTable?: () => void;
  onMergeTable?: () => void;
  onCancelReservation?: () => void;
  onMarkNoShow?: () => void;
  onPrintReservation?: () => void;
}

export default function ReservedTableModal({
  open,
  onClose,
  table,
  onGuestArrived,
  onEditReservation,
  onMoveTable,
  onMergeTable,
  onCancelReservation,
  onMarkNoShow,
  onPrintReservation,
}: ReservedTableModalProps) {
  const { t } = useLanguage();
  const [showActions, setShowActions] = useState(false);

  if (!table) return null;

  const maskPhone = (phone: string | null) => {
    if (!phone) return '';
    if (phone.length <= 4) return phone;
    return phone.slice(0, 3) + '•••••••';
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={fastExit}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/20 backdrop-blur-sm"
          onClick={onClose}
        >
        <motion.div
          {...slideUp}
          className="pointer-events-auto w-full max-w-md bg-white/85 text-black rounded-6xl shadow-elevated border border-white/20 p-5 backdrop-blur-2xl"
          onClick={e => e.stopPropagation()}
        >
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-600 mb-1">Rezervasyon</p>
                <p className="text-sm font-bold">Masa {table.table_number}</p>
                {table.reservation_name && (
                  <p className="text-xs text-zinc-500 mt-0.5">{table.reservation_name}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {table.is_vip && (
                  <span className="px-2 py-1 rounded-lg bg-amber-500 text-white text-xs font-black uppercase tracking-wider">VIP</span>
                )}
                <button onClick={onClose} className="w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center text-zinc-500 hover:bg-zinc-200 transition-all">
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="space-y-2 mb-5">
              {table.reservation_phone && (
                <div className="flex items-center gap-2 text-xs text-zinc-600">
                  <Phone size={14} className="text-zinc-400" />
                  <span className="font-mono">{maskPhone(table.reservation_phone)}</span>
                </div>
              )}
              {table.reservation_time && (
                <div className="flex items-center gap-2 text-xs text-zinc-600">
                  <Clock size={14} className="text-zinc-400" />
                  <span>{table.reservation_time}</span>
                </div>
              )}
              {table.guest_count && (
                <div className="flex items-center gap-2 text-base text-zinc-900 font-black">
                  <Users size={18} className="text-amber-500" />
                  <span>{table.guest_count} Nəfər</span>
                </div>
              )}
            </div>

            <div className="flex gap-2 mb-3">
              <button
                onClick={onGuestArrived}
                className="flex-1 py-4 rounded-2xl bg-amber-500 text-white text-xs font-black hover:bg-amber-600 transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-500/30"
              >
                <CheckCircle size={16} strokeWidth={2.5} />
                QONAQ GƏLDİ
              </button>
              <button
                onClick={onEditReservation}
                className="w-14 h-14 rounded-2xl border border-zinc-200 text-zinc-600 text-xs font-black hover:bg-zinc-50 transition-all flex items-center justify-center shrink-0"
                title={t('edit')}
              >
                <Pencil size={18} />
              </button>
              <button
                onClick={() => setShowActions(!showActions)}
                className={`w-14 h-14 rounded-2xl border text-xs font-black transition-all flex items-center justify-center shrink-0 ${showActions ? 'bg-zinc-900 text-white border-zinc-900' : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50'}`}
                title={t('details')}
              >
                <ChevronRight size={18} className={`transition-transform ${showActions ? 'rotate-90' : ''}`} />
              </button>
            </div>

            {showActions && (
              <div className="space-y-2.5 pt-4 border-t border-zinc-100">
                <button
                  onClick={() => { setShowActions(false); onMoveTable?.(); }}
                  className="w-full flex items-center gap-4 p-3 rounded-2xl bg-zinc-50 hover:bg-zinc-100 transition-all group"
                >
                  <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                    <Move size={20} strokeWidth={2.2} className="text-blue-500" />
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-bold text-zinc-900">{t('change_table')}</p>
                    <p className="text-xs text-zinc-500 truncate">{t('move_to_empty_table')}</p>
                  </div>
                  <ChevronRight size={18} className="text-zinc-300 group-hover:text-zinc-500 transition-colors shrink-0" />
                </button>
                <button
                  onClick={() => { setShowActions(false); onMergeTable?.(); }}
                  className="w-full flex items-center gap-4 p-3 rounded-2xl bg-zinc-50 hover:bg-zinc-100 transition-all group"
                >
                  <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                    <Merge size={20} strokeWidth={2.2} className="text-emerald-500" />
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-bold text-zinc-900">{t('merge_table')}</p>
                    <p className="text-xs text-zinc-500 truncate">{t('add_new_table')}</p>
                  </div>
                  <ChevronRight size={18} className="text-zinc-300 group-hover:text-zinc-500 transition-colors shrink-0" />
                </button>
                {table.reservation_phone && (
                  <a
                    href={`tel:${table.reservation_phone}`}
                    className="w-full flex items-center gap-4 p-3 rounded-2xl bg-zinc-50 hover:bg-zinc-100 transition-all group"
                  >
                    <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                      <PhoneCall size={20} strokeWidth={2.2} className="text-emerald-500" />
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-sm font-bold text-zinc-900">{t('call')}</p>
                      <p className="text-xs text-zinc-500 truncate">{table.reservation_phone}</p>
                    </div>
                    <ChevronRight size={18} className="text-zinc-300 group-hover:text-zinc-500 transition-colors shrink-0" />
                  </a>
                )}
                <button
                  onClick={() => { setShowActions(false); onPrintReservation?.(); }}
                  className="w-full flex items-center gap-4 p-3 rounded-2xl bg-zinc-50 hover:bg-zinc-100 transition-all group"
                >
                  <div className="w-11 h-11 rounded-xl bg-zinc-100 flex items-center justify-center shrink-0">
                    <Printer size={20} strokeWidth={2.2} className="text-zinc-500" />
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-bold text-zinc-900">Çap Et</p>
                    <p className="text-xs text-zinc-500 truncate">Rezervasiya bileti</p>
                  </div>
                  <ChevronRight size={18} className="text-zinc-300 group-hover:text-zinc-500 transition-colors shrink-0" />
                </button>
                <button
                  onClick={() => { setShowActions(false); onMarkNoShow?.(); }}
                  className="w-full flex items-center gap-4 p-3 rounded-2xl bg-zinc-50 hover:bg-zinc-100 transition-all group"
                >
                  <div className="w-11 h-11 rounded-xl bg-rose-50 flex items-center justify-center shrink-0">
                    <UserX size={20} strokeWidth={2.2} className="text-rose-500" />
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-bold text-zinc-900">No Show</p>
                    <p className="text-xs text-zinc-500 truncate">{t('guest_not_arrived')}</p>
                  </div>
                  <ChevronRight size={18} className="text-zinc-300 group-hover:text-zinc-500 transition-colors shrink-0" />
                </button>
                <button
                  onClick={() => { setShowActions(false); onCancelReservation?.(); }}
                  className="w-full flex items-center gap-4 p-3 rounded-2xl bg-rose-50 hover:bg-rose-100 transition-all group"
                >
                  <div className="w-11 h-11 rounded-xl bg-rose-100 flex items-center justify-center shrink-0">
                    <Ban size={20} strokeWidth={2.2} className="text-rose-600" />
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-bold text-rose-600">{t('cancel')}</p>
                    <p className="text-xs text-rose-400 truncate">{t('cancel_reservation')}</p>
                  </div>
                  <ChevronRight size={18} className="text-rose-200 group-hover:text-rose-400 transition-colors shrink-0" />
                </button>
               </div>
             )}
           </motion.div>
         </motion.div>
      )}
    </AnimatePresence>
  );
}
