'use client';

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DndContext, useDraggable, useDroppable, DragOverlay,
  PointerSensor, TouchSensor, useSensor, useSensors,
  type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { rectSortingStrategy, SortableContext } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Order, TableFilterType, TableFloor } from '../types';
import { getOrderAgeMinutes, getKitchenStatusConfig } from '../utils';
import { GitMerge } from 'lucide-react';
import { toast } from '@/lib/toast';
import { supabase } from '@/lib/supabase';

/* ─── TableCell ─── */
const TableCell = React.memo(function TableCell({
  num, isDraggable, isDragging: parentIsDragging,
  onClick, onMouseEnter, onMouseMove, onMouseLeave, style, className, colSpan = 1, children,
}: {
  num: number;
  isDraggable: boolean;
  isDropTarget: boolean;
  isDragging: boolean;
  onClick: () => void;
  onMouseEnter?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onMouseMove?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onMouseLeave?: () => void;
  style?: React.CSSProperties;
  className?: string;
  colSpan?: number;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({
    id: String(num),
    disabled: !isDraggable,
  });
  const { setNodeRef: setDropRef } = useDroppable({ id: String(num) });

  const setRef = useCallback((el: HTMLButtonElement | null) => {
    setDragRef(el);
    setDropRef(el);
  }, [setDragRef, setDropRef]);

  const dragStyle: React.CSSProperties = transform ? {
    transform: CSS.Translate.toString(transform),
    zIndex: isDragging ? 999 : 50,
    cursor: isDragging ? 'grabbing' : 'grab',
    transition: 'none',
  } : {
    transition: 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
  };

  const isBeingDragged = isDragging || parentIsDragging;

  return (
    <div
      className="relative group/table"
      style={colSpan > 1 ? { gridColumn: `span ${colSpan}` } : undefined}
    >
      <button
        ref={setRef}
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        style={{ ...style, ...dragStyle, ...(isBeingDragged ? { visibility: 'hidden', boxShadow: 'none' } : {}) }}
        className={`group/btn ${className}`}
        {...(isDraggable ? { ...listeners, ...attributes } : {})}
      >
        {children}
      </button>
    </div>
  );
});

/* ─── TableTooltip ─── */
function TableTooltip({
  order, visible, position, delayThreshold = 30, t,
}: {
  order: Order | null;
  visible: boolean;
  position: { x: number; y: number } | null;
  delayThreshold?: number;
  t: (key: string) => string;
}) {
  if (!visible || !order || !position) return null;

  const ageMin       = order.kitchen_accepted_at ? getOrderAgeMinutes(order.kitchen_accepted_at) : 0;
  const kitchenStatus = order.kitchen_status || 'pending';
  const kitchenCfg   = getKitchenStatusConfig(kitchenStatus, ageMin, t);
  const prepTime     = order.kitchen_accepted_at && order.kitchen_ready_at
    ? Math.round((new Date(order.kitchen_ready_at).getTime() - new Date(order.kitchen_accepted_at).getTime()) / 60000)
    : null;

  return createPortal(
    <div
      className="fixed z-[9999] pointer-events-none"
      style={{ left: position.x, top: position.y - 10, transform: 'translate(-50%, -100%)' }}
    >
      <div className="opacity-100 transition-all duration-200">
        <div className="relative bg-black/90 backdrop-blur-xl border border-white/[0.15] rounded-xl px-4 py-3 shadow-[0_12px_40px_rgba(0,0,0,0.7)] min-w-[160px]">
          <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/[0.06] via-transparent to-white/[0.02] pointer-events-none" />
          <div className="relative">
            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border mb-2 ${kitchenCfg.bg} ${kitchenCfg.color} ${kitchenCfg.border}`}>
              {kitchenCfg.label}
            </div>
            <p className="text-base font-black text-gold tabular-nums">{order.total_amount?.toFixed(2)} ₼</p>
            {order.order_items && order.order_items.length > 0 && (
              <div className="mt-1.5 space-y-1">
                <p className="text-[11px] text-white/60">{order.order_items.length} {t('grid_product_count')}</p>
                {prepTime && <p className="text-[10px] text-emerald-400/90">{prepTime} {t('grid_prep_done')}</p>}
                {order.kitchen_accepted_at && !order.kitchen_ready_at && (() => {
                  const isOverdue = (kitchenStatus === 'cooking' || kitchenStatus === 'preparing') && ageMin >= delayThreshold;
                  return (
                    <p className={`text-[10px] ${isOverdue ? 'text-red-400/90 font-bold' : 'text-[var(--theme-blue)]/90'}`}>
                      {isOverdue ? `${t('grid_status_overdue')} — ${ageMin} dəq` : t('grid_preparing_hint')}
                    </p>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
        <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-black/90 border-b border-r border-white/[0.15] rotate-45" />
      </div>
    </div>,
    document.body
  );
}

/* ─── TableStatusGrid ─── */
export interface TableStatusGridProps {
  orders: Order[];
  allOrders: Order[];
  onTableClick: (order: Order) => void;
  onClearTable: (tableNum: number) => Promise<void>;
  onEmptyTableClick: (tableNum: number) => void;
  tableCount: number;
  tableFilter: TableFilterType;
  setTableFilter: (f: TableFilterType) => void;
  loading: boolean;
  t: (key: any) => string;
  delayThreshold: number;
  onMergeTables?: (sourceOrderId: string, targetOrderId: string) => void;
  onMoveTable?: (orderId: string, toTableNum: number) => void;
  onEmptyMerge?: (tableNums: number[]) => void;
  onAddEmptyTable?: (emptyTableNum: number, targetOrderId: string) => void;
  onDragStateChange?: (isDragging: boolean) => void;
  isCompact?: boolean;
}

export function TableStatusGrid({
  orders, allOrders, onTableClick, onEmptyTableClick, tableCount,
  tableFilter, setTableFilter, loading, t, delayThreshold,
  onMergeTables, onMoveTable, onEmptyMerge, onAddEmptyTable, onDragStateChange, isCompact,
}: TableStatusGridProps) {
  const [draggingNum, setDraggingNum] = useState<number | null>(null);
  const [overNum, setOverNum]         = useState<number | null>(null);
  const overNumRef                    = useRef<number | null>(null);
  const hoverTimerRef                 = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverTargetRef                = useRef<number | null>(null);
  const [hoverProgress, setHoverProgress] = useState<{ num: number; pct: number } | null>(null);
  const hoverRafRef                   = useRef<number | null>(null);
  const mergeChainRef                 = useRef<number[]>([]); // tables chained during drag
  const [ghostChain, setGhostChain]   = useState<number[]>([]); // for visual
  const [pendingMerge, setPendingMerge] = useState<{
    sourceNum: number; targetNum: number; sourceOrderId?: string; targetOrderId?: string; extraChain?: number[];
  } | null>(null);
  const [, setMergeSuccess] = useState<number[] | null>(null);

  const [tooltipState, setTooltipState] = useState<{
    visible: boolean; order: Order | null; position: { x: number; y: number } | null;
  }>({ visible: false, order: null, position: null });

  const [floorAssignments, setFloorAssignments] = useState<Map<number, string>>(new Map());
  const [selectedFloor, setSelectedFloor] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('table_floors').select('*').order('sort_order').then(({ data }) => {
      if (data) {
        const map = new Map<number, string>();
        (data as TableFloor[]).forEach(f => map.set(f.table_number, f.floor_name));
        setFloorAssignments(map);
      }
    });
  }, []);

  const floorNames = useMemo(() => {
    const names = new Set(floorAssignments.values());
    return Array.from(names);
  }, [floorAssignments]);

  useEffect(() => { onDragStateChange?.(draggingNum !== null); }, [draggingNum, onDragStateChange]);

  const gridRef = useRef<HTMLDivElement>(null);
  const [gridCols, setGridCols] = useState(8);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      const colMin = 120;
      const gap = 6;
      const colStep = colMin + gap;
      const c = Math.max(1, Math.floor((w + gap) / colStep));
      setGridCols(c);
      setContainerWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  const cancelHoverTimer = useCallback(() => {
    if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null; }
    if (hoverRafRef.current) { cancelAnimationFrame(hoverRafRef.current); hoverRafRef.current = null; }
    hoverTargetRef.current = null;
    setHoverProgress(null);
  }, []);

  const handleDragStart  = useCallback((e: DragStartEvent)  => {
    const srcNum = Number(e.active.id);
    setDraggingNum(srcNum);
    setTooltipState({ visible: false, order: null, position: null });
    cancelHoverTimer();
    mergeChainRef.current = [srcNum];
    setGhostChain([srcNum]);
  }, [cancelHoverTimer]);
  const handleDragOver   = useCallback((e: DragOverEvent) => {
    const n = e.over?.id ? Number(e.over.id) : null;
    const srcNum = Number(e.active.id);
    if (n !== overNumRef.current) {
      overNumRef.current = n;
      setOverNum(n);
      cancelHoverTimer();
      if (n !== null && n !== srcNum) {
        hoverTargetRef.current = n;
        const HOVER_MS = 2000;
        const startTime = Date.now();
        const tick = () => {
          const elapsed = Date.now() - startTime;
          const pct = Math.min(elapsed / HOVER_MS, 1);
          setHoverProgress({ num: n, pct });
          if (pct < 1) { hoverRafRef.current = requestAnimationFrame(tick); }
        };
        hoverRafRef.current = requestAnimationFrame(tick);
        // Capture current orders snapshot for use in timer
        const ordersSnap = orders;
        hoverTimerRef.current = setTimeout(() => {
          cancelHoverTimer();
          // Add to chain if not already there and target is empty
          const targetOrder = ordersSnap.find(o => o.table_number === n && o.status !== 'paid' && !o.merged_into);
          if (!targetOrder && !mergeChainRef.current.includes(n)) {
            mergeChainRef.current = [...mergeChainRef.current, n];
            setGhostChain([...mergeChainRef.current]);
          }
        }, HOVER_MS);
      }
    }
  }, [cancelHoverTimer, orders, onAddEmptyTable]);

  // O(1) lookup maps — rebuilt once per allOrders change
  const { ordersByTable } = useMemo(() => {
    const byTable = new Map<number, Order[]>();
    for (const o of allOrders) {
      if (o.table_number !== null) {
        const t = byTable.get(o.table_number) ?? [];
        t.push(o);
        byTable.set(o.table_number, t);
      }
    }
    
    return { ordersByTable: byTable };
  }, [allOrders]);

  const getTableStatus = useCallback((num: number) => {
    const tableOrders = ordersByTable.get(num) ?? [];
    
    // Child table (merged into another) — hide as empty
    // Only consider as child if order has valid merged_into and is not paid
    const isChild = tableOrders.some(o => o.merged_into && o.status !== 'paid' && o.merged_into !== '');
    if (isChild) {
      return { status: 'empty', order: null };
    }

    // Active independent orders for this table
    const active = tableOrders
      .filter(o => o.status !== 'paid' && !o.merged_into)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    if (active.length === 0) {
      return { status: 'empty', order: null };
    }

    const latest = active[0];
    return { status: latest.status, order: latest };
  }, [ordersByTable]);

  const handleDragEnd    = useCallback((e: DragEndEvent) => {
    const sourceNum = Number(e.active.id);
    const targetNum = e.over ? Number(e.over.id) : null;
    const chain = mergeChainRef.current;
    setDraggingNum(null); setOverNum(null); overNumRef.current = null;
    setGhostChain([]);
    mergeChainRef.current = [];
    cancelHoverTimer();

    // If chain has 2+ tables (including source), create merged order from entire chain
    if (chain.length >= 2) {
      const [primary, ...rest] = chain;
      const primaryOrder = allOrders.find(o => o.table_number === primary && o.status !== 'paid' && !o.merged_into);
      const targetOrder  = allOrders.find(o => o.table_number === rest[rest.length - 1] && o.status !== 'paid' && !o.merged_into);
      setPendingMerge({
        sourceNum: primary,
        targetNum: rest[rest.length - 1],
        sourceOrderId: primaryOrder?.id,
        targetOrderId: targetOrder?.id,
        extraChain: rest,
      });
      return;
    }

    if (!targetNum || sourceNum === targetNum) return;
    
    // Use allOrders for complete picture and check merged status
    const sourceOrder = allOrders.find(o => o.table_number === sourceNum && o.status !== 'paid' && !o.merged_into);
    const targetOrder = allOrders.find(o => o.table_number === targetNum && o.status !== 'paid' && !o.merged_into);
    const sourceEmpty = !sourceOrder;
    const targetEmpty = !targetOrder;
    
    // Additional validation: check if tables are in compatible states
    
    if (!sourceEmpty && !targetEmpty) {
      toast(`⚠️ Aktiv masaları birləşdirmək üçün sifariş modalından istifadə edin`, { icon: '⚠️', duration: 3000, style: { background: '#1a1200', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.35)', fontWeight: 'bold' } });
      return;
    }
    
    if (!sourceEmpty && targetEmpty) {
      toast(`⚠️ Aktiv masanı boş masaya köçürmək üçün sifariş modalından istifadə edin`, { icon: '⚠️', duration: 3000, style: { background: '#1a1200', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.35)', fontWeight: 'bold' } });
      return;
    }
    
    // Prevent merging if source has kitchen_status beyond 'pending' (already being prepared)
    if (!sourceEmpty && sourceOrder.kitchen_status && sourceOrder.kitchen_status !== 'pending') {
      toast(`⚠️ Hazırlanmaqda olan sifarişi birləşdirmək mümkün deyil`, { icon: '⚠️', duration: 3000, style: { background: '#1a1200', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.35)', fontWeight: 'bold' } });
      return;
    }
    if (sourceEmpty && !targetEmpty) {
      onAddEmptyTable?.(sourceNum, targetOrder.id);
      return;
    }
    setPendingMerge({ sourceNum, targetNum, sourceOrderId: undefined, targetOrderId: undefined });
  }, [allOrders, getTableStatus, onMergeTables, cancelHoverTimer, onAddEmptyTable, onEmptyMerge]);

  const handleTableMouseEnter = useCallback((order: Order, e: React.MouseEvent) => {
    if (draggingNum !== null) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTooltipState({ visible: true, order, position: { x: rect.left + rect.width / 2, y: rect.top } });
  }, [draggingNum]);
  const handleTableMouseMove = useCallback((_e: React.MouseEvent) => {
    /* intentionally no-op: tooltip is anchored to cell, not cursor */
  }, []);
  const handleTableMouseLeave = useCallback(() => {
    setTooltipState(prev => ({ ...prev, visible: false }));
  }, []);

  const tableList  = useMemo(() => Array.from({ length: tableCount }, (_, i) => i + 1), [tableCount]);

  const mergedTableNums = useMemo(() => {
    const childNumbers = new Set<number>();
    ordersByTable.forEach((tableOrders, tableNum) => {
      if (tableOrders.some(o => o.merged_into && o.status !== 'paid' && o.merged_into !== '')) {
        childNumbers.add(tableNum);
      }
    });
    
    return childNumbers;
  }, [ordersByTable]);

  const visibleTables = useMemo(() => {
    const filtered = tableList.filter(num => {
      // Child masalar həmişə grid-də qalır (boş kart kimi) — yalnız 'active' filtrdə gizlədilir
      if (mergedTableNums.has(num)) {
        if (tableFilter === 'active') return false; // active tab-da child göstərmə
        return true; // all / empty tab-da göstər
      }

      const { status } = getTableStatus(num);
      if (tableFilter === 'active' && status === 'empty') return false;
      if (tableFilter === 'empty' && status !== 'empty') return false;

      return true;
    });

    return filtered;
  }, [tableList, mergedTableNums, getTableStatus, tableFilter]);

  const gridRows = useMemo(() => Math.max(1, Math.ceil(visibleTables.length / gridCols)), [visibleTables.length, gridCols]);

  const compactGridHeight = useMemo(() => {
    if (!isCompact || !containerWidth) return undefined;
    const colMin = 56;
    const gap = 4;
    const compactCols = Math.max(1, Math.floor((containerWidth + gap) / (colMin + gap)));
    const totalGapX = (compactCols - 1) * gap;
    const colWidth = (containerWidth - totalGapX) / compactCols;
    const compactRows = Math.max(1, Math.ceil(visibleTables.length / compactCols));
    const totalGapY = (compactRows - 1) * gap;
    const maxH = window.innerHeight * 0.22;
    return Math.min(colWidth * compactRows + totalGapY, maxH);
  }, [isCompact, containerWidth, visibleTables.length]);

  const _filterBtn = (key: TableFilterType, label: string, count: number) => (
    <button
      key={key}
      onClick={() => setTableFilter(key)}
      className={`relative px-5 py-2 text-xs uppercase tracking-[0.15em] font-semibold transition-colors duration-150 ${
        tableFilter === key ? 'text-white' : 'text-white/60 hover:text-white/90'
      }`}
    >
      {tableFilter === key && (
        <motion.span layoutId="tableFilterIndicator" transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          className="absolute inset-0 rounded-lg bg-white/[0.12]" />
      )}
      <span className="relative z-10 flex items-center gap-1.5">
        {label}
        {key !== 'all' && key !== 'empty' && count > 0 && (
          <span className="w-1 h-1 rounded-full bg-current opacity-70" />
        )}
      </span>
    </button>
  );

  if (loading) {
    return <div className="mb-8 h-[180px]" />;
  }

  return (
    <>
      <div
        className={`relative bg-white/[0.03] border border-white/[0.07] rounded-2xl px-2 pt-2 pb-0 backdrop-blur-sm flex flex-col ${isCompact ? '' : 'h-full'}`}
        style={{ overflow: isCompact ? 'hidden auto' : 'clip' }}
      >

        <div className="flex flex-wrap items-center gap-3 mb-2 flex-shrink-0">
          <p className="text-[9px] uppercase tracking-[0.25em] text-white/60 font-semibold">{t('table_status')}</p>
          {floorNames.length > 1 && (
            <div className="flex items-center gap-1 ml-auto">
              <button onClick={() => setSelectedFloor(null)}
                className={`px-2.5 py-1.5 rounded-lg text-[9px] font-bold tracking-wider uppercase transition-all ${!selectedFloor ? 'bg-white/15 text-white' : 'bg-white/[0.04] text-white/40 hover:text-white/70'}`}>
                {t('all_floors')}
              </button>
              {floorNames.map(name => (
                <button key={name} onClick={() => setSelectedFloor(name)}
                  className={`px-2.5 py-1.5 rounded-lg text-[9px] font-bold tracking-wider uppercase transition-all ${selectedFloor === name ? 'bg-white/15 text-white' : 'bg-white/[0.04] text-white/40 hover:text-white/70'}`}>
                  {name}
                </button>
              ))}
            </div>
          )}
        </div>

        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}
          autoScroll={{ threshold: { x: 0.2, y: 0.2 }, acceleration: 10 }}>
          <SortableContext items={visibleTables.map(String)} strategy={rectSortingStrategy}>
            <div
              ref={gridRef}
              key={`${tableFilter}-${selectedFloor || 'all'}`}
              className={`grid min-h-0 ${isCompact ? 'gap-2 overflow-y-auto' : 'gap-1.5 sm:gap-2 overflow-visible items-center'} flex-1`}
              style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${isCompact ? 56 : 120}px, 1fr))`, gridTemplateRows: isCompact ? `repeat(${gridRows}, auto)` : `repeat(${gridRows}, minmax(90px, 1fr))`, height: isCompact && compactGridHeight ? compactGridHeight : undefined }}
            >
              {visibleTables.filter(num => !selectedFloor || floorAssignments.get(num) === selectedFloor || !floorAssignments.has(num)).map((num) => {
                if (mergedTableNums.has(num)) return null;

                const { status, order } = getTableStatus(num);
                const isEmpty     = status === 'empty';
                const kitchenStatus  = order?.kitchen_status || 'pending';
                const isNew       = status === 'new' || (status === 'confirmed' && kitchenStatus === 'pending' && !order?.kitchen_accepted_at);
                const isConfirmed = status === 'confirmed' && !isNew;

                const ageBase        = order?.kitchen_accepted_at ?? null;
                const ageMin         = ageBase ? getOrderAgeMinutes(ageBase) : 0;


                const mergedFromNums = !isEmpty && order
                  ? allOrders.filter(o => o.merged_into === order.id && o.table_number !== null).map(o => o.table_number as number)
                  : [];
                const isMerged = mergedFromNums.length > 0;

                const glowColor = 'rgba(255,255,255,0.2)';

                const isOverdue      = !isNew && kitchenStatus !== 'ready' && !!order?.kitchen_accepted_at && ageMin >= delayThreshold;
                const isReadyFlash   = kitchenStatus === 'ready';
                const isDragTarget   = overNum === num && draggingNum !== null && draggingNum !== num;
                const isDraggingThis = draggingNum === num;
                const isGhostChained = ghostChain.includes(num) && num !== draggingNum;

                return (
                  <div
                    key={num}
                    className={`
                      ${isGhostChained ? 'scale-110' : ''}
                      ${isDragTarget ? 'scale-105' : ''}
                    `}
                    style={{ transition: 'transform 0.2s ease', ...(isMerged ? { gridColumn: 'span 2' } : {}) }}
                  >
                  <TableCell
                    key={num}
                    num={num}
                    isDraggable={!isEmpty ? !!order : true}
                    isDropTarget={isDragTarget}
                    isDragging={isDraggingThis}
                    onClick={() => isEmpty ? onEmptyTableClick(num) : order && onTableClick(order)}
                    onMouseEnter={!isEmpty && order ? (e) => handleTableMouseEnter(order, e) : undefined}
                    onMouseMove={!isEmpty && order ? handleTableMouseMove : undefined}
                    onMouseLeave={handleTableMouseLeave}
                    colSpan={1}
                    style={isEmpty && isDragTarget ? {
                      boxShadow: '0 0 28px rgba(212,175,55,0.7), 0 0 0 2px rgba(212,175,55,0.55)',
                      transform: 'scale(1.08)',
                      transition: 'box-shadow 0.15s ease, transform 0.15s ease',
                    } : (isNew || isConfirmed) ? {
                      boxShadow: (isDragTarget
                        ? `0 0 32px rgba(245,158,11,0.7), 0 0 0 2px rgba(245,158,11,0.5), 0 0 16px ${glowColor}`
                        : isMerged
                          ? '0 0 12px rgba(245,158,11,0.2), 0 0 0 1px rgba(245,158,11,0.25)'
                          : '0 0 16px ' + glowColor) + ', inset 0 1px 0 rgba(255,255,255,0.05)',
                      ...(isDragTarget ? { transform: 'scale(1.1)' } : {}),
                    } : undefined}
                    className={`relative w-full flex items-center justify-center font-bold text-base
                      ${isEmpty && !isGhostChained && !isDragTarget ? 'rounded-2xl text-white/40 bg-white/[0.04] border border-white/[0.12]' : ''}
                      ${isEmpty && isDragTarget && !isGhostChained ? 'rounded-2xl text-gold/60 bg-gold/[0.06] border border-gold/50' : ''}
                      ${isGhostChained ? 'rounded-2xl text-gold/80 bg-gold/[0.08] border border-gold/40' : ''}
                      ${(isNew || isConfirmed) ? `rounded-2xl bg-white/[0.10] text-white border border-white transition-all duration-200 active:scale-90` : ''}
                      ${!isEmpty && (isReadyFlash || isOverdue) ? 'animate-ring-breathe' : ''}

                      ${isMerged ? 'self-stretch' : 'aspect-square'}
                    `}
                  >
                    {/* Hover merge progress ring — premium */}
                    {hoverProgress && hoverProgress.num === num && hoverProgress.pct > 0.15 && (() => {
                      const r = 23; const circ = 2 * Math.PI * r;
                      const pct = hoverProgress.pct;
                      const opacity = Math.min((pct - 0.15) / 0.15, 1);
                      const nearDone = pct > 0.85;
                      return (
                        <svg className="absolute inset-0 w-full h-full pointer-events-none z-20" viewBox="0 0 56 56"
                          style={{ opacity, transition: 'opacity 0.15s ease' }}>
                          <defs>
                            <linearGradient id={`hp-${num}`} x1="0%" y1="0%" x2="100%" y2="100%">
                              <stop offset="0%" stopColor="#D4AF37" stopOpacity="0.9" />
                              <stop offset="100%" stopColor="#FFE066" stopOpacity="1" />
                            </linearGradient>
                            <filter id={`hpglow-${num}`} x="-40%" y="-40%" width="180%" height="180%">
                              <feGaussianBlur stdDeviation={nearDone ? '3' : '1.5'} result="blur" />
                              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                            </filter>
                          </defs>
                          {/* Track */}
                          <circle cx="28" cy="28" r={r} fill="none" stroke="rgba(212,175,55,0.12)" strokeWidth="2.5" />
                          {/* Progress arc */}
                          <circle cx="28" cy="28" r={r} fill="none"
                            stroke={`url(#hp-${num})`}
                            strokeWidth={nearDone ? '3' : '2.5'}
                            strokeDasharray={`${circ * pct} ${circ}`}
                            strokeLinecap="round"
                            transform="rotate(-90 28 28)"
                            filter={`url(#hpglow-${num})`}
                            style={{ transition: 'stroke-width 0.2s ease' }}
                          />
                          {/* Center dot pulse when near done */}
                          {nearDone && (
                            <circle cx="28" cy="28" r="3" fill="#FFE066" opacity={0.9}
                              style={{ animation: 'hoverPulse 0.5s ease-in-out infinite alternate' }} />
                          )}
                        </svg>
                      );
                    })()}
                    {/* SVG status ring */}
                    {(isNew || isConfirmed) && (() => {
                      const vw = 56;
                      const vh = 56;
                      const w  = vw - 3;
                      const h  = vh - 3;
                      const rx = 13;
                      const c1 = '#ffffff';
                      const c2 = 'rgba(255,255,255,0.5)';
                      return (
                        <svg className="absolute inset-0 w-full h-full" viewBox={`0 0 ${vw} ${vh}`} preserveAspectRatio="none">
                          <defs>
                            <linearGradient id={`pg-${num}`} x1="0%" y1="0%" x2="100%" y2="100%">
                              <stop offset="0%" stopColor={c1} stopOpacity="1" />
                              <stop offset="100%" stopColor={c2} stopOpacity="0.5" />
                            </linearGradient>
                          </defs>
                          <rect x="1.5" y="1.5" width={w} height={h} rx={rx} ry={rx} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1.5" />
                          <rect x="1.5" y="1.5" width={w} height={h} rx={rx} ry={rx} fill="none"
                            stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" strokeLinecap="round"
                            style={{ filter: 'drop-shadow(0 0 6px rgba(255,255,255,0.4))' }}
                          />
                        </svg>
                      );
                    })()}

                    {isEmpty && <div className="absolute inset-0 rounded-2xl border border-white/[0.08] bg-white/[0.02]" />}

                    {isEmpty ? (
                      <span className="relative z-10 transition-all duration-200 text-white/55 group-hover/btn:text-white/90 group-hover/btn:scale-110">
                        <span className="group-hover/btn:hidden">{num}</span>
                        <span className="hidden group-hover/btn:block text-xl font-thin">+</span>
                      </span>
                    ) : (
                      <span className="relative z-10 flex flex-col items-center leading-none gap-0.5">
                        {isMerged ? (
                          <span className="flex flex-col items-center gap-0.5">
                            {(() => {
                              const allMergedParents = allOrders
                                .filter(o => o.status !== 'paid' && o.table_number !== null && allOrders.some(c => c.merged_into === o.id))
                                .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
                              const gIdx = allMergedParents.findIndex(o => o.id === order?.id);
                              const gNum = gIdx + 1;
                              return (
                                <span className={`${isCompact ? 'text-[8px]' : 'text-[11px]'} font-black tracking-wide leading-none whitespace-nowrap`} style={{ background: 'linear-gradient(135deg,#D4AF37,#F5D67B)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                                   {t('group_label_short' as any) || t('group_label' as any)} {gNum}
                                </span>
                              );
                            })()}
                            {/* Kitchen status + time */}
                            <span className={`inline-flex items-center gap-1 ${isCompact ? 'text-[7px]' : 'text-[10px]'} font-bold tracking-tight text-white`}>
                              {kitchenStatus === 'ready' ? t('grid_status_ready' as any)
                                : (kitchenStatus === 'cooking' || kitchenStatus === 'preparing') ? t('grid_status_preparing' as any)
                                : t('grid_status_pending' as any)}
                              {ageMin > 0 && <span>• {ageMin}d</span>}
                            </span>
                          </span>
                        ) : (
                          <span className={`font-black ${isCompact ? 'text-xs' : 'text-base'} tracking-tight`} style={{ color: '#ffffff' }}>
                            {num}
                          </span>
                        )}
                        {!isMerged && ageMin > 0 && (
                          <span className={`${isCompact ? 'text-[8px]' : 'text-[10px]'} tabular-nums font-medium`} style={{ color: '#ffffff' }}>
                            {ageMin}d
                          </span>
                        )}
                        {!isMerged && order?.guest_count && order.guest_count > 1 && (
                          <span className={`${isCompact ? 'text-[7px]' : 'text-[8px]'} font-semibold text-white/40 flex items-center gap-0.5`}>
                            {order.guest_count} {t('guest_short')}
                          </span>
                        )}
                      </span>
                    )}
                  </TableCell>
                  </div>
                );
              })}

              <TableTooltip
                order={tooltipState.order}
                visible={tooltipState.visible}
                position={tooltipState.position}
                delayThreshold={delayThreshold}
                t={t}
              />
            </div>
          </SortableContext>

          {typeof document !== 'undefined' && createPortal(
            <DragOverlay
              dropAnimation={null}
              style={{ zIndex: 9999, pointerEvents: 'none' }}
            >
              {(() => {
                if (!draggingNum) return null;
                const { order: dOrder } = getTableStatus(draggingNum);
                const dAgeMin       = dOrder?.kitchen_accepted_at ? getOrderAgeMinutes(dOrder.kitchen_accepted_at) : 0;
                const dKitchen      = dOrder?.kitchen_status || 'pending';
                const dIsNew        = dOrder?.status === 'new';
                const dIsMerged     = dOrder ? allOrders.filter(o => o.merged_into === dOrder.id && o.table_number !== null).length > 0 : false;
                const numColor      = 'rgba(255,255,255,0.72)';
                const glowColor     = 'rgba(255,255,255,0.2)';
                const sz = 56, rx = 13;
                const mergedChildOrders = dIsMerged
                  ? allOrders.filter(o => o.merged_into === dOrder!.id && o.table_number !== null)
                  : [];
                const mergedNums = dIsMerged
                  ? [draggingNum, ...mergedChildOrders.map(o => o.table_number as number)]
                  : [draggingNum];
                const isMergedPreview = mergedNums.length > 1;
                const groupNum = (() => {
                  if (!dIsMerged || !dOrder) return draggingNum;
                  const allMergedParents = allOrders
                    .filter(o => o.status !== 'paid' && o.table_number !== null && allOrders.some(c => c.merged_into === o.id))
                    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
                  const gIdx = allMergedParents.findIndex(o => o.id === dOrder.id);
                  return gIdx + 1;
                })();
                return (
                  <div
                    className={`rounded-2xl bg-white/[0.07] border border-white/[0.1] flex items-center justify-center cursor-grabbing relative overflow-hidden ${isMergedPreview ? 'h-[72px] px-6' : 'w-[64px] h-[64px]'}`}
                    style={{
                      boxShadow: `0 25px 50px rgba(0,0,0,0.6), 0 0 32px ${glowColor}, 0 0 0 1px rgba(255,255,255,0.08)`,
                      borderColor: 'rgba(255,255,255,0.4)',
                    }}
                  >
                    {isMergedPreview ? (
                      <span className="relative z-10 flex flex-col items-center leading-none gap-0.5">
                        <span className="font-black text-xs tracking-tight" style={{ color: numColor, filter: `drop-shadow(0 0 8px ${glowColor})` }}>
                          GROUP {groupNum}
                        </span>
                        <span className="text-[9px] font-medium" style={{ color: numColor, opacity: 0.7 }}>
                          {mergedNums.join('+')}
                        </span>
                      </span>
                    ) : (
                      <span className="relative z-10 flex flex-col items-center leading-none gap-0.5">
                        <span className="font-black text-sm tracking-tight" style={{ color: numColor, filter: `drop-shadow(0 0 8px ${glowColor})` }}>
                          {draggingNum}
                        </span>
                        {dAgeMin > 0 && (
                          <span className="text-[9px] tabular-nums font-medium" style={{ color: numColor, opacity: 0.85 }}>
                            {dAgeMin}d
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                );
              })()}
            </DragOverlay>,
            document.body
          )}
        </DndContext>
      </div>

      {/* Merge confirmation modal */}
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
              className="bg-[#1a1a1a] border border-gold/30 rounded-2xl p-6 max-w-full sm:max-w-sm w-full mx-4 shadow-[0_25px_50px_rgba(0,0,0,0.5)]"
              onClick={e => e.stopPropagation()}
            >
              <div className="text-center mb-6">
                {/* Statik ikon - CPU qızdırmır */}
                <div className="w-16 h-16 rounded-full bg-gold/10 flex items-center justify-center mx-auto mb-4">
                  <GitMerge size={32} className="text-gold" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">
                  {pendingMerge.sourceOrderId && pendingMerge.targetOrderId
                    ? t('merge_tables_confirm')
                    : pendingMerge.sourceOrderId
                      ? t('move_table')
                      : pendingMerge.targetOrderId
                        ? t('merge_table')
                        : t('merge_tables')}
                </h3>
                <p className="text-white/60 text-sm">
                  {[pendingMerge.sourceNum, ...(pendingMerge.extraChain || [pendingMerge.targetNum])].map(n => `${t('table_label')} ${n}`).join(' + ')}
                  {pendingMerge.sourceOrderId && pendingMerge.targetOrderId
                    ? ` ${t('orders_will_merge')}`
                    : pendingMerge.sourceOrderId
                      ? t('move_to_empty_table')
                      : pendingMerge.targetOrderId
                        ? t('add_to_existing_order')
                        : t('create_merged_order')}
                </p>
              </div>
              <div className="flex gap-3">
                <motion.button 
                  onClick={() => setPendingMerge(null)}
                  whileHover={{ scale: 1.02, backgroundColor: 'rgba(255,255,255,0.05)' }}
                  whileTap={{ scale: 0.98 }}
                  className="flex-1 py-3 px-4 rounded-xl border border-white/20 text-white/70 font-semibold hover:bg-white/5 transition-all">
                  {t('cancel')}
                </motion.button>
                <motion.button
                  onClick={async () => {
                    const mergedTables = [pendingMerge.sourceNum, ...(pendingMerge.extraChain || [pendingMerge.targetNum])];
                    if (pendingMerge.sourceOrderId && pendingMerge.targetOrderId) {
                      onMergeTables?.(pendingMerge.sourceOrderId, pendingMerge.targetOrderId);
                    } else if (pendingMerge.sourceOrderId && !pendingMerge.targetOrderId) {
                      onMoveTable?.(pendingMerge.sourceOrderId, pendingMerge.targetNum);
                    } else if (!pendingMerge.sourceOrderId && pendingMerge.targetOrderId) {
                      onAddEmptyTable?.(pendingMerge.sourceNum, pendingMerge.targetOrderId);
                    } else {
                      const chain = [pendingMerge.sourceNum, ...(pendingMerge.extraChain?.length ? pendingMerge.extraChain : [pendingMerge.targetNum])];
                      onEmptyMerge?.(chain);
                    }
                    setMergeSuccess(mergedTables);
                    setPendingMerge(null);
                    setTimeout(() => setMergeSuccess(null), 2000);
                  }}
                  whileHover={{ scale: 1.05, backgroundColor: 'rgba(212,175,55,0.95)' }}
                  whileTap={{ scale: 0.95 }}
                  className="flex-1 py-3 px-4 rounded-xl bg-gold text-black font-bold hover:bg-gold/90 transition-all">
                  {t('merge')}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
