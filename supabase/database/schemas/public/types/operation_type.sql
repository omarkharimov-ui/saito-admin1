CREATE TYPE public.operation_type AS ENUM (
  'merge',
  'unmerge',
  'transfer',
  'split_table',
  'move_guest',
  'change_seat',
  'split_bill',
  'void_item',
  'comp_item',
  'waste_item',
  'discount',
  'service_charge',
  'refund',
  'reopen_bill',
  'manager_override'
);