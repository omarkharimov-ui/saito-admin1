export type StaffMember = {
  id: string;
  name: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  hourly_rate?: number | null;
  overtime_rate?: number;
  base_monthly_salary?: number | null;
  max_weekly_hours?: number;
  shift: string | null;
  role_id?: string;
  role_name: string;
  role_is_system?: boolean;
  shift_id?: string | null;
  shift_opened_at?: string | null;
  shift_status: 'active' | 'off';
  shift_duration?: string | null;
  // Permissions
  can_apply_discount?: boolean;
  can_void_items?: boolean;
  can_open_drawer_without_sale?: boolean;
  can_refund?: boolean;
  can_view_reports?: boolean;
  can_manage_staff?: boolean;
  // Common metrics
  total_orders: number;
  total_revenue: number;
  cash_sales?: number;
  card_sales?: number;
  total_voids?: number;
  total_discounts?: number;
  total_refunds?: number;
  drawer_variance?: number;
  avg_order_value: number;
  // Kitchen-specific
  active_tickets?: number;
  completed_tickets?: number;
  avg_prep_time?: string | null;
  late_tickets?: number;
  cancelled_tickets?: number;
  // Waiter-specific
  active_tables?: number;
  tables_served?: number;
  guests_served?: number;
  avg_table_turnaround?: string | null;
  total_tips?: number;
  avg_ticket_size?: number;
  // Metadata
  last_activity: string | null;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
  risk_flags: number;
};
