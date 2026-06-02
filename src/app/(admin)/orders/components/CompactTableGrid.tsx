'use client';

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DndContext, useDraggable, useDroppable, DragOverlay,
  PointerSensor, TouchSensor, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { Order } from '../types';
import { getOrderAgeMinutes } from '../utils';
import { GitMerge } from 'lucide-react';

/* ─── Compact Cell ─── */
const CompactCell = React.memo(function CompactCell({
  num, isOccupied, badgeColor, hasBorderGlow, isDragging, isDropTarget, isDragGhost,
  onClick, colSpan,
}: {
  num: number;
  isOccupied: boolean;
  badgeColor: string;
  hasBorderGlow: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  isDragGhost: boolean;
  onClick: () => void;
  colSpan?: number;
}) {
  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging: dndDragging } = useDraggable({
    id: String(num),
    disabled: !isOccupied,
  });
  const { setNodeRef: setDropRef } = useDroppable({ id: String(num) });

  const setRef = useCallback((el: HTMLButtonElement | null) => {
    setDragRef(el);
    setDropRef(el);
  }, [setDragRef, setDropRef]);

  const dragStyle: React.CSSProperties = transform ? {
    transform: CSS.Translate.toString(transform),
    zIndex: 999,
    cursor: 'grabbing',
    transition: 'none',
  } : {
    transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
  };

  const hidden = dndDragging || isDragging;

  return (
    <div
      className="relative"
      style={colSpan && colSpan > 1 ? { gridColumn: `span ${colSpan}` } : undefined}
    >
      <button
        ref={setRef}
        onClick={onClick}
        style={{
          ...dragStyle,
          ...(hidden ? { visibility: 'hidden' } : {}),
        }}
        className={`relative w-full aspect-square flex items-center justify-center rounded-xl text-[11px] font-bold transition-all duration-150 select-none
          ${isDropTarget
            ? 'bg-gold/[0.12] border-2 border-gold/60 text-gold shadow-[0_0_20px_rgba(212,175,55,0.4)] scale-110 z-10'
            : isDragGhost
              ? 'bg-gold/[0.08] border border-gold/40 text-gold/70'
              : isOccupied
                ? 'bg-white/[0.07] border border-white/15 text-white/90 hover:bg-white/[0.10] active:scale-90'
                : 'bg-white/[0.03] border border-white/08 text-white/40 hover:bg-white/[0.06] hover:text-white/70'
          }
          ${hasBorderGlow && isOccupied ? 'shadow-[0_0_12px_rgba(212,175,55,0.25)]' : ''}
        `}
        {...(isOccupied ? { ...listeners, ...attributes } : {})}
      >
        {num}
        {isOccupied && (
          <span
            className={`absolute -top-[1px] -right-[1px] w-2 h-2 rounded-full ring-1 ring-black/40 ${badgeColor}`}
          />
        )}
      </button>
    </div>
  );
});

/* ─── Props ─── */
interface CompactTableGridProps {
  orders: Order[];
  allOrders: Order[];
  tableCount: number;
  onTableClick: (order: Order) => void;
  onEmptyTableClick: (num: number) => void;
  onMergeTables?: (sourceOrderId: string, targetOrderId: string) => void;
  onMoveTable?: (orderId: string, toTableNum: number) => void;
  onAddEmptyTable?: (emptyTableNum: number, targetOrderId: string) => void;
  onEmptyMerge?: (tableNums: number[]) => void;
  onDragStateChange?: (isDragging: boolean) => void;
  compact?: boolean;
  t: (key: any) => string;
}

/* ─── Status helpers ─── */
function getBadgeColor(order: Order, delayThreshold: number): string {
  const ks = order.kitchen_status;
  if (ks === 'ready') return 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]';
  if (ks === 'cooking' || ks === 'preparing') return 'bg-blue-400 shadow-[0_0_6px_rgba(96,165,250,0.6)]';
  if (order.status === 'new') return 'bg-orange-400 shadow-[0_0_6px_rgba(251,146,60,0.5)]';
  const age = order.kitchen_accepted_at ? getOrderAgeMinutes(order.kitchen_accepted_at) : 0;
  if (age >= delayThreshold) return 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.5)]';
  return 'bg-white/30';
}

/* ─── Component ─── */
export function CompactTableGrid({
  orders, allOrders, tableCount,
  onTableClick, onEmptyTableClick,
  onMergeTables, onMoveTable, onAddEmptyTable, onEmptyMerge, onDragStateChange,
  compact = false,
  t,
}: CompactTableGridProps) {
  const [draggingNum, setDraggingNum] = useState<number | null>(null);
  const [overNum, setOverNum] = useState<number | null>(null);
  const [pendingMerge, setPendingMerge] = useState<{
    sourceNum: number; targetNum: number; sourceOrderId?: string; targetOrderId?: string;
  } | null>(null);

  const { ordersByTable } = useMemo(() => {
    const byTable = new Map<number, Order[]>();
    for (const o of allOrders) {
      if (o.table_number !== null) {
        const arr = byTable.get(o.table_number) ?? [];
        arr.push(o);
        byTable.set(o.table_number, arr);
      }
    }
    return { ordersByTable: byTable };
  }, [allOrders]);

  const getTableStatus = useCallback((num: number) => {
    const tableOrders = ordersByTable.get(num) ?? [];
    const isChild = tableOrders.some(o => o.merged_into && o.status !== 'paid');
    if (isChild) return { status: 'empty' as const, order: null };
    const active = tableOrders
      .filter(o => o.status !== 'paid' && !o.merged_into)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    if (active.length === 0) return { status: 'empty' as const, order: null };
    return { status: active[0].status as 'new' | 'confirmed', order: active[0] };
  }, [ordersByTable]);

  useEffect(() => { onDragStateChange?.(draggingNum !== null); }, [draggingNum, onDragStateChange]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  const handleDragStart = useCallback((e: DragStartEvent) => {
    setDraggingNum(Number(e.active.id));
  }, []);

  const handleDragEnd = useCallback((e: DragEndEvent) => {
    const sourceNum = Number(e.active.id);
    const targetNum = e.over ? Number(e.over.id) : null;
    setDraggingNum(null);
    setOverNum(null);

    if (!targetNum || sourceNum === targetNum) return;

    const sourceOrder = allOrders.find(o => o.table_number === sourceNum && o.status !== 'paid' && !o.merged_into);
    const targetOrder = allOrders.find(o => o.table_number === targetNum && o.status !== 'paid' && !o.merged_into);
    const sourceEmpty = !sourceOrder;
    const targetEmpty = !targetOrder;

    if (sourceEmpty && targetEmpty) {
      onEmptyMerge?.([sourceNum, targetNum]);
      return;
    }
    if (!sourceEmpty && targetEmpty) {
      onAddEmptyTable?.(targetNum, sourceOrder!.id);
      return;
    }
    if (!sourceEmpty && !targetEmpty) {
      setPendingMerge({
        sourceNum, targetNum,
        sourceOrderId: sourceOrder!.id,
        targetOrderId: targetOrder!.id,
      });
      return;
    }
    if (sourceEmpty && !targetEmpty) {
      onAddEmptyTable?.(sourceNum, targetOrder!.id);
    }
  }, [allOrders, onMergeTables, onAddEmptyTable, onEmptyMerge]);

  const tableList = useMemo(() => Array.from({ length: tableCount }, (_, i) => i + 1), [tableCount]);

  return (
    <>
      <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-3">
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragOver={(e) => setOverNum(e.over ? Number(e.over.id) : null)}
          onDragEnd={handleDragEnd}
          autoScroll={false}
        >
          <div
            className={`grid overflow-visible ${compact ? 'max-h-[56px] overflow-hidden' : ''}`}
            style={{
              gridTemplateColumns: 'repeat(auto-fill, minmax(48px, 1fr))',
              gap: 5,
            }}
          >
            {tableList.map((num) => {
              const { status, order } = getTableStatus(num);
              const isEmpty = status === 'empty';
              const isDropTarget = overNum === num && draggingNum !== null && draggingNum !== num;
              const isDraggingThis = draggingNum === num;

              return (
                <CompactCell
                  key={num}
                  num={num}
                  isOccupied={!isEmpty && !!order}
                  badgeColor={!isEmpty && order ? getBadgeColor(order, 30) : 'bg-transparent'}
                  hasBorderGlow={!isEmpty && order?.kitchen_status === 'ready'}
                  isDragging={isDraggingThis}
                  isDropTarget={isDropTarget}
                  isDragGhost={false}
                  onClick={() => {
                    if (!isEmpty && order) onTableClick(order);
                    else onEmptyTableClick(num);
                  }}
                />
              );
            })}
          </div>

          {typeof document !== 'undefined' && (
            <DragOverlay dropAnimation={null} style={{ zIndex: 9999, pointerEvents: 'none' }}>
              {draggingNum && (
                <div className="w-[48px] h-[48px] rounded-xl bg-white/[0.12] border border-white/30 flex items-center justify-center text-sm font-bold text-white shadow-[0_8px_24px_rgba(0,0,0,0.5)]">
                  {draggingNum}
                </div>
              )}
            </DragOverlay>
          )}
        </DndContext>
      </div>

      <AnimatePresence>
        {pendingMerge && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 backdrop-blur-sm"
            onClick={() => setPendingMerge(null)}
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0, y: 20 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="bg-[#1a1a1a] border border-gold/30 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="text-center mb-6">
                <div className="w-14 h-14 rounded-full bg-gold/10 flex items-center justify-center mx-auto mb-4">
                  <GitMerge size={28} className="text-gold" />
                </div>
                <h3 className="text-lg font-bold text-white mb-1">{t('merge_tables_confirm')}</h3>
                <p className="text-white/60 text-sm">
                  {t('table_label')} {pendingMerge.sourceNum} + {t('table_label')} {pendingMerge.targetNum}
                </p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setPendingMerge(null)}
                  className="flex-1 py-3 rounded-xl border border-white/20 text-white/70 font-semibold hover:bg-white/5 transition-all">
                  {t('cancel')}
                </button>
                <button
                  onClick={() => {
                    if (pendingMerge.sourceOrderId && pendingMerge.targetOrderId) {
                      onMergeTables?.(pendingMerge.sourceOrderId, pendingMerge.targetOrderId);
                    }
                    setPendingMerge(null);
                  }}
                  className="flex-1 py-3 rounded-xl bg-gold text-black font-bold hover:bg-gold/90 transition-all">
                  {t('merge')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
