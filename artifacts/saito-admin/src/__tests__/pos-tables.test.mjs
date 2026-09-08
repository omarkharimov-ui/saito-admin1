// ============================================================================
// pos-tables.ts composition tests (F-1 / F-3 fix pass)
// Run:  node --experimental-strip-types src/__tests__/pos-tables.test.mjs
// (plain node:assert — no test framework dependency; mirrors the approved
//  verification matrix for /api/pos/tables aggregate composition)
// ============================================================================
import assert from 'node:assert/strict';
import {
  FINAL_ORDER_STATUSES,
  composeAggregates,
  openOrderSums,
  floorGuestCount,
  isOpenOrder,
} from '../lib/pos-tables.ts';

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ok -', name); } catch (e) { console.error('  FAIL -', name, '\n    ', e.message); process.exitCode = 1; } };

const floor = (over = {}) => ({ table_number: 1, status: 'occupied', merged_into_table: null, current_order_id: null, total_amount: 0, guest_count: null, order_count: 0, has_pending: false, oldest_pending_at: null, ...over });
const order = (over = {}) => ({ id: 'o' + Math.random().toString(36).slice(2, 8), table_number: 1, status: 'confirmed', total_amount: 0, guest_count: 0, kitchen_status: 'pending', updated_at: '2026-09-08T10:00:00Z', ...over });
const members = (f, o) => [{ floor: f, orders: o }];

console.log('F-3: final-state contract');
test('FINAL_ORDER_STATUSES = the 6 DB final states', () => {
  assert.deepEqual([...FINAL_ORDER_STATUSES].sort(), ['cancelled','closed','paid','partially_refunded','refunded','voided'].sort());
});
test('isOpenOrder excludes all 6, includes new/confirmed/preparing/ready/served', () => {
  for (const s of FINAL_ORDER_STATUSES) assert.equal(isOpenOrder({ status: s }), false, s);
  for (const s of ['new','confirmed','preparing','ready','served']) assert.equal(isOpenOrder({ status: s }), true, s);
});

console.log('F-1: single table');
test('one active order -> total counted once (== order total, NOT floor+order)', () => {
  const f = floor({ total_amount: 45, guest_count: 1 }); // floor already synced by trigger
  const r = composeAggregates({ floor: f, groupMembers: members(f, [order({ total_amount: 45, guest_count: 1 })]), currentOrder: null });
  assert.equal(r.total_amount, 45, 'no double count');
  assert.equal(r.order_count, 1);
  assert.equal(r.guest_count, 1);
});
test('multiple active orders -> sum of all open orders', () => {
  const f = floor();
  const o = [order({ total_amount: 10 }), order({ total_amount: 20, guest_count: 2 })];
  const r = composeAggregates({ floor: f, groupMembers: members(f, o), currentOrder: null });
  assert.equal(r.total_amount, 30);
  assert.equal(r.order_count, 2);
});
test('final-state orders ignored (paid/closed/cancelled/refunded/voided/partial)', () => {
  const f = floor();
  const o = [order({ total_amount: 10 }), order({ total_amount: 99, status: 'paid' }), order({ total_amount: 88, status: 'refunded' }), order({ total_amount: 77, status: 'voided' }), order({ total_amount: 66, status: 'partially_refunded' })];
  const r = composeAggregates({ floor: f, groupMembers: members(f, o), currentOrder: null });
  assert.equal(r.total_amount, 10);
  assert.equal(r.order_count, 1);
});
test('no open orders -> legacy fallback to stored floor total (never-synced defense)', () => {
  const f = floor({ total_amount: 17, guest_count: 1 });
  const r = composeAggregates({ floor: f, groupMembers: members(f, []), currentOrder: null });
  assert.equal(r.total_amount, 17);
  assert.equal(r.order_count, 0);
});
test('open orders present -> floor stored value NOT added (definitive F-1 check)', () => {
  const f = floor({ total_amount: 45, guest_count: 1 });
  const r = composeAggregates({ floor: f, groupMembers: members(f, [order({ total_amount: 45, guest_count: 1 })]), currentOrder: null });
  assert.equal(r.total_amount, 45, 'must be 45, not 90');
});

console.log('F-1: merged groups');
const grp = (f, orders) => [{ floor: floor({ ...f }), orders }];
test('occupied + occupied merge (parent 100 floor-synced, child 50 floor-synced, orders 150 total) -> 150 ONCE', () => {
  const parent = floor({ table_number: 1, total_amount: 150, guest_count: 5 });
  const child = floor({ table_number: 2, total_amount: 0, merged_into_table: 1 });
  const r = composeAggregates({ floor: parent, groupMembers: [
    { floor: parent, orders: [order({ total_amount: 100, guest_count: 3 }), order({ table_number: 2, total_amount: 50, guest_count: 2 })] },
    { floor: child, orders: [] },
  ], currentOrder: null });
  assert.equal(r.total_amount, 150, 'no 2x (was 300 before fix)');
  assert.equal(r.order_count, 2);
});
test('empty + occupied merge -> child order counted once', () => {
  const parent = floor({ table_number: 1, total_amount: 0 });
  const child = floor({ table_number: 2, total_amount: 30, merged_into_table: 1 });
  const r = composeAggregates({ floor: parent, groupMembers: [
    { floor: parent, orders: [order({ table_number: 2, total_amount: 30, guest_count: 2 })] },
    { floor: child, orders: [] },
  ], currentOrder: null });
  assert.equal(r.total_amount, 30);
});
test('empty + empty merge -> 0 (no phantom ||1 guests)', () => {
  const parent = floor({ table_number: 1, total_amount: 0, guest_count: null });
  const child = floor({ table_number: 2, total_amount: 0, guest_count: null, merged_into_table: 1 });
  const r = composeAggregates({ floor: parent, groupMembers: [
    { floor: parent, orders: [] }, { floor: child, orders: [] },
  ], currentOrder: null });
  assert.equal(r.total_amount, 0);
  assert.equal(r.order_count, 0);
});
test('reservation-aware merge (no orders) -> 0, no crash', () => {
  const parent = floor({ table_number: 1, status: 'reserved', total_amount: 0, reservation_id: 'r1' });
  const child = floor({ table_number: 2, status: 'reserved', total_amount: 0, merged_into_table: 1, reservation_id: 'r1' });
  const r = composeAggregates({ floor: parent, groupMembers: [
    { floor: parent, orders: [] }, { floor: child, orders: [] },
  ], currentOrder: null });
  assert.equal(r.total_amount, 0);
});
test('merged member with stale non-zero floor total + orders -> orders win, no add', () => {
  const parent = floor({ table_number: 1, total_amount: 100 });
  const child = floor({ table_number: 2, total_amount: 50, merged_into_table: 1 }); // stale floor
  const r = composeAggregates({ floor: parent, groupMembers: [
    { floor: parent, orders: [order({ total_amount: 100, guest_count: 3 })] },
    { floor: child, orders: [order({ table_number: 2, total_amount: 50, guest_count: 2 })] },
  ], currentOrder: null });
  assert.equal(r.total_amount, 150, 'stale child floor must not add');
});

console.log('F-1: guests (floor-first semantics, no ||1 invention)');
test('group guests sum member floor values when set (seating facts)', () => {
  const parent = floor({ table_number: 1, guest_count: 3 });
  const child = floor({ table_number: 2, guest_count: 2, merged_into_table: 1 });
  const r = composeAggregates({ floor: parent, groupMembers: [
    { floor: parent, orders: [order({ total_amount: 100, guest_count: 3 })] },
    { floor: child, orders: [order({ table_number: 2, total_amount: 50, guest_count: 2 })] },
  ], currentOrder: null });
  assert.equal(r.guest_count, 5);
});
test('single table guest floor-first: floor 6 wins over order 3 (split seating)', () => {
  const f = floor({ guest_count: 6 });
  const r = composeAggregates({ floor: f, groupMembers: members(f, [order({ total_amount: 10, guest_count: 3 })]), currentOrder: null });
  assert.equal(r.guest_count, 6);
});
test('single table guest: floor null -> order sum', () => {
  const f = floor({ guest_count: null });
  const r = composeAggregates({ floor: f, groupMembers: members(f, [order({ total_amount: 10, guest_count: 3 })]), currentOrder: null });
  assert.equal(r.guest_count, 3);
});
test('floorGuestCount: null floor + open order 0 guests -> 0 (no invented 1)', () => {
  assert.equal(floorGuestCount(null, [order({ guest_count: 0 })]), 0);
  assert.equal(floorGuestCount(null, []), null);
});

console.log('has_pending / oldest_pending_at (DB-identical formula)');
test('open order with served/completed kitchen -> has_pending false (served=terminal)', () => {
  const f = floor({ has_pending: true, oldest_pending_at: '2026-08-22T08:00:00Z' }); // stale floor values
  const r = composeAggregates({ floor: f, groupMembers: members(f, [order({ total_amount: 0, kitchen_status: 'completed' })]), currentOrder: null });
  assert.equal(r.has_pending, false, 'stale floor has_pending must not leak');
  assert.equal(r.oldest_pending_at, null);
});
test('open order with pending kitchen -> has_pending true + oldest from that order', () => {
  const f = floor({ has_pending: false, oldest_pending_at: null });
  const r = composeAggregates({ floor: f, groupMembers: members(f, [
    order({ total_amount: 5, kitchen_status: 'pending', updated_at: '2026-09-08T10:00:00Z' }),
    order({ total_amount: 5, kitchen_status: 'cooking', updated_at: '2026-09-08T09:00:00Z' }),
  ]), currentOrder: null });
  assert.equal(r.has_pending, true);
  assert.equal(r.oldest_pending_at, '2026-09-08T09:00:00Z', 'MIN of pending orders');
});
test('group: any member pending -> group has_pending true (table 6/7 zombie: served only -> false)', () => {
  const parent = floor({ table_number: 1, has_pending: true });
  const child = floor({ table_number: 2, guest_count: null, merged_into_table: 1, has_pending: true });
  const r = composeAggregates({ floor: parent, groupMembers: [
    { floor: parent, orders: [order({ total_amount: 0, kitchen_status: 'completed' })] },
    { floor: child, orders: [] },
  ], currentOrder: null });
  assert.equal(r.has_pending, false, 'served/completed is not pending');
});

console.log('F-1: transfer / multi-table move');
test('transferred order visible exactly once at the new table (old table 0)', () => {
  const fA = floor({ table_number: 1, total_amount: 0 });
  const fB = floor({ table_number: 2, total_amount: 75 });
  const rA = composeAggregates({ floor: fA, groupMembers: members(fA, []), currentOrder: null });
  const rB = composeAggregates({ floor: fB, groupMembers: members(fB, [order({ table_number: 2, total_amount: 75, guest_count: 4 })]), currentOrder: null });
  assert.equal(rA.total_amount, 0, 'old table clean');
  assert.equal(rB.total_amount, 75, 'new table shows it once (not 150)');
});
test('openOrderSums last_activity picks newest open order', () => {
  const s = openOrderSums([order({ updated_at: '2026-09-08T09:00:00Z' }), order({ updated_at: '2026-09-08T11:00:00Z' }), order({ updated_at: '2026-09-08T12:00:00Z', status: 'paid' })]);
  assert.equal(s.lastActivity, '2026-09-08T11:00:00Z', 'final order must not drive activity');
});

console.log('\n' + (process.exitCode ? 'SOME TESTS FAILED' : `ALL ${passed} TESTS PASSED`));
