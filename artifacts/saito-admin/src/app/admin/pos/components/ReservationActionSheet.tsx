'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PhoneCall, Clock, Users, Star, CheckCircle, Pencil, Printer, UserX, Ban, Info, Wallet } from '@/components/ui/saito-icons';
import { toast } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { TableActionSheet, ActionCard, ActionGrid } from './TableActionSheet';
import { appleBackdrop, slideUp, fastExit } from '@/lib/modal-transitions';

interface Reservation {
  table_number: number;
  reservation_id: string | null;
  reservation_name: string | null;
  reservation_phone: string | null | undefined;
  reservation_time: string | null | undefined;
  guest_count: number | null;
  status: string;
  is_vip?: boolean | null;
  /** 2026-09-26 (owner, Task 49): table-hold deposit (₼) — credited to bill. */
  deposit_amount?: number | string | null;
}

interface ReservationActionSheetProps {
  open: boolean;
  onClose: () => void;
  table: Reservation | null;
  onGuestArrived: () => void;
  onEditReservation: () => void;
  onMoveTable?: () => void;
  onMergeTable?: () => void;
  onCancelReservation?: () => void;
  onMarkNoShow?: () => void;
  onPrintReservation?: () => void;
}

export default function ReservationActionSheet({
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
}: ReservationActionSheetProps) {
  const { t } = useLanguage();
  const [showActions, setShowActions] = useState(false);

  if (!table) return null;

  const maskPhone = (phone: string | null) => phone || '';

  const primaryActions = (
    <ActionGrid cols={3}>
      <ActionCard
        icon={<CheckCircle size={22} strokeWidth={2.5} />}
        label={t('place')}
        variant="accent"
        onClick={onGuestArrived}
      />
      <ActionCard
        icon={<Pencil size={22} strokeWidth={2.5} />}
        label={t('edit')}
        variant="default"
        onClick={onEditReservation}
      />
      <ActionCard
        icon={<Info size={22} strokeWidth={2.5} />}
        label={t('details')}
        variant="default"
        onClick={() => setShowActions(!showActions)}
      />
    </ActionGrid>
  );

   const secondaryActions = (
    <AnimatePresence initial={false}>
      {showActions && (
    <motion.div
      initial={{ opacity: 0, y: 10, height: 0 }}
      animate={{ opacity: 1, y: 0, height: 'auto' }}
      exit={{ opacity: 0, y: 6, height: 0, transition: { duration: 0.28, ease: [0.45, 0, 0.55, 1] } }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      className="mt-4 space-y-3 overflow-hidden"
    >
      <ActionGrid cols={2}>
        <ActionCard
          icon={<Users size={22} strokeWidth={2.5} />}
          label={t('change_table')}
          variant="default"
          onClick={() => { setShowActions(false); onMoveTable?.(); }}
        />
        <ActionCard
          icon={<Star size={22} strokeWidth={2.5} />}
          label={t('merge')}
          variant="default"
          onClick={() => { setShowActions(false); onMergeTable?.(); }}
        />
      </ActionGrid>
      {table.reservation_phone && (
        <ActionCard
          icon={<PhoneCall size={22} strokeWidth={2.5} />}
          label={`${t('call')} ${maskPhone(table.reservation_phone)}`}
          variant="default"
          href={`tel:${table.reservation_phone}`}
        />
      )}
      <ActionCard
        icon={<Printer size={22} strokeWidth={2.5} />}
        label={t('print')}
        variant="default"
        onClick={() => { setShowActions(false); onPrintReservation?.(); }}
      />
      <ActionCard
        icon={<UserX size={22} strokeWidth={2.5} />}
        label={t('no_show' as any) || 'No Show'}
        variant="destructive"
        onClick={() => { setShowActions(false); onMarkNoShow?.(); }}
      />
      <ActionCard
        icon={<Ban size={22} strokeWidth={2.5} />}
        label={t('cancel')}
        variant="destructive"
        onClick={() => { setShowActions(false); onCancelReservation?.(); }}
      />
    </motion.div>
      )}
    </AnimatePresence>
  );

  // 2026-09-27 (iOS-27-trash doctrine): the backdrop is a DIRECT keyed motion
  // child of AnimatePresence (a fragment is not tracked → it used to unmount
  // instantly). TableActionSheet is a self-managing sibling (its own
  // AnimatePresence) so the sheet + veil both play their graceful exits.
  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            key="ra-backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.3, ease: [0.45, 0, 0.55, 1] } }}
            className="fixed inset-0 z-[119] pointer-events-auto bg-black/10 dark:bg-black/30"
            onClick={onClose}
          />
        )}
      </AnimatePresence>
      <TableActionSheet
        open={open}
        onClose={onClose}
        title={`Masa ${table.table_number}`}
            subtitle={
              <span className="inline-flex flex-col items-center gap-1">
                {table.reservation_name && <span>{table.reservation_name}</span>}
                <span className="inline-flex items-center gap-3 text-xs font-bold uppercase tracking-widest opacity-60">
                  {table.reservation_time && <span className="flex items-center gap-1"><Clock size={10} /> {table.reservation_time}</span>}
                  {table.guest_count && <span className="flex items-center gap-1"><Users size={10} /> {table.guest_count} {t('person' as any) || 'Nəfər'}</span>}
                  {table.reservation_phone && <span className="flex items-center gap-1"><PhoneCall size={10} /> {maskPhone(table.reservation_phone)}</span>}
                  {Number(table.deposit_amount) > 0 && (
                    <span className="flex items-center gap-1 text-emerald-400 opacity-100">
                      <Wallet size={10} /> {t('deposit' as any) || 'Depozit'} ₼{Number(table.deposit_amount).toFixed(0)}
                    </span>
                  )}
                </span>
              </span>
            }
              badge={
                /* 2026-09-27 (NO YELLOW rule): VIP = platinum, guest chip neutral */
                table.is_vip ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-black uppercase tracking-widest bg-white/10 border-white/30 text-white shadow-[0_0_16px_rgba(255,255,255,0.08)]">
                    <Star size={10} className="text-emerald-300" /> VIP
                  </span>
                ) : undefined
              }
              guestCount={
                <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-white/5 border border-white/10 text-white/80 text-sm font-black">
                  <Users size={18} /> {table.guest_count} Nəfər
                </span>
              }
          >
        {primaryActions}
        {secondaryActions}
      </TableActionSheet>
    </>
  );
}
