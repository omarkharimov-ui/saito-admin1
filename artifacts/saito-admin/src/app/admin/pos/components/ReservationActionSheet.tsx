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

  const secondaryActions = showActions ? (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-4 space-y-3"
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
  ) : null;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={fastExit}
            className="fixed inset-0 z-[119] pointer-events-auto bg-black/10 dark:bg-black/30"
            onClick={onClose}
          />
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
               table.is_vip ? (
                 <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-black uppercase tracking-widest bg-amber-500/15 border-amber-500/25 text-amber-400">
                   <Star size={10} /> VIP
                 </span>
               ) : undefined
             }
             guestCount={
               <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm font-black">
                 <Users size={18} /> {table.guest_count} Nəfər
               </span>
             }
          >
            {primaryActions}
            {secondaryActions}
          </TableActionSheet>
        </>
      )}
    </AnimatePresence>
  );
}
