'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Shield, Plus, Save, X, Check, ChevronRight, Users, Settings2, AlertTriangle, Trash2 } from 'lucide-react';
import { useTheme } from '@/lib/theme/ThemeContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { toast } from '@/lib/toast';
import GoldSelect from '@/components/GoldSelect';
import { useFirstLoad } from '@/hooks/useFirstLoad';
import { EmptyState, LoadingSkeleton } from '@/components/ui/primitives';

type Role = {
  id: string;
  name: string;
  is_system: boolean;
  created_at: string;
  permissions: string[];
};

type Permission = {
  key: string;
  description: string;
  category: string;
};

type StaffCount = {
  role_id: string;
  count: number;
};

const PERMISSION_CATEGORIES: Record<string, { label: string; icon: string }> = {
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

const ROLE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  owner: { bg: 'bg-gold/10', text: 'text-gold', border: 'border-gold/20' },
  admin: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20' },
  manager: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' },
  cashier: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
  waiter: { bg: 'bg-indigo-500/10', text: 'text-indigo-400', border: 'border-indigo-500/20' },
  kitchen: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/20' },
  bartender: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20' },
  host: { bg: 'bg-pink-500/10', text: 'text-pink-400', border: 'border-pink-500/20' },
  stock: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/20' },
  accountant: { bg: 'bg-teal-500/10', text: 'text-teal-400', border: 'border-teal-500/20' },
};

export default function RolesPage() {
  const { lightMode } = useTheme();
  const { t } = useLanguage();
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [staffCounts, setStaffCounts] = useState<StaffCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [search, setSearch] = useState('');
  const [showCreateSheet, setShowCreateSheet] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const isFirstLoad = useFirstLoad(400, loading);

  const fetchRoles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/staff/roles');
      if (res.ok) {
        const data = await res.json();
        setRoles(data.roles || []);
        setPermissions(data.permissions || []);
      }

      // Fetch staff counts per role
      const staffRes = await fetch('/api/staff');
      if (staffRes.ok) {
        const staff = await staffRes.json();
        const counts: Record<string, number> = {};
        (Array.isArray(staff) ? staff : []).forEach((s: any) => {
          const rid = s.role_id || s.role;
          if (rid) counts[rid] = (counts[rid] || 0) + 1;
        });
        setStaffCounts(Object.entries(counts).map(([role_id, count]) => ({ role_id, count })));
      }
    } catch {
      toast.error('Rollar yüklənə bilmədi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  const groupedPermissions = useMemo(() => {
    const groups: Record<string, Permission[]> = {};
    for (const perm of permissions) {
      const category = perm.key.split('.')[0];
      if (!groups[category]) groups[category] = [];
      groups[category].push(perm);
    }
    return groups;
  }, [permissions]);

  const filteredRoles = useMemo(() => {
    if (!search) return roles;
    const q = search.toLowerCase();
    return roles.filter(r => r.name.toLowerCase().includes(q));
  }, [roles, search]);

  const getStaffCount = (roleId: string) => {
    return staffCounts.find(sc => sc.role_id === roleId)?.count || 0;
  };

  const handleSaveRole = async (role: Role, newPerms: string[]) => {
    if (role.is_system) {
      toast.error('Sistem rolları dəyişdirilə bilməz');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/staff/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role_id: role.id,
          permissions: newPerms,
          action: 'update',
        }),
      });

      if (res.ok) {
        toast.success('İcazələr yeniləndi');
        setSelectedRole(prev => prev ? { ...prev, permissions: newPerms } : null);
        setRoles(prev => prev.map(r => r.id === role.id ? { ...r, permissions: newPerms } : r));
      } else {
        const err = await res.json();
        toast.error(err.error || 'Yadda saxlanıla bilmədi');
      }
    } catch {
      toast.error('Xəta baş verdi');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateRole = async () => {
    if (!newRoleName.trim()) {
      toast.error('Rol adı daxil edin');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/staff/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newRoleName.trim(),
          is_system: false,
          permissions: [],
          action: 'create',
        }),
      });

      if (res.ok) {
        toast.success('Rol yaradıldı');
        setShowCreateSheet(false);
        setNewRoleName('');
        fetchRoles();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Rol yaradıla bilmədi');
      }
    } catch {
      toast.error('Xəta baş verdi');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRole = async (role: Role) => {
    if (role.is_system) {
      toast.error('Sistem rolları silinə bilməz');
      return;
    }

    if (getStaffCount(role.id) > 0) {
      toast.error('Bu rola bağlı işçilər var. Əvvəl işçiləri başqa rola köçürün.');
      return;
    }

    if (!confirm(`"${role.name}" rolunu silmək istəyirsiniz?`)) return;

    setDeletingId(role.id);
    try {
      const res = await fetch('/api/staff/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role_id: role.id,
          action: 'delete',
        }),
      });

      if (res.ok) {
        toast.success('Rol silindi');
        if (selectedRole?.id === role.id) setSelectedRole(null);
        fetchRoles();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Rol silinə bilmədi');
      }
    } catch {
      toast.error('Xəta baş verdi');
    } finally {
      setDeletingId(null);
    }
  };

  const togglePermission = (role: Role, permKey: string) => {
    if (role.is_system) {
      toast.error('Sistem rollarının icazələri dəyişdirilə bilməz');
      return;
    }
    const newPerms = role.permissions.includes(permKey)
      ? role.permissions.filter(p => p !== permKey)
      : [...role.permissions, permKey];
    handleSaveRole(role, newPerms);
  };

  const selectAllInCategory = (role: Role, category: string) => {
    if (role.is_system) {
      toast.error('Sistem rollarının icazələri dəyişdirilə bilməz');
      return;
    }
    const categoryPerms = permissions.filter(p => p.key.startsWith(category + '.'));
    const categoryKeys = categoryPerms.map(p => p.key);
    const allSelected = categoryKeys.every(k => role.permissions.includes(k));

    const newPerms = allSelected
      ? role.permissions.filter(p => !p.startsWith(category + '.'))
      : [...new Set([...role.permissions, ...categoryKeys])];

    handleSaveRole(role, newPerms);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-[var(--theme-text)]">Rollar və İcazələr</h1>
          <p className="text-sm text-[var(--theme-text-secondary)] mt-1">
            {roles.length} rol · {permissions.length} icazə
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--theme-text-muted)]" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rol axtar..."
              className="w-64 bg-[var(--theme-surface)] border border-[var(--theme-border)] rounded-xl pl-10 pr-4 py-2.5 text-sm text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none focus:border-[var(--theme-border-strong)]"
            />
          </div>
          <button
            onClick={() => setShowCreateSheet(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-[var(--theme-surface)] text-[var(--theme-text)] text-xs font-bold rounded-2xl hover:bg-[var(--theme-panel)] transition-all shadow-[0_10px_28px_rgba(0,0,0,0.12)] border border-[var(--theme-border)]"
          >
            <Plus size={14} /> Yeni Rol
          </button>
        </div>
      </div>

      {isFirstLoad ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-[var(--theme-surface-muted)] border border-[var(--theme-border)] rounded-2xl p-4 animate-pulse">
                <div className="h-5 bg-white/5 rounded w-1/2 mb-3" />
                <div className="h-4 bg-white/5 rounded w-full mb-2" />
                <div className="h-4 bg-white/5 rounded w-3/4" />
              </div>
            ))}
          </div>
          <div className="lg:col-span-2 bg-[var(--theme-surface-muted)] border border-[var(--theme-border)] rounded-2xl p-6 animate-pulse">
            <div className="h-6 bg-white/5 rounded w-1/3 mb-6" />
            <div className="space-y-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-12 bg-white/5 rounded-xl" />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Roles List */}
          <div className="lg:col-span-1 space-y-3">
            <AnimatePresence mode="popLayout">
              {filteredRoles.map((role, idx) => {
                const color = ROLE_COLORS[role.name.toLowerCase()] || { bg: 'bg-white/5', text: 'text-white/60', border: 'border-white/10' };
                const isSelected = selectedRole?.id === role.id;
                const staffCount = getStaffCount(role.id);

                return (
                  <motion.div
                    key={role.id}
                    layout
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2, delay: idx * 0.03 }}
                    onClick={() => setSelectedRole(role)}
                    className={`cursor-pointer bg-[var(--theme-surface-muted)] border rounded-2xl p-4 transition-all ${
                      isSelected
                        ? 'border-[var(--theme-border-strong)] shadow-lg'
                        : 'border-[var(--theme-border)] hover:border-[var(--theme-border-strong)]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Shield size={16} className={color.text} />
                        <span className="text-sm font-bold text-[var(--theme-text)]">{role.name}</span>
                      </div>
                      {role.is_system && (
                        <span className="text-[10px] text-[var(--theme-text-muted)] bg-white/5 px-2 py-0.5 rounded-lg">Sistem</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-xs text-[var(--theme-text-secondary)]">
                      <span className="flex items-center gap-1">
                        <Users size={12} />
                        {staffCount} işçi
                      </span>
                      <span>{role.permissions.length} icazə</span>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {filteredRoles.length === 0 && (
              <EmptyState
                icon={<Shield size={32} />}
                title="Rol tapılmadı"
                description="Axtarış kriteriyalarını dəyişdirin"
              />
            )}
          </div>

          {/* Permissions Matrix */}
          <div className="lg:col-span-2">
            {selectedRole ? (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-[var(--theme-surface-muted)] border border-[var(--theme-border)] rounded-2xl p-6"
              >
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      ROLE_COLORS[selectedRole.name.toLowerCase()]?.bg || 'bg-white/5'
                    }`}>
                      <Shield size={20} className={ROLE_COLORS[selectedRole.name.toLowerCase()]?.text || 'text-white/60'} />
                    </div>
                    <div>
                      <h2 className="text-lg font-black text-[var(--theme-text)]">{selectedRole.name}</h2>
                      <p className="text-xs text-[var(--theme-text-secondary)]">
                        {selectedRole.permissions.length} / {permissions.length} icazə
                        {selectedRole.is_system && ' · Sistem rolu'}
                      </p>
                    </div>
                  </div>
                  {saving && (
                    <div className="flex items-center gap-2 text-xs text-[var(--theme-text-muted)]">
                      <div className="w-4 h-4 border-2 border-gold border-t-transparent rounded-full animate-spin" />
                      Yadda saxlanılır...
                    </div>
                  )}
                </div>

                {selectedRole.is_system && (
                  <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-2">
                    <AlertTriangle size={14} className="text-amber-400" />
                    <p className="text-xs text-amber-400">Sistem rolları dəyişdirilə bilməz. Yalnız icazələri görüntüləyə bilərsiniz.</p>
                  </div>
                )}

                <div className="space-y-6">
                  {Object.entries(groupedPermissions).map(([category, perms]) => {
                    const categoryPerms = perms.map(p => p.key);
                    const selectedCount = categoryPerms.filter(k => selectedRole.permissions.includes(k)).length;
                    const allSelected = selectedCount === categoryPerms.length;

                    return (
                      <div key={category} className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{PERMISSION_CATEGORIES[category]?.icon || '📌'}</span>
                            <h3 className="text-sm font-bold text-[var(--theme-text)]">
                              {PERMISSION_CATEGORIES[category]?.label || category}
                            </h3>
                            <span className="text-[10px] text-[var(--theme-text-muted)] bg-white/5 px-2 py-0.5 rounded-lg">
                              {selectedCount}/{categoryPerms.length}
                            </span>
                          </div>
                          {!selectedRole.is_system && (
                            <button
                              onClick={() => selectAllInCategory(selectedRole, category)}
                              className="text-[10px] text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] transition-colors"
                            >
                              {allSelected ? 'Hamısını sil' : 'Hamısını seç'}
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {perms.map(perm => {
                            const isChecked = selectedRole.permissions.includes(perm.key);

                            return (
                              <motion.button
                                key={perm.key}
                                onClick={() => togglePermission(selectedRole, perm.key)}
                                disabled={saving || selectedRole.is_system}
                                whileTap={selectedRole.is_system ? {} : { scale: 0.98 }}
                                className={`flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                                  isChecked
                                    ? 'bg-gold/5 border-gold/20'
                                    : 'bg-white/5 border-transparent hover:border-white/10'
                                } ${saving || selectedRole.is_system ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                              >
                                <div className={`w-4 h-4 rounded-md border-2 flex items-center justify-center transition-all ${
                                  isChecked
                                    ? 'bg-gold border-gold'
                                    : 'border-white/20'
                                }`}>
                                  {isChecked && <Check size={10} className="text-black" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className={`text-xs font-medium truncate ${
                                    isChecked ? 'text-[var(--theme-text)]' : 'text-[var(--theme-text-secondary)]'
                                  }`}>
                                    {perm.key}
                                  </p>
                                  <p className="text-[10px] text-[var(--theme-text-muted)] truncate">
                                    {perm.description}
                                  </p>
                                </div>
                              </motion.button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {!selectedRole.is_system && (
                  <div className="mt-6 pt-4 border-t border-[var(--theme-border)] flex items-center justify-between">
                    <button
                      onClick={() => handleDeleteRole(selectedRole)}
                      disabled={deletingId === selectedRole.id}
                      className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-red-400 hover:bg-red-500/10 rounded-xl transition-all disabled:opacity-40"
                    >
                      {deletingId === selectedRole.id ? (
                        <div className="w-3 h-3 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Trash2 size={14} />
                      )}
                      Rol Sil
                    </button>
                    <p className="text-[10px] text-[var(--theme-text-muted)]">
                      Son dəyişikliklər avtomatik saxlanılır
                    </p>
                  </div>
                )}
              </motion.div>
            ) : (
              <div className="bg-[var(--theme-surface-muted)] border border-[var(--theme-border)] rounded-2xl p-12 flex flex-col items-center justify-center text-center">
                <Shield size={48} className="text-[var(--theme-text-muted)] opacity-20 mb-4" />
                <p className="text-sm text-[var(--theme-text-muted)]">
                  Sol paneldən rol seçin və ya yeni rol yaradın
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Role Sheet */}
      <AnimatePresence>
        {showCreateSheet && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-xl"
              onClick={() => setShowCreateSheet(false)}
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="fixed right-0 top-0 bottom-0 z-[101] w-full max-w-md bg-[var(--theme-surface)] border-l border-[var(--theme-border)] shadow-2xl flex flex-col"
            >
              <div className="flex items-center justify-between p-6 border-b border-[var(--theme-border)]">
                <div>
                  <h2 className="text-lg font-black text-[var(--theme-text)]">Yeni Rol</h2>
                  <p className="text-xs text-[var(--theme-text-muted)] mt-1">
                    Yeni rol yaradın və icazələri təyin edin
                  </p>
                </div>
                <button
                  onClick={() => setShowCreateSheet(false)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center bg-[var(--theme-surface-soft)] text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] transition-all"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--theme-text-secondary)] font-semibold">
                    Rol adı
                  </label>
                  <input
                    value={newRoleName}
                    onChange={e => setNewRoleName(e.target.value)}
                    placeholder="Məs: Supervisor"
                    className="w-full bg-[var(--theme-surface)] border border-[var(--theme-border)] focus:border-[var(--theme-border-strong)] px-4 py-2.5 text-sm text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none rounded-xl transition-all"
                  />
                </div>

                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <p className="text-xs text-amber-400">
                    Yeni rol yaradıldıqdan sonra icazələri seçmək üçün sol paneldən rola klik edin.
                  </p>
                </div>
              </div>

              <div className="p-6 border-t border-[var(--theme-border)] flex items-center justify-end gap-3">
                <button
                  onClick={() => setShowCreateSheet(false)}
                  className="px-5 py-2.5 text-xs text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] transition-colors rounded-lg hover:bg-[var(--theme-surface-muted)]"
                >
                  Ləğv Et
                </button>
                <button
                  onClick={handleCreateRole}
                  disabled={saving || !newRoleName.trim()}
                  className="flex items-center gap-2 bg-[var(--theme-surface)] text-[var(--theme-text)] px-6 py-2.5 rounded-2xl font-bold text-xs tracking-wide transition-all disabled:opacity-40 shadow-[0_10px_28px_rgba(0,0,0,0.12)] hover:bg-[var(--theme-panel)]"
                >
                  {saving ? (
                    <div className="w-3.5 h-3.5 border-2 border-gold border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Plus size={12} />
                  )}
                  Yarad
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
