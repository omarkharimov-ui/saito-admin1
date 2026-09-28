'use client';

/**
 * ReservationActionSheet — reserved-table action sheet.
 *
 * 2026-09-28 (owner: "rezerv actionsheet yeniden dizayn" + "butun her seyin
 * isledityinden emin ol"): full rework of the interaction model.
 *
 *   BEFORE: 3-column ActionCard grid (Otur / Dəyiş / Məlumat) + a hidden
 *   "showActions" expansion whose MOVE/MERGE flows used NATIVE window.prompt()
 *   ("Hədəf masa nömrəsi:") — a browser dialog inside a POS action sheet.
 *   AFTER:  Apple action-sheet grammar on the shared TableActionSheet chrome:
 *     1. ONE full-width primary CTA (seat the guest) — the reason the sheet
 *        opened.
 *     2. A 3-up quiet grid (edit / print / call) for the common secondaries.
 *     3. MOVE TABLE = inline single-pick over the LIVE free tables (one tap
 *        executes). MERGE TABLES = inline multi-pick + confirm. No prompts,
 *        no typing numbers from memory — the operator sees exactly which
 *        tables are free at this moment.
 *     4. Destructive row (no-show / cancel) visually separated at the bottom.
 *   Icons re-picked to mean what they say: Move (not Users) for change-table,
 *   Merge (not Star) for merge — Star is reserved for VIP.
 */

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PhoneCall, Clock, Users, Star, CheckCircle2, Pencil, Printer, UserX, Ban, Move, Merge, X, Check } from '@/components/ui/saito-icons';
import { toast } from '@/lib/toast';
import { useTheme } from '@/lib/theme/ThemeContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { TableActionSheet, ActionCard, ActionGrid } from './TableActionSheet';

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

export interface FreeTableOption {
  table_number: number;
  status?: string;
  guest_count?: number | null;
}

interface ReservationActionSheetProps {
  open: boolean;
  onClose: () => void;
  table: Reservation | null;
  onGuestArrived: () => void;
  onEditReservation: () => void;
  /** 2026-09-28: live free tables for the inline move/merge pickers. */
  freeTables?: FreeTableOption[];
  /** 2026-09-28: move to ONE picked table (replaces the prompt() flow). */
  onMoveToTable?: (tableNumber: number) => void;
  /** 2026-09-28: merge current + picked tables (replaces the prompt() flow). */
  onMergeWith?: (tableNumbers: number[]) => void;
  /** Legacy prompt()-based flows — kept as fallback when no pickers are wired. */
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
  freeTables,
  onMoveToTable,
  onMergeWith,
  onMoveTable,
  onMergeTable,
  onCancelReservation,
  onMarkNoShow,
  onPrintReservation,
}: ReservationActionSheetProps) {
  const { lightMode } = useTheme();
  const { t } = useLanguage();
  // null | 'move' | 'merge' — which inline picker is open.
  const [pickMode, setPickMode] = useState<null | 'move' | 'merge'>(null);
  const [mergePicks, setMergePicks] = useState<number[]>([]);

  const canPickMove = !!onMoveToTable && (freeTables || []).length > 0;
  const canPickMerge = !!onMergeWith && (freeTables || []).length > 0;

  const pickOptions = useMemo(
    () => (freeTables || [])
      .filter(ft => ft.table_number !== table?.table_number)
      .sort((a, b) => a.table_number - b.table_number),
    [freeTables, table?.table_number],
  );

  if (!table) return null;

  const maskPhone = (phone: string | null) => phone || '';

  // Close the picker whenever it should reset (sheet re-open, mode switch).
  const closePicker = () => { setPickMode(null); setMergePicks([]); };

  const handlePick = (num: number) => {
    if (pickMode === 'move') {
      closePicker();
      onMoveToTable?.(num);
      return;
    }
    if (pickMode === 'merge') {
      setMergePicks(prev => (prev.includes(num) ? prev.filter(x => x !== num) : [...prev, num]));
    }
  };

  const confirmMerge = () => {
    if (mergePicks.length === 0) return;
    const nums = [table.table_number, ...mergePicks].sort((a, b) => a - b);
    closePicker();
    onMergeWith?.(nums);
  };

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
        onClose={() => { closePicker(); onClose(); }}
        title={`Masa ${table.table_number}`}
        subtitle={
          <span className="inline-flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
            {table.reservation_name && <span className="text-sm font-black normal-case tracking-normal text-white">{table.reservation_name}</span>}
            <span className="inline-flex items-center gap-3 text-xs font-bold uppercase tracking-widest text-white/60">
              {table.reservation_time && <span className="flex items-center gap-1"><Clock size={10} /> {String(table.reservation_time).slice(0, 5)}</span>}
              {table.guest_count && <span className="flex items-center gap-1"><Users size={10} /> {table.guest_count} {t('person' as any) || 'Nəfər'}</span>}
              {table.reservation_phone && <span className="flex items-center gap-1"><PhoneCall size={10} /> {maskPhone(table.reservation_phone)}</span>}
              {Number(table.deposit_amount) > 0 && (
                <span className="flex items-center gap-1 text-emerald-400">
                  <Star size={10} /> {t('deposit' as any) || 'Depozit'} ₼{Number(table.deposit_amount).toFixed(0)}
                </span>
              )}
            </span>
          </span>
        }
        badge={
          /* (NO YELLOW rule): VIP = platinum */
          table.is_vip ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-black uppercase tracking-widest bg-white/10 border-white/30 text-white shadow-[0_0_16px_rgba(255,255,255,0.08)]">
              <Star size={10} className="text-emerald-300" /> VIP
            </span>
          ) : undefined
        }
      >
        {/* ── 1. The reason the sheet opened: seat the guest ── */}
        <button
          onClick={onGuestArrived}
          className="w-full flex items-center justify-center gap-2.5 py-4.5 px-6 rounded-4xl bg-indigo-500 hover:bg-indigo-400 active:scale-[0.985] transition-all text-white text-sm font-black uppercase tracking-[0.14em] shadow-lg shadow-indigo-500/25"
          style={{ paddingTop: '1.05rem', paddingBottom: '1.05rem' }}
        >
          <CheckCircle2 size={20} strokeWidth={2.2} />
          {t('place')}
        </button>

        {/* ── 2. Common secondaries ── */}
        <div className="mt-3">
          <ActionGrid cols={table.reservation_phone ? 3 : 2}>
            <ActionCard
              icon={<Pencil size={22} strokeWidth={2.5} />}
              label={t('edit')}
              variant="default"
              onClick={onEditReservation}
            />
            <ActionCard
              icon={<Printer size={22} strokeWidth={2.5} />}
              label={t('print')}
              variant="default"
              onClick={() => onPrintReservation?.()}
            />
            {table.reservation_phone && (
              <ActionCard
                icon={<PhoneCall size={22} strokeWidth={2.5} />}
                label={t('call')}
                variant="default"
                href={`tel:${table.reservation_phone}`}
              />
            )}
          </ActionGrid>
        </div>

        {/* ── 3. Table operations (move / merge) ── */}
        <div className="mt-3">
          <ActionGrid cols={2}>
            <ActionCard
              icon={<Move size={22} strokeWidth={2.5} />}
              label={t('change_table')}
              variant={canPickMove ? 'accent' : 'default'}
              disabled={!canPickMove && !onMoveTable}
              onClick={() => {
                if (canPickMove) { setPickMode(p => (p === 'move' ? null : 'move')); if (pickMode !== 'move') setMergePicks([]); }
                else onMoveTable?.();
              }}
            />
            <ActionCard
              icon={<Merge size={22} strokeWidth={2.5} />}
              label={t('merge')}
              variant={canPickMerge ? 'accent' : 'default'}
              disabled={!canPickMerge && !onMergeTable}
              onClick={() => {
                if (canPickMerge) { setPickMode(p => (p === 'merge' ? null : 'merge')); if (pickMode !== 'merge') setMergePicks([]); }
                else onMergeTable?.();
              }}
            />
          </ActionGrid>

          {/* Inline table picker — the prompt() replacement */}
          <AnimatePresence initial={false}>
            {pickMode && (
              <motion.div
                initial={{ opacity: 0, y: 8, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: 4, height: 0, transition: { duration: 0.22, ease: [0.45, 0, 0.55, 1] } }}
                transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <div className="mt-3 rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between mb-2.5">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/45">
                      {pickMode === 'move' ? (t('target_table_prompt') || 'Hədəf masa') : (t('merge_tables_prompt') || 'Birləşdiriləcək masalar')}
                    </p>
                    <button
                      onClick={closePicker}
                      className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center text-white/50 active:scale-90 transition-all"
                    >
                      <X size={11} />
                    </button>
                  </div>
                  {pickOptions.length === 0 ? (
                    <p className="text-xs font-bold text-white/35 py-2">Boş masa yoxdur</p>
                  ) : (
                    <div className="grid grid-cols-6 gap-1.5 max-h-32 overflow-y-auto">
                      {pickOptions.map(ft => {
                        const on = pickMode === 'merge' && mergePicks.includes(ft.table_number);
                        return (
                          <motion.button
                            key={ft.table_number}
                            whileTap={{ scale: 0.92 }}
                            onClick={() => handlePick(ft.table_number)}
                            className={`h-10 rounded-xl text-xs font-black border transition-colors ${
                              on
                                ? 'bg-indigo-500 border-indigo-400 text-white'
                                : 'bg-white/[0.04] border-white/10 text-white/70 hover:border-white/25'
                            }`}
                          >
                            {ft.table_number}
                          </motion.button>
                        );
                      })}
                    </div>
                  )}
                  {pickMode === 'merge' && (
                    <button
                      onClick={confirmMerge}
                      disabled={mergePicks.length === 0}
                      className={`mt-3 w-full py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
                        mergePicks.length > 0
                          ? 'bg-indigo-500 hover:bg-indigo-400 text-white active:scale-[0.98]'
                          : 'bg-white/5 text-white/25 cursor-not-allowed'
                      }`}
                    >
                      <Check size={14} />
                      {t('merge')}: Masa {table.table_number}
                      {mergePicks.length > 0 && ` + ${mergePicks.sort((a, b) => a - b).join(' + ')}`}
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── 4. Destructive, separated ── */}
        <div className="mt-3 pt-3 border-t border-white/10">
          <ActionGrid cols={2}>
            <ActionCard
              icon={<UserX size={22} strokeWidth={2.5} />}
              label={t('no_show' as any) || 'No Show'}
              variant="destructive"
              onClick={() => { closePicker(); onMarkNoShow?.(); }}
            />
            <ActionCard
              icon={<Ban size={22} strokeWidth={2.5} />}
              label={t('cancel')}
              variant="destructive"
              onClick={() => { closePicker(); onCancelReservation?.(); }}
            />
          </ActionGrid>
        </div>
      </TableActionSheet>
    </>
  );
}
