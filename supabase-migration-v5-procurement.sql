-- ---------------------------------------------------------------
-- Migration v5: Procurement intelligence + receiving workflow
-- Adds suppliers, purchase orders, invoices, mappings, receipts,
-- anomalies, supplier metrics, and reorder suggestions.
-- Designed to integrate with existing ingredients + inventory_logs.
-- ---------------------------------------------------------------

create extension if not exists pgcrypto;

-- ───────────────────────────────────────────────────────────────
-- Suppliers
-- ───────────────────────────────────────────────────────────────
create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  phone text,
  email text,
  tax_id text,
  address text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists suppliers_name_unique_idx on suppliers (lower(name));
create index if not exists suppliers_active_idx on suppliers (is_active);

-- ───────────────────────────────────────────────────────────────
-- Purchase orders (optional, but useful for invoice reconciliation)
-- ───────────────────────────────────────────────────────────────
create table if not exists purchase_orders (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references suppliers(id) on delete set null,
  order_number text,
  status text not null default 'draft' check (status in ('draft', 'sent', 'partial', 'received', 'cancelled')),
  expected_at timestamptz,
  currency text not null default 'AZN',
  subtotal numeric(12,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists purchase_orders_supplier_order_unique_idx on purchase_orders (supplier_id, order_number) where order_number is not null;
create index if not exists purchase_orders_supplier_idx on purchase_orders (supplier_id);
create index if not exists purchase_orders_status_idx on purchase_orders (status);

create table if not exists purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references purchase_orders(id) on delete cascade,
  ingredient_id uuid references ingredients(id) on delete set null,
  description text not null,
  quantity numeric(14,3) not null default 0,
  unit text not null,
  unit_price numeric(12,4) not null default 0,
  line_total numeric(12,2) not null default 0,
  received_quantity numeric(14,3) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists purchase_order_lines_po_idx on purchase_order_lines (purchase_order_id);
create index if not exists purchase_order_lines_ingredient_idx on purchase_order_lines (ingredient_id);

-- ───────────────────────────────────────────────────────────────
-- Supplier invoices
-- ───────────────────────────────────────────────────────────────
create table if not exists supplier_invoices (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references suppliers(id) on delete restrict,
  purchase_order_id uuid references purchase_orders(id) on delete set null,
  invoice_number text,
  invoice_date date,
  received_at timestamptz not null default now(),
  currency text not null default 'AZN',
  subtotal numeric(12,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  status text not null default 'draft' check (status in ('draft', 'parsed', 'reviewing', 'approved', 'applied', 'rejected')),
  source_type text not null default 'manual' check (source_type in ('manual', 'ocr', 'pdf', 'email', 'api')),
  source_ref text,
  parsed_payload jsonb,
  notes text,
  created_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists supplier_invoices_supplier_invoice_unique_idx on supplier_invoices (supplier_id, invoice_number) where invoice_number is not null;
create index if not exists supplier_invoices_supplier_idx on supplier_invoices (supplier_id);
create index if not exists supplier_invoices_status_idx on supplier_invoices (status);
create index if not exists supplier_invoices_po_idx on supplier_invoices (purchase_order_id);

create table if not exists supplier_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  supplier_invoice_id uuid not null references supplier_invoices(id) on delete cascade,
  line_index integer not null default 0,
  raw_description text not null,
  normalized_description text,
  ingredient_id uuid references ingredients(id) on delete set null,
  quantity numeric(14,3) not null default 0,
  unit text not null,
  unit_price numeric(12,4) not null default 0,
  line_total numeric(12,2) not null default 0,
  received_quantity numeric(14,3) not null default 0,
  matched_confidence numeric(5,4) not null default 0,
  match_status text not null default 'unmatched' check (match_status in ('unmatched', 'suggested', 'matched', 'overridden')),
  manual_override boolean not null default false,
  override_reason text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists supplier_invoice_lines_invoice_idx on supplier_invoice_lines (supplier_invoice_id);
create index if not exists supplier_invoice_lines_ingredient_idx on supplier_invoice_lines (ingredient_id);
create index if not exists supplier_invoice_lines_match_idx on supplier_invoice_lines (match_status);

-- Line → ingredient mapping history / confidence trail
create table if not exists invoice_line_mappings (
  id uuid primary key default gen_random_uuid(),
  supplier_invoice_line_id uuid not null references supplier_invoice_lines(id) on delete cascade,
  ingredient_id uuid references ingredients(id) on delete set null,
  mapping_source text not null default 'ai' check (mapping_source in ('ai', 'manual', 'rule', 'import')),
  confidence numeric(5,4) not null default 0,
  is_selected boolean not null default false,
  selected_by uuid,
  selected_at timestamptz,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists invoice_line_mappings_line_idx on invoice_line_mappings (supplier_invoice_line_id);
create index if not exists invoice_line_mappings_ingredient_idx on invoice_line_mappings (ingredient_id);
create index if not exists invoice_line_mappings_selected_idx on invoice_line_mappings (is_selected);

-- ───────────────────────────────────────────────────────────────
-- Receiving / goods intake
-- ───────────────────────────────────────────────────────────────
create table if not exists goods_receipts (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references suppliers(id) on delete restrict,
  supplier_invoice_id uuid references supplier_invoices(id) on delete set null,
  purchase_order_id uuid references purchase_orders(id) on delete set null,
  receipt_number text,
  status text not null default 'draft' check (status in ('draft', 'reviewing', 'approved', 'partially_applied', 'applied', 'void')),
  received_at timestamptz not null default now(),
  applied_at timestamptz,
  subtotal numeric(12,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  notes text,
  discrepancy_summary jsonb,
  created_by uuid,
  approved_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists goods_receipts_supplier_idx on goods_receipts (supplier_id);
create index if not exists goods_receipts_invoice_idx on goods_receipts (supplier_invoice_id);
create index if not exists goods_receipts_po_idx on goods_receipts (purchase_order_id);
create index if not exists goods_receipts_status_idx on goods_receipts (status);

create table if not exists goods_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  goods_receipt_id uuid not null references goods_receipts(id) on delete cascade,
  supplier_invoice_line_id uuid references supplier_invoice_lines(id) on delete set null,
  ingredient_id uuid references ingredients(id) on delete set null,
  raw_description text not null,
  quantity numeric(14,3) not null default 0,
  unit text not null,
  unit_price numeric(12,4) not null default 0,
  line_total numeric(12,2) not null default 0,
  expected_quantity numeric(14,3),
  variance_quantity numeric(14,3),
  variance_amount numeric(12,2),
  applied_to_stock boolean not null default false,
  stock_log_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists goods_receipt_lines_receipt_idx on goods_receipt_lines (goods_receipt_id);
create index if not exists goods_receipt_lines_ingredient_idx on goods_receipt_lines (ingredient_id);
create index if not exists goods_receipt_lines_invoice_line_idx on goods_receipt_lines (supplier_invoice_line_id);

-- ───────────────────────────────────────────────────────────────
-- Procurement discrepancy tracking
-- ───────────────────────────────────────────────────────────────
create table if not exists procurement_anomalies (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references suppliers(id) on delete set null,
  supplier_invoice_id uuid references supplier_invoices(id) on delete set null,
  goods_receipt_id uuid references goods_receipts(id) on delete set null,
  ingredient_id uuid references ingredients(id) on delete set null,
  anomaly_type text not null check (anomaly_type in (
    'missing_item', 'extra_item', 'quantity_mismatch', 'unit_mismatch',
    'price_anomaly', 'invoice_total_mismatch', 'duplicate_invoice', 'mapping_conflict'
  )),
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high', 'critical')),
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'ignored')),
  title text not null,
  description text,
  expected_value numeric(14,4),
  actual_value numeric(14,4),
  delta_value numeric(14,4),
  context jsonb,
  created_by uuid,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists procurement_anomalies_supplier_idx on procurement_anomalies (supplier_id);
create index if not exists procurement_anomalies_invoice_idx on procurement_anomalies (supplier_invoice_id);
create index if not exists procurement_anomalies_receipt_idx on procurement_anomalies (goods_receipt_id);
create index if not exists procurement_anomalies_ingredient_idx on procurement_anomalies (ingredient_id);
create index if not exists procurement_anomalies_status_idx on procurement_anomalies (status);
create index if not exists procurement_anomalies_type_idx on procurement_anomalies (anomaly_type);

-- ───────────────────────────────────────────────────────────────
-- Supplier performance / intelligence snapshots
-- ───────────────────────────────────────────────────────────────
create table if not exists supplier_metrics (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references suppliers(id) on delete cascade,
  metric_date date not null default current_date,
  invoice_count integer not null default 0,
  receipt_count integer not null default 0,
  on_time_rate numeric(5,4) not null default 0,
  quantity_accuracy_rate numeric(5,4) not null default 0,
  price_stability_rate numeric(5,4) not null default 0,
  anomaly_count integer not null default 0,
  duplicate_invoice_count integer not null default 0,
  avg_price_delta_pct numeric(8,4),
  supplier_score numeric(8,4) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (supplier_id, metric_date)
);

create index if not exists supplier_metrics_supplier_idx on supplier_metrics (supplier_id);
create index if not exists supplier_metrics_date_idx on supplier_metrics (metric_date);
create index if not exists supplier_metrics_score_idx on supplier_metrics (supplier_score);

-- ───────────────────────────────────────────────────────────────
-- Reorder / AI suggestion layer
-- ───────────────────────────────────────────────────────────────
create table if not exists reorder_suggestions (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references ingredients(id) on delete cascade,
  supplier_id uuid references suppliers(id) on delete set null,
  suggestion_type text not null check (suggestion_type in ('reorder', 'review_supplier', 'price_check', 'recipe_adjustment', 'manual_review')),
  status text not null default 'open' check (status in ('open', 'acknowledged', 'ordered', 'dismissed', 'resolved')),
  suggested_quantity numeric(14,3),
  unit text,
  suggested_price numeric(12,4),
  confidence numeric(5,4) not null default 0,
  reason text not null,
  source text not null default 'system' check (source in ('system', 'ai', 'manual', 'rule')),
  context jsonb,
  due_at timestamptz,
  created_by uuid,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reorder_suggestions_ingredient_idx on reorder_suggestions (ingredient_id);
create index if not exists reorder_suggestions_supplier_idx on reorder_suggestions (supplier_id);
create index if not exists reorder_suggestions_status_idx on reorder_suggestions (status);
create index if not exists reorder_suggestions_type_idx on reorder_suggestions (suggestion_type);

-- ───────────────────────────────────────────────────────────────
-- Lightweight linking to existing inventory_logs for receipt/application tracing
-- ───────────────────────────────────────────────────────────────
alter table if exists inventory_logs
  add column if not exists supplier_invoice_line_id uuid,
  add column if not exists goods_receipt_line_id uuid,
  add column if not exists procurement_anomaly_id uuid,
  add column if not exists source_type text;

create index if not exists inventory_logs_supplier_invoice_line_idx on inventory_logs (supplier_invoice_line_id);
create index if not exists inventory_logs_goods_receipt_line_idx on inventory_logs (goods_receipt_line_id);
create index if not exists inventory_logs_procurement_anomaly_idx on inventory_logs (procurement_anomaly_id);

-- Optional foreign keys for traceability if the base table exists and allows it
alter table if exists inventory_logs
  add constraint inventory_logs_goods_receipt_line_fk
  foreign key (goods_receipt_line_id) references goods_receipt_lines(id) on delete set null;

-- inventory_logs.supplier_invoice_line_id and procurement_anomaly_id are left as trace columns
-- to avoid migration failure if the base table constraints differ across environments.

-- ───────────────────────────────────────────────────────────────
-- Timestamp helpers for update flows
-- ───────────────────────────────────────────────────────────────
create or replace function touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Reuse on the new tables only if not already attached
create trigger suppliers_touch_updated_at
before update on suppliers
for each row execute function touch_updated_at();

create trigger purchase_orders_touch_updated_at
before update on purchase_orders
for each row execute function touch_updated_at();

create trigger supplier_invoices_touch_updated_at
before update on supplier_invoices
for each row execute function touch_updated_at();

create trigger goods_receipts_touch_updated_at
before update on goods_receipts
for each row execute function touch_updated_at();

create trigger procurement_anomalies_touch_updated_at
before update on procurement_anomalies
for each row execute function touch_updated_at();

create trigger supplier_metrics_touch_updated_at
before update on supplier_metrics
for each row execute function touch_updated_at();

create trigger reorder_suggestions_touch_updated_at
before update on reorder_suggestions
for each row execute function touch_updated_at();

select 'migration v5 procurement completed' as status;
