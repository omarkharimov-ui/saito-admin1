import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/api-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission('staff.view');
    if (!auth.authenticated) return auth as any;

    const { searchParams } = new URL(request.url);
    const staffId = searchParams.get('staff_id');
    const period = searchParams.get('period') || 'week';

    if (!staffId) {
      return NextResponse.json({ error: 'staff_id is required' }, { status: 400 });
    }

    const s = svc();
    const now = new Date();
    const start = new Date();

    if (period === 'today') start.setHours(0, 0, 0, 0);
    else if (period === 'week') start.setDate(now.getDate() - 7);
    else if (period === 'month') start.setDate(now.getDate() - 30);
    else start.setDate(now.getDate() - 90);

    const startIso = start.toISOString();

    const [staffRes, roleRes, shiftsRes, ordersRes, paymentsRes, logsRes, approvalsRes, securityRes] = await Promise.all([
      fetch(`${s.url}/rest/v1/staff?id=eq.${staffId}&select=id,name,role_id,is_active,shift`, { headers: s.headers }),
      fetch(`${s.url}/rest/v1/roles?id=eq.${staffId}&select=name`, { headers: s.headers }),
      fetch(`${s.url}/rest/v1/shifts?staff_id=eq.${staffId}&opened_at=gte.${startIso}&select=*&order=opened_at.desc`, { headers: s.headers }),
      fetch(`${s.url}/rest/v1/orders?or=(created_by.eq.${staffId},assigned_to.eq.${staffId})&created_at=gte.${startIso}&select=id,status,table_number,guest_count,paid_amount,created_at,completed_at&order=created_at.desc`, { headers: s.headers }),
      fetch(`${s.url}/rest/v1/order_payments?created_by=eq.${staffId}&created_at=gte.${startIso}&select=amount,method,status&order=created_at.desc`, { headers: s.headers }),
      fetch(`${s.url}/rest/v1/operation_logs?performed_by=eq.${staffId}&created_at=gte.${startIso}&select=action,created_at,old_values,new_values&order=created_at.desc&limit=100`, { headers: s.headers }),
      fetch(`${s.url}/rest/v1/approval_requests?or=(staff_id.eq.${staffId},reviewed_by.eq.${staffId})&created_at=gte.${startIso}&select=action_type,status,created_at,reviewed_at&order=created_at.desc`, { headers: s.headers }),
      fetch(`${s.url}/rest/v1/security_events?staff_id=eq.${staffId}&created_at=gte.${startIso}&select=event_type,success,created_at&order=created_at.desc&limit=50`, { headers: s.headers }),
    ]);

    const staff = await staffRes.json();
    const roles = await roleRes.json();
    const shifts = await shiftsRes.json();
    const orders = await ordersRes.json();
    const payments = await paymentsRes.json();
    const logs = await logsRes.json();
    const approvals = await approvalsRes.json();
    const security = await securityRes.json();

    const staffData = Array.isArray(staff) ? staff[0] : null;
    const roleData = Array.isArray(roles) ? roles[0] : null;
    const roleName = roleData?.name || 'unknown';
    const shiftsData = Array.isArray(shifts) ? shifts : [];
    const ordersData = Array.isArray(orders) ? orders : [];
    const paymentsData = Array.isArray(payments) ? payments : [];
    const logsData = Array.isArray(logs) ? logs : [];
    const approvalsData = Array.isArray(approvals) ? approvals : [];
    const securityData = Array.isArray(security) ? security : [];

    let kpis: any = {};
    let activity: any[] = [];
    let currentShift: any = null;

    const activeShift = shiftsData.find((sh: any) => !sh.closed_at);
    if (activeShift) {
      currentShift = {
        id: activeShift.id,
        opened_at: activeShift.opened_at,
        starting_cash: activeShift.starting_cash,
        expected_cash: activeShift.expected_cash,
        actual_cash: activeShift.actual_cash,
        difference: activeShift.difference,
      };
    }

    if (roleName === 'kitchen' || roleName === 'bartender') {
      const preparedOrders = ordersData.filter((o: any) => o.kitchen_status === 'ready' || o.kitchen_status === 'served').length;
      const lateTickets = ordersData.filter((o: any) => {
        if (!o.completed_at || !o.created_at) return false;
        const prepTime = new Date(o.completed_at).getTime() - new Date(o.created_at).getTime();
        return prepTime > 15 * 60 * 1000;
      }).length;
      const remakes = logsData.filter((l: any) => l.action === 'void_order' || l.action === 'waste').length;
      const cancelledTickets = ordersData.filter((o: any) => o.status === 'cancelled').length;

      kpis = {
        orders_prepared: preparedOrders,
        avg_prep_time: preparedOrders > 0 ? Math.round(ordersData.reduce((sum: number, o: any) => {
          if (!o.completed_at || !o.created_at) return sum;
          return sum + (new Date(o.completed_at).getTime() - new Date(o.created_at).getTime());
        }, 0) / preparedOrders / 60000) : 0,
        on_time_rate: preparedOrders > 0 ? Math.round(((preparedOrders - lateTickets) / preparedOrders) * 100) : 100,
        late_tickets: lateTickets,
        remakes,
        cancelled_tickets: cancelledTickets,
      };
    } else if (roleName === 'waiter' || roleName === 'host') {
      const ordersTaken = ordersData.length;
      const tablesServed = new Set(ordersData.map((o: any) => o.table_number).filter(Boolean)).size;
      const guestsServed = ordersData.reduce((sum: number, o: any) => sum + (o.guest_count || 0), 0);
      const ordersClosed = ordersData.filter((o: any) => o.status === 'paid').length;
      const openTables = ordersData.filter((o: any) => o.status !== 'paid' && o.status !== 'cancelled' && o.status !== 'closed').length;

      kpis = {
        orders_taken: ordersTaken,
        tables_served: tablesServed,
        guests_served: guestsServed,
        orders_closed: ordersClosed,
        avg_table_turn: ordersClosed > 0 ? Math.round(ordersData.reduce((sum: number, o: any) => {
          if (!o.completed_at || !o.created_at) return sum;
          return sum + (new Date(o.completed_at).getTime() - new Date(o.created_at).getTime());
        }, 0) / ordersClosed / 60000) : 0,
        open_tables: openTables,
      };
    } else if (roleName === 'cashier') {
      const ordersClosed = ordersData.filter((o: any) => o.status === 'paid').length;
      const paymentsProcessed = paymentsData.length;
      const totalSales = paymentsData.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);
      const cashSales = paymentsData.filter((p: any) => p.method === 'cash').reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);
      const cardSales = paymentsData.filter((p: any) => ['card', 'qr', 'online', 'voucher'].includes(p.method)).reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);
      const variance = activeShift?.difference || 0;
      const voids = logsData.filter((l: any) => l.action === 'void_order').length;
      const refunds = logsData.filter((l: any) => l.action === 'refund').length;
      const discounts = logsData.filter((l: any) => l.action === 'discount').length;
      const overrides = logsData.filter((l: any) => l.action === 'price_override').length;

      kpis = {
        orders_closed: ordersClosed,
        payments_processed: paymentsProcessed,
        total_sales: Math.round(totalSales * 100) / 100,
        cash_sales: Math.round(cashSales * 100) / 100,
        card_sales: Math.round(cardSales * 100) / 100,
        cash_variance: variance,
        voids,
        refunds,
        discounts,
        overrides,
      };
    } else if (roleName === 'manager') {
      const shiftsSupervised = shiftsData.filter((sh: any) => sh.approved_by === staffId).length;
      const staffSupervised = new Set(shiftsData.filter((sh: any) => sh.approved_by === staffId).map((sh: any) => sh.staff_id)).size;
      const approvals = approvalsData.filter((a: any) => a.reviewed_by === staffId).length;
      const rejectedApprovals = approvalsData.filter((a: any) => a.reviewed_by === staffId && a.status === 'rejected').length;
      const cashClosesApproved = approvalsData.filter((a: any) => a.reviewed_by === staffId && a.action_type === 'cash_discrepancy').length;
      const voidApprovals = approvalsData.filter((a: any) => a.reviewed_by === staffId && a.action_type === 'void').length;
      const refundApprovals = approvalsData.filter((a: any) => a.reviewed_by === staffId && a.action_type === 'refund').length;

      kpis = {
        shifts_supervised: shiftsSupervised,
        staff_supervised: staffSupervised,
        approvals,
        rejected_approvals: rejectedApprovals,
        cash_closes_approved: cashClosesApproved,
        void_approvals: voidApprovals,
        refund_approvals: refundApprovals,
      };
    } else if (roleName === 'admin' || roleName === 'superadmin') {
      const staffCreated = logsData.filter((l: any) => l.action === 'staff_created').length;
      const staffDisabled = logsData.filter((l: any) => l.action === 'staff_disabled').length;
      const rolesChanged = logsData.filter((l: any) => l.action === 'role_changed').length;
      const permissionsChanged = logsData.filter((l: any) => l.action === 'permission_changed').length;
      const settingsChanged = logsData.filter((l: any) => l.action === 'settings_changed').length;
      const approvals = approvalsData.filter((a: any) => a.reviewed_by === staffId).length;
      const securityEvents = securityData.length;

      kpis = {
        staff_created: staffCreated,
        staff_disabled: staffDisabled,
        roles_changed: rolesChanged,
        permissions_changed: permissionsChanged,
        settings_changed: settingsChanged,
        approvals,
        security_events: securityEvents,
      };
    }

    activity = logsData.slice(0, 20).map((l: any) => ({
      action: l.action,
      created_at: l.created_at,
      old_values: l.old_values,
      new_values: l.new_values,
    }));

    return NextResponse.json({
      staff: staffData,
      role: roleName,
      kpis,
      current_shift: currentShift,
      activity,
      period,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
