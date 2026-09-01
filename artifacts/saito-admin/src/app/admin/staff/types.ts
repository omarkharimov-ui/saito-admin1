export type StaffMember = {
  id: string;
  name: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  hourly_rate?: number | null;
  overtime_rate?: number;
  shift: string | null;
  role_id?: string;
  role_name: string;
  shift_id?: string | null;
  shift_opened_at?: string | null;
  shift_status: 'active' | 'off';
  active_shift?: {
    id: string;
    opened_at: string;
    starting_cash: number;
    duration_minutes: number;
  } | null;
  expected_cash?: number;
  // Common metrics
  total_orders: number;
  total_revenue: number;
  cash_sales: number;
  card_sales: number;
  total_voids: number;
  total_refunds: number;
  total_discounts: number;
  drawer_variance: number;
  avg_ticket_value: number;
  avg_order_value?: number;
  // Kitchen-specific
  active_tickets: number;
  completed_tickets: number;
  avg_prep_time: string | null;
  late_tickets: number;
  items_prepared?: number;
  re_fired?: number;
  cancelled_tickets?: number;
  waste_count?: number;
  // Waiter-specific
  active_tables: number;
  tables_served: number;
  guests_served: number;
  total_tips: number;
  table_turnover_time?: string | null;
  // Cashier-specific
  transaction_speed?: number;
  // Bartender-specific
  bar_sales?: number;
  // Manager-specific
  approvals_count?: number;
  exceptions_count?: number;
  labor_cost_percent?: number;
  labor_efficiency?: number;
  void_refund_approvals?: number;
  // Host-specific
  seated_guests?: number;
  avg_wait_time?: string | null;
  table_turnover_rate?: string | null;
  no_shows?: number;
  // Risk
  risk_score: number;
  risk_level?: string;
  risk_flags?: string[];
  last_activity: string | null;
  // Permissions
  can_apply_discount?: boolean;
  can_void_items?: boolean;
  can_open_drawer_without_sale?: boolean;
  can_refund?: boolean;
  can_view_reports?: boolean;
  can_manage_staff?: boolean;
};

export type StaffDetail = {
  id: string;
  name: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  hourly_rate?: number;
  overtime_rate?: number;
  shift: string | null;
  role_name: string;
  active_shift: {
    id: string;
    opened_at: string;
    starting_cash: number;
    duration_min: number;
  } | null;
  expected_cash?: number;
  today_stats: {
    orders: number;
    revenue: number;
    cash: number;
    card: number;
    voids: number;
    refunds: number;
    discounts: number;
    avg_ticket?: number;
    tips?: number;
    tables_served?: number;
    guests_served?: number;
    active_tables?: number;
    completed_tickets?: number;
    active_tickets?: number;
    avg_prep_time?: string;
    late_tickets?: number;
    items_prepared?: number;
    re_fired?: number;
    cancelled_tickets?: number;
    drawer_variance?: number;
    approvals_count?: number;
    exceptions_count?: number;
  };
  lifetime_stats: {
    total_orders: number;
    total_revenue: number;
    total_shifts: number;
  };
  risk_score: number;
  shifts?: any[];
};

export type ActivityItem = {
  id: string;
  event_type: string;
  description: string;
  details: any;
  created_at: string;
};
