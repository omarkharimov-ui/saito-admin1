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
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/20"
          onClick={onClose}
        >
        <motion.div
          {...slideUp}
          className="pointer-events-auto w-full max-w-md bg-white text-black rounded-[2.5rem] shadow-2xl border border-white/20 p-5"
          onClick={e => e.stopPropagation()}
        >
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-600 mb-1">Rezervasyon</p>
                <p className="text-sm font-bold">Masa {table.table_number}</p>
                {table.reservation_name && (
                  <p className="text-xs text-zinc-500 mt-0.5">{table.reservation_name}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {table.is_vip && (
                  <span className="px-2 py-1 rounded-lg bg-amber-500 text-white text-[9px] font-black uppercase tracking-wider">VIP</span>
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
                className="flex-1 py-4 rounded-2xl bg-amber-500 text-white text-xs font-black hover:bg-amber-600 transition-all flex items-center justify-center gap-2"
              >
                <CheckCircle size={16} />
                QONAQ GƏLDİ
              </button>
              <button
                onClick={onEditReservation}
                className="px-4 py-4 rounded-2xl border border-zinc-200 text-zinc-600 text-xs font-black hover:bg-zinc-50 transition-all"
                title={t('edit')}
              >
                <Pencil size={16} />
              </button>
              <button
                onClick={() => setShowActions(!showActions)}
                className="px-4 py-4 rounded-2xl border border-zinc-200 text-zinc-600 text-xs font-black hover:bg-zinc-50 transition-all"
                title={t('details')}
              >
                <ChevronRight size={16} />
              </button>
            </div>

            {showActions && (
              <div className="space-y-2 pt-3 border-t border-zinc-100">
                <button
                  onClick={() => { setShowActions(false); onMoveTable?.(); }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-zinc-50 hover:bg-zinc-100 transition-all"
                >
                  <Move size={18} className="text-blue-500" />
                  <div className="text-left">
                    <p className="text-sm font-bold text-zinc-900">{t('change_table')}</p>
                    <p className="text-[10px] text-zinc-500">{t('move_to_empty_table')}</p>
                  </div>
                </button>
                <button
                  onClick={() => { setShowActions(false); onMergeTable?.(); }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-zinc-50 hover:bg-zinc-100 transition-all"
                >
                  <Merge size={18} className="text-emerald-500" />
                  <div className="text-left">
                    <p className="text-sm font-bold text-zinc-900">{t('merge_table')}</p>
                    <p className="text-[10px] text-zinc-500">{t('add_new_table')}</p>
                  </div>
                </button>
                {table.reservation_phone && (
                  <a
                    href={`tel:${table.reservation_phone}`}
                    className="w-full flex items-center gap-3 p-3 rounded-xl bg-zinc-50 hover:bg-zinc-100 transition-all"
                  >
                    <PhoneCall size={18} className="text-emerald-500" />
                    <div className="text-left">
                      <p className="text-sm font-bold text-zinc-900">{t('call')}</p>
                      <p className="text-[10px] text-zinc-500">{table.reservation_phone}</p>
                    </div>
                  </a>
                )}
                <button
                  onClick={() => { setShowActions(false); onPrintReservation?.(); }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-zinc-50 hover:bg-zinc-100 transition-all"
                >
                  <Printer size={18} className="text-zinc-500" />
                  <div className="text-left">
                    <p className="text-sm font-bold text-zinc-900">Çap Et</p>
                    <p className="text-[10px] text-zinc-500">Rezervasiya bileti</p>
                  </div>
                </button>
                <button
                  onClick={() => { setShowActions(false); onMarkNoShow?.(); }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-zinc-50 hover:bg-zinc-100 transition-all"
                >
                  <UserX size={18} className="text-rose-500" />
                  <div className="text-left">
                    <p className="text-sm font-bold text-zinc-900">No Show</p>
                    <p className="text-[10px] text-zinc-500">{t('guest_not_arrived')}</p>
                  </div>
                </button>
                <button
                  onClick={() => { setShowActions(false); onCancelReservation?.(); }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-rose-50 hover:bg-rose-100 transition-all"
                >
                  <Ban size={18} className="text-rose-600" />
                  <div className="text-left">
                    <p className="text-sm font-bold text-rose-600">{t('cancel')}</p>
                    <p className="text-[10px] text-rose-400">{t('cancel_reservation')}</p>
                  </div>
                </button>
               </div>
             )}
           </motion.div>
         </motion.div>
      )}
    </AnimatePresence>
  );
}
