export interface ClockStatus {
  is_clocked_in: boolean;
  on_break: boolean;
  current_entry_type: string;
  last_entry: string | null;
  active_shift_id: string | null;
  active_break_id: string | null;
  break_started_at: string | null;
  today_hours: number;
  weekly_hours: number;
  approaching_daily_ot: boolean;
  approaching_weekly_ot: boolean;
}

export interface Lifecycle {
  staff_id: string;
  phase: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  has_schedule: boolean;
  is_clocked_in: boolean;
  shift_id: string | null;
  shift_opened_at: string | null;
  clock_in_at: string | null;
  late_minutes: number;
  is_late: boolean;
  on_break: boolean;
  break_started_at: string | null;
  break_used_minutes: number;
  break_allowance_mins: number;
  hours_worked_net: number;
  is_unclosed: boolean;
}

export interface StaffProfile {
  id: string;
  name: string;
  role: string;
  role_name: string | null;
  avatar: string | null;
  phone: string | null;
  email: string | null;
  hourly_rate: number;
  overtime_rate: number;
  clock_status: ClockStatus | null;
  lifecycle: Lifecycle | null;
  geo_config: any | null;
}

export interface StaffApp {
  profile: StaffProfile | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}
