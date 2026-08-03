import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';

export interface ZReport {
  report_date: string;
  sales: {
    total_revenue: number;
    total_orders: number;
    aov: number;
    items_sold: number;
  };
  payments: {
    cash_total: number;
    card_total: number;
    tips_total: number;
    discounts_total: number;
  };
  voids: {
    count: number;
    amount: number;
  };
  cash_drawer: {
    starting_cash: number;
    expected_cash: number;
    cash_received: number;
  };
  costs: {
    cogs: number;
    labor_cost: number;
    total_expenses: number;
    expenses_breakdown: Record<string, number>;
  };
  profit: {
    gross: number;
    net: number;
  };
}

export interface SalesReport {
  period: { start: string; end: string };
  daily: Array<{
    date: string;
    orders: number;
    revenue: number;
    aov: number;
    dine_in_orders: number;
    takeaway_orders: number;
    delivery_orders: number;
  }>;
  by_category: Array<{
    category_name: string;
    items_sold: number;
    revenue: number;
  }>;
  by_product: Array<{
    product_name: string;
    quantity_sold: number;
    revenue: number;
    avg_price: number;
  }>;
  by_source: Array<{
    order_source: string;
    orders: number;
    revenue: number;
  }>;
}

export interface ExpenseSummary {
  period: { start: string; end: string };
  total: number;
  by_category: Array<{
    category: string;
    count: number;
    total: number;
  }>;
  daily: Array<{
    date: string;
    total: number;
  }>;
}

export interface StaffPerformance {
  period: { start: string; end: string };
  by_staff: Array<{
    staff_id: string | null;
    staff_name: string;
    orders_handled: number;
    total_sales: number;
    avg_order_value: number;
    cancelled_orders: number;
  }>;
  top_performers: Array<{
    staff_id: string | null;
    staff_name: string;
    total_sales: number;
    orders_count: number;
  }>;
}

export interface Expense {
  id: string;
  staff_id: string | null;
  category: string;
  amount: number;
  note: string | null;
  expense_date: string | null;
  created_by: string | null;
  created_at: string | null;
}

export function useReports() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─── Get Z-Report ───
  const getZReport = useCallback(async (date?: string): Promise<ZReport | null> => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.rpc('get_z_report', {
        p_date: date || new Date().toISOString().split('T')[0],
      });
      if (err) { setError(err.message); return null; }
      return data as ZReport;
    } finally { setLoading(false); }
  }, []);

  // ─── Get Sales Report ───
  const getSalesReport = useCallback(async (startDate: string, endDate: string): Promise<SalesReport | null> => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.rpc('get_sales_report', {
        p_start_date: startDate,
        p_end_date: endDate,
      });
      if (err) { setError(err.message); return null; }
      return data as SalesReport;
    } finally { setLoading(false); }
  }, []);

  // ─── Get Expense Summary ───
  const getExpenseSummary = useCallback(async (startDate: string, endDate: string): Promise<ExpenseSummary | null> => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.rpc('get_expense_summary', {
        p_start_date: startDate,
        p_end_date: endDate,
      });
      if (err) { setError(err.message); return null; }
      return data as ExpenseSummary;
    } finally { setLoading(false); }
  }, []);

  // ─── Get Staff Performance ───
  const getStaffPerformance = useCallback(async (startDate: string, endDate: string): Promise<StaffPerformance | null> => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.rpc('get_staff_performance', {
        p_start_date: startDate,
        p_end_date: endDate,
      });
      if (err) { setError(err.message); return null; }
      return data as StaffPerformance;
    } finally { setLoading(false); }
  }, []);

  // ─── Close Cash Register ───
  const closeCashRegister = useCallback(async (params: {
    shift_id: string;
    actual_cash: number;
    notes?: string;
    manager_id?: string;
  }) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.rpc('close_cash_register', {
        p_shift_id: params.shift_id,
        p_actual_cash: params.actual_cash,
        p_notes: params.notes || null,
        p_manager_id: params.manager_id || null,
      });
      if (err) { setError(err.message); return null; }
      return data;
    } finally { setLoading(false); }
  }, []);

  // ─── Fetch expenses ───
  const fetchExpenses = useCallback(async (params?: {
    start_date?: string;
    end_date?: string;
    category?: string;
  }): Promise<Expense[]> => {
    let query = supabase.from('expenses').select('*').order('expense_date', { ascending: false });
    if (params?.start_date) query = query.gte('expense_date', params.start_date);
    if (params?.end_date) query = query.lte('expense_date', params.end_date);
    if (params?.category) query = query.eq('category', params.category);

    const { data, error: err } = await query;
    if (err) {
      console.error('Failed to fetch expenses:', err);
      return [];
    }
    return (data || []) as Expense[];
  }, []);

  // ─── Create expense ───
  const createExpense = useCallback(async (params: {
    category: string;
    amount: number;
    note?: string;
    expense_date?: string;
    staff_id?: string;
  }) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.from('expenses').insert({
        category: params.category,
        amount: params.amount,
        note: params.note || null,
        expense_date: params.expense_date || new Date().toISOString().split('T')[0],
        staff_id: params.staff_id || null,
      }).select().single();

      if (err) { setError(err.message); return null; }
      return data;
    } finally { setLoading(false); }
  }, []);

  return {
    loading,
    error,
    getZReport,
    getSalesReport,
    getExpenseSummary,
    getStaffPerformance,
    closeCashRegister,
    fetchExpenses,
    createExpense,
  };
}
