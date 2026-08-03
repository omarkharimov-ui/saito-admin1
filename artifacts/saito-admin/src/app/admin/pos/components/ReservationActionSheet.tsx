'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PhoneCall, Clock, Users, Star, CheckCircle, Pencil, Printer, UserX, Ban } from 'lucide-react';
import { toast } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { TableActionSheet, ActionCard, ActionGrid } from './TableActionSheet';
import { appleBackdrop } from '@/lib/modal-transitions';

interface Reservation {
  table_number: number;
  reservation_id: string | null;
  reservation_name: string | null;
  reservation_phone: string | null | undefined;
  reservation_time: string | null | undefined;
  guest_count: number | null;
  status: string;
  is_vip?: boolean | null;
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

  const maskPhone = (phone: string | null) => {
    if (!phone) return '';
    if (phone.length <= 4) return phone;
    return phone.slice(0, 3) + '•••••••';
  };

  const primaryActions = (
    <ActionGrid cols={3}>
      <ActionCard
        icon={<CheckCircle size={22} strokeWidth={2.5} />}
        label="Yerləşdir"
        variant="accent"
        onClick={onGuestArrived}
      />
      <ActionCard
        icon={<Pencil size={22} strokeWidth={2.5} />}
        label="Redaktə"
        variant="default"
        onClick={onEditReservation}
      />
      <ActionCard
        icon={<span className="text-[9px] font-black tracking-widest uppercase">+</span>}
        label="Ətraflı"
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
          label="Masa Dəyiş"
          variant="default"
          onClick={() => { setShowActions(false); onMoveTable?.(); }}
        />
        <ActionCard
          icon={<Star size={22} strokeWidth={2.5} />}
          label="Birləşdir"
          variant="default"
          onClick={() => { setShowActions(false); onMergeTable?.(); }}
        />
      </ActionGrid>
      {table.reservation_phone && (
        <ActionCard
          icon={<PhoneCall size={22} strokeWidth={2.5} />}
          label={`Zəng Et ${maskPhone(table.reservation_phone)}`}
          variant="default"
          href={`tel:${table.reservation_phone}`}
        />
      )}
      <ActionCard
        icon={<Printer size={22} strokeWidth={2.5} />}
        label="Çap Et"
        variant="default"
        onClick={() => { setShowActions(false); onPrintReservation?.(); }}
      />
      <ActionCard
        icon={<UserX size={22} strokeWidth={2.5} />}
        label="No Show"
        variant="destructive"
        onClick={() => { setShowActions(false); onMarkNoShow?.(); }}
      />
      <ActionCard
        icon={<Ban size={22} strokeWidth={2.5} />}
        label="Ləğv Et"
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
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={appleBackdrop}
            className="fixed inset-0 z-[119] pointer-events-auto bg-black/10 dark:bg-black/30 backdrop-blur-[2px]"
            onClick={onClose}
          />
          <TableActionSheet
            open={open}
            onClose={onClose}
            title={`Masa ${table.table_number}`}
            subtitle={
              <span className="inline-flex flex-col items-center gap-1">
                {table.reservation_name && <span>{table.reservation_name}</span>}
                <span className="inline-flex items-center gap-3 text-[9px] font-bold uppercase tracking-widest opacity-60">
                  {table.reservation_time && <span className="flex items-center gap-1"><Clock size={10} /> {table.reservation_time}</span>}
                  {table.guest_count && <span className="flex items-center gap-1"><Users size={10} /> {table.guest_count} nəfər</span>}
                  {table.reservation_phone && <span className="flex items-center gap-1"><PhoneCall size={10} /> {maskPhone(table.reservation_phone)}</span>}
                </span>
              </span>
            }
            badge={
              table.is_vip ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest bg-amber-500/15 border-amber-500/25 text-amber-400">
                  <Star size={10} /> VIP
                </span>
              ) : undefined
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
