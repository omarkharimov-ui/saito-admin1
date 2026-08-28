import { Shield, Clock, Phone, Mail, Calendar, Briefcase, Activity, ShoppingBag, DollarSign, TrendingUp, AlertTriangle, User, KeyRound, Timer, Users as UsersIcon, Plus, X, ChevronRight, Play, Square, RefreshCw, Search, Filter, Trash2, Ban, RotateCcw, Tag, ArrowLeft, MoreHorizontal, HandPlatter, ChefHat, Martini, ConciergeBell, Package, ReceiptText, ShieldCheck, Crown, Bike, Sparkles, Receipt } from 'lucide-react';

export type StaffMember = {
  id: string;
  name: string;
  role: string;
  role_id?: string;
  shift: string | null;
  phone: string | null;
  email?: string | null;
  is_active: boolean;
  created_at: string;
  hourly_rate?: number;
  activeShift?: { id: string; opened_at: string } | null;
  todayOrders?: number;
  totalShifts?: number;
  totalHours?: number;
  lastAction?: string | null;
};

export type Role = {
  id: string;
  name: string;
  is_system: boolean;
  created_at: string;
  permissions: string[];
};

export type Permission = {
  key: string;
  description: string;
  category: string;
};

export type Shift = {
  id: string;
  staff_id: string;
  report_date: string;
  opened_at: string;
  closed_at?: string | null;
  starting_cash: number;
  expected_cash: number;
  actual_cash?: number | null;
  difference?: number | null;
  notes?: string | null;
  created_at: string;
};

export type ActionLog = {
  id: string;
  action: string;
  created_at: string;
  table_number?: number;
  order_id?: string;
  old_values?: any;
  new_values?: any;
};

export type StaffStats = {
  period: string;
  totalOrders: number;
  totalRevenue: number;
  avgCheck: number;
  todayOrders: number;
  todayVoids: number;
  todayWaste: number;
  todayRefunds: number;
  todayDiscounts: number;
  totalShifts: number;
  totalHours: number;
};

export const ROLE_COLORS: Record<string, { bg: string; text: string; border: string; dot: string; glow: string }> = {
  superadmin: { bg: 'bg-gold/10', text: 'text-gold', border: 'border-gold/20', dot: 'bg-gold', glow: 'shadow-[0_0_16px_rgba(212,175,55,0.2)]' },
  admin: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20', dot: 'bg-purple-400', glow: 'shadow-[0_0_16px_rgba(139,92,246,0.2)]' },
  manager: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20', dot: 'bg-blue-400', glow: 'shadow-[0_0_16px_rgba(59,130,246,0.2)]' },
  cashier: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20', dot: 'bg-emerald-400', glow: 'shadow-[0_0_16px_rgba(16,185,129,0.2)]' },
  waiter: { bg: 'bg-indigo-500/10', text: 'text-indigo-400', border: 'border-indigo-500/20', dot: 'bg-indigo-400', glow: 'shadow-[0_0_16px_rgba(99,102,241,0.2)]' },
  kitchen: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/20', dot: 'bg-orange-400', glow: 'shadow-[0_0_16px_rgba(249,115,22,0.2)]' },
  bartender: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20', dot: 'bg-amber-400', glow: 'shadow-[0_0_16px_rgba(245,158,11,0.2)]' },
  host: { bg: 'bg-pink-500/10', text: 'text-pink-400', border: 'border-pink-500/20', dot: 'bg-pink-400', glow: 'shadow-[0_0_16px_rgba(236,72,153,0.2)]' },
  stock: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/20', dot: 'bg-cyan-400', glow: 'shadow-[0_0_16px_rgba(6,182,212,0.2)]' },
  accountant: { bg: 'bg-teal-500/10', text: 'text-teal-400', border: 'border-teal-500/20', dot: 'bg-teal-400', glow: 'shadow-[0_0_16px_rgba(20,184,166,0.2)]' },
  owner: { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/20', dot: 'bg-rose-400', glow: 'shadow-[0_0_16px_rgba(244,63,94,0.2)]' },
};

export function getRoleColor(roleName: string) {
  const normalized = roleName.toLowerCase();
  return ROLE_COLORS[normalized] || { bg: 'bg-white/5', text: 'text-white/60', border: 'border-white/10', dot: 'bg-white/40', glow: '' };
}

export const ROLE_ICONS: Record<string, React.ElementType> = {
  superadmin: Crown,
  admin: ShieldCheck,
  manager: Briefcase,
  cashier: Receipt,
  waiter: HandPlatter,
  kitchen: ChefHat,
  bartender: Martini,
  host: ConciergeBell,
  stock: Package,
  accountant: ReceiptText,
  owner: Crown,
};

export function getRoleIcon(roleName: string): React.ElementType {
  const normalized = roleName.toLowerCase();
  return ROLE_ICONS[normalized] || User;
}

export function formatCurrency(val: number) {
  return new Intl.NumberFormat('az-AZ', { style: 'currency', currency: 'AZN' }).format(val);
}

export function formatTime(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleTimeString('az-AZ', { hour: '2-digit', minute: '2-digit' });
}

export function formatDate(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('az-AZ', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function formatHours(hours: number) {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}s ${m}d`;
}

export function formatDuration(start: string, end?: string | null) {
  const startDate = new Date(start);
  const endDate = end ? new Date(end) : new Date();
  const diff = endDate.getTime() - startDate.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours === 0 && minutes === 0) return '< 1 dəq';
  return `${hours}s ${minutes}d`;
}

export function getRoleName(roleId?: string, roles: Role[] = []) {
  if (!roleId) return '—';
  const role = roles.find(r => r.id === roleId);
  return role?.name || '—';
}

export const ACTION_LABELS: Record<string, { label: string; color: string; icon: any }> = {
  place_order: { label: 'Sifariş', color: 'text-blue-400', icon: ShoppingBag },
  send_to_kitchen: { label: 'Mətbəxə göndər', color: 'text-orange-400', icon: Activity },
  complete_payment: { label: 'Ödəniş', color: 'text-emerald-400', icon: DollarSign },
  create_order: { label: 'Yeni sifariş', color: 'text-blue-400', icon: ShoppingBag },
  void_order: { label: 'Void', color: 'text-red-400', icon: Ban },
  waste: { label: 'İtki', color: 'text-red-400', icon: Trash2 },
  refund: { label: 'Refund', color: 'text-rose-400', icon: RotateCcw },
  discount: { label: 'Endirim', color: 'text-amber-400', icon: Tag },
  cancel: { label: 'Ləğv', color: 'text-red-400', icon: Ban },
  clock_in: { label: 'Smena açıldı', color: 'text-emerald-400', icon: Clock },
  clock_out: { label: 'Smena bağlandı', color: 'text-purple-400', icon: Clock },
};

export function getActionMeta(action: string) {
  return ACTION_LABELS[action] || { label: action, color: 'text-white/60', icon: Activity };
}

export const PERIODS = [
  { value: 'today', label: 'Bu gün' },
  { value: 'week', label: 'Bu həftə' },
  { value: 'month', label: 'Bu ay' },
  { value: 'all', label: 'Bütün' },
];

export const SHIFT_SORT_OPTIONS = [
  { value: 'opened_at_desc', label: 'Tarix (yenı-eskı)' },
  { value: 'opened_at_asc', label: 'Tarix (eskı-yenı)' },
  { value: 'duration_desc', label: 'Saat (cox-az)' },
  { value: 'staff_asc', label: 'İşçi (A-Z)' },
];

export const STAFF_SORT_OPTIONS = [
  { value: 'name_asc', label: 'Ad (A-Z)' },
  { value: 'name_desc', label: 'Ad (Z-A)' },
  { value: 'role_asc', label: 'Rol (A-Z)' },
  { value: 'created_desc', label: 'Son əlavə edilən' },
];

export const PERMISSION_CATEGORIES: Record<string, { label: string; icon: string }> = {
  orders: { label: 'Sifarişlər', icon: '📋' },
  payments: { label: 'Ödənişlər', icon: '💳' },
  cash: { label: 'Kassa', icon: '💰' },
  discount: { label: 'Endirim', icon: '🏷️' },
  staff: { label: 'İşçilər', icon: '👥' },
  reports: { label: 'Hesabatlar', icon: '📊' },
  inventory: { label: 'Anbar', icon: '📦' },
  reservations: { label: 'Rezervasiyalar', icon: '📅' },
  kitchen: { label: 'Mətbəx', icon: '🍳' },
};

export function getStaffCountForRole(roleId: string, staff: StaffMember[] = []): number {
  return staff.filter(s => s.role_id === roleId).length;
}
