/**
 * Consolidated table status definitions and transition rules.
 * Single source of truth for POS/UI table display states and order statuses.
 */

export enum TableStatus {
  EMPTY = 'empty',
  RESERVED = 'reserved',
  OCCUPIED = 'occupied',
  MERGED = 'merged',
  CLEANING = 'cleaning',
}

export type OrderStatus = 'new' | 'confirmed' | 'paid' | 'cancelled' | 'checked_in' | 'completed' | 'no_show' | 'archived' | 'pending';

export type KitchenStatus = 'pending' | 'preparing' | 'ready' | null | undefined;

const VALID_TRANSITIONS: Record<TableStatus, TableStatus[]> = {
  [TableStatus.EMPTY]: [TableStatus.RESERVED, TableStatus.OCCUPIED],
  [TableStatus.RESERVED]: [TableStatus.OCCUPIED, TableStatus.EMPTY],
  [TableStatus.OCCUPIED]: [TableStatus.MERGED, TableStatus.CLEANING, TableStatus.EMPTY],
  [TableStatus.MERGED]: [TableStatus.OCCUPIED, TableStatus.EMPTY],
  [TableStatus.CLEANING]: [TableStatus.EMPTY],
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

  if (floorStatus === 'reserved' || reservation != null) return TableStatus.RESERVED;
  if (activeOrders.length > 0 || floorStatus === 'occupied') return TableStatus.OCCUPIED;
  if (mergedIntoTable != null) return TableStatus.MERGED;
  return TableStatus.EMPTY;
}