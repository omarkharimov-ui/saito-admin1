/**
 * Consolidated UI table status definitions + derived transition rules (Phase-1 G6).
 *
 * DB vocabulary now lives in ./posStatus (verified against live DB). This module is
 * the DERIVED presentation layer only:
 *   - TableStatus values map 1:1 to DB table_floors.status where such a value exists.
 *   - PAYMENT_PENDING and CLEANING are DERIVED/legacy presentation states - they are
 *     NOT stored in table_floors.status (see posStatus.CLEANING_BACKLOG).
 */
import {
  DB_TABLE_STATUS,
  TABLE_UI_ALIASES,
  tableDbToUi,
} from '@/lib/posStatus';

export type TableStatus =
  | 'empty'            // DB
  | 'reserved'         // DB
  | 'occupied'         // DB
  | 'merged'           // DB
  | 'payment_pending'  // DERIVED (occupied + payment_status) — never stored
  | 'cleaning';        // legacy presentation — no canonical DB writer (backlog)

export type OrderStatus = 'new' | 'confirmed' | 'paid' | 'cancelled' | 'checked_in' | 'completed' | 'no_show' | 'archived' | 'pending';

export type KitchenStatus = 'pending' | 'preparing' | 'ready' | null | undefined;

const VALID_TRANSITIONS: Record<TableStatus, TableStatus[]> = {
  empty: ['reserved', 'occupied'],
  reserved: ['occupied', 'empty'],
  occupied: ['merged', 'payment_pending', 'empty'],
  merged: ['occupied', 'empty'],
  payment_pending: ['empty', 'occupied', 'cleaning'],
  cleaning: ['empty'],
};

export function isValidTableTransition(from: TableStatus, to: TableStatus): boolean {
  if (from === to) return true;
  return VALID_TRANSITIONS[from]?.includes(to) || false;
}

export interface TableComputeInput {
  floorStatus: string | null | undefined;
  activeOrders: unknown[];
  mergedIntoTable?: number | null | undefined;
  reservation?: { id: string } | null | undefined;
}

export function computeTableStatus(input: TableComputeInput): TableStatus {
  const { floorStatus, activeOrders, mergedIntoTable, reservation } = input;

  if (mergedIntoTable != null) return 'merged';
  if (reservation != null || floorStatus === 'reserved') return 'reserved';
  if (activeOrders.length > 0) return 'occupied';
  return 'empty';
}

export { DB_TABLE_STATUS, TABLE_UI_ALIASES, tableDbToUi };
