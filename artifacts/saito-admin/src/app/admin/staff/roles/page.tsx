'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Shield, Plus, Save, X, Check, Users, Settings2, AlertTriangle, Trash2, Lock, ChevronDown } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { toast } from '@/lib/toast';
import { useFirstLoad } from '@/hooks/useFirstLoad';
import { getRoleColor } from '@/lib/staff-utils';
import { ConfirmDialog } from '../components/ConfirmDialog';

type Role = {
  id: string;
  name: string;
  is_system: boolean;
  created_at: string;
  permissions: string[];
};

type Permission = {
  id: string;
  key: string;
  description?: string;
  category: string;
};

const CATEGORY_LABELS: Record<string, string> = {
  orders: 'Orders',
  payments: 'Payments',
  cash: 'Cash',
  discount: 'Discount',
  staff: 'Staff',
  reports: 'Reports',
  inventory: 'Inventory',
  reservations: 'Reservations',
  kitchen: 'Kitchen',
};

export default function RolesPage() {
  const { t } = useLanguage();
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showCreateSheet, setShowCreateSheet] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [creating, setCreating] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; role: Role | null }>({ open: false, role: null });
  const [deleting, setDeleting] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const isFirstLoad = useFirstLoad(400, loading);
  const selectedRole = roles.find(r => r.id === selectedRoleId) || null;

  const fetchRoles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/staff/roles');
      if (res.ok) {
        const data = await res.json();
        setRoles(data.roles || []);
        setPermissions(data.permissions || []);
      }
    } catch {
      toast.error('Failed to load roles');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  const filteredRoles = useMemo(() => {
    if (!search.trim()) return roles;
    return roles.filter(r => r.name.toLowerCase().includes(search.toLowerCase()));
  }, [roles, search]);

  const groupedPermissions = useMemo(() => {
    const groups: Record<string, Permission[]> = {};
    permissions.forEach(p => {
      if (!groups[p.category]) groups[p.category] = [];
      groups[p.category].push(p);
    });
    return groups;
  }, [permissions]);

  const handleSelectRole = (roleId: string) => {
    if (hasChanges) {
      setPendingAction(() => () => {
        setHasChanges(false);
        setSelectedRoleId(roleId);
      });
      setShowUnsavedDialog(true);
    } else {
      setSelectedRoleId(roleId);
    }
  };

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const handlePermissionToggle = (permKey: string) => {
    if (!selectedRole || selectedRole.is_system) return;
    setHasChanges(true);

    const newPermissions = selectedRole.permissions.includes(permKey)
      ? selectedRole.permissions.filter(p => p !== permKey)
      : [...selectedRole.permissions, permKey];

    setRoles(prev => prev.map(r =>
      r.id === selectedRoleId ? { ...r, permissions: newPermissions } : r
    ));
  };

  const handleCategoryToggle = (categoryPerms: Permission[], checked: boolean) => {
    if (!selectedRole || selectedRole.is_system) return;
    setHasChanges(true);

    const categoryKeys = categoryPerms.map(p => p.key);
    const newPermissions = checked
      ? [...new Set([...selectedRole.permissions, ...categoryKeys])]
      : selectedRole.permissions.filter(p => !categoryKeys.includes(p));

    setRoles(prev => prev.map(r =>
      r.id === selectedRoleId ? { ...r, permissions: newPermissions } : r
    ));
  };

  const handleSave = async () => {
    if (!selectedRole || !hasChanges) return;
    setSaving(true);
    try {
      const res = await fetch('/api/staff/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role_id: selectedRole.id, permissions: selectedRole.permissions }),
      });

      if (res.ok) {
        toast.success('Permissions updated');
        setHasChanges(false);
        fetchRoles();
      } else {
        toast.error('Failed to save');
      }
    } catch {
      toast.error('Error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoleName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/staff/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', name: newRoleName.trim(), permissions: [] }),
      });

      if (res.ok) {
        toast.success('Role created');
        setNewRoleName('');
        setShowCreateSheet(false);
        fetchRoles();
      } else {
        toast.error('Failed to create role');
      }
    } catch {
      toast.error('Error occurred');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm.role) return;
    setDeleting(true);
    try {
      const res = await fetch('/api/staff/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', role_id: deleteConfirm.role.id }),
      });

      if (res.ok) {
        toast.success('Role deleted');
        if (selectedRoleId === deleteConfirm.role.id) {
          setSelectedRoleId(null);
        }
        fetchRoles();
      } else {
        toast.error('Failed to delete role');
      }
    } catch {
      toast.error('Error occurred');
    } finally {
      setDeleting(false);
      setDeleteConfirm({ open: false, role: null });
    }
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-black text-[var(--theme-text)] tracking-tight">ROLES</h1>
        <p className="text-[10px] text-[var(--theme-text-muted)] mt-1 uppercase tracking-widest">
          Permission control · {roles.length} roles
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Role List */}
        <div className="lg:col-span-1 space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--theme-text-muted)]" />
               <input
                 value={search}
                 onChange={(e) => setSearch(e.target.value)}
                 placeholder="Search roles..."
                 className="w-full bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] rounded-xl pl-9 pr-4 py-2 text-xs text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none focus:border-[var(--theme-border-strong)] transition-all"
               />
            </div>
            <button
              onClick={() => setShowCreateSheet(true)}
              className="w-9 h-9 rounded-xl bg-white text-black flex items-center justify-center hover:bg-white/90 transition-all shadow-lg active:scale-95 flex-shrink-0"
            >
              <Plus size={18} />
            </button>
          </div>

          {isFirstLoad ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-16 bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              <AnimatePresence mode="popLayout">
                {filteredRoles.map((role, idx) => {
                  const roleColor = getRoleColor(role.name);
                  const isSelected = role.id === selectedRoleId;
                  return (
                    <motion.button
                      key={role.id}
                      layout
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={{ delay: idx * 0.03 }}
                      onClick={() => handleSelectRole(role.id)}
                      className={`w-full text-left p-4 rounded-2xl border transition-all active:scale-[0.98] ${
                        isSelected
                          ? 'bg-[var(--theme-surface-soft)] border-[var(--theme-border-strong)] shadow-lg'
                          : 'bg-[var(--theme-surface-soft)] border-[var(--theme-border)] hover:bg-[var(--theme-surface)] hover:border-[var(--theme-border-strong)]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center border ${roleColor.bg} ${roleColor.border}`}>
                            {role.is_system ? (
                              <Lock size={14} className={roleColor.text} />
                            ) : (
                              <Shield size={14} className={roleColor.text} />
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-[var(--theme-text)]">{role.name}</p>
                            <p className="text-[10px] text-[var(--theme-text-muted)] uppercase tracking-wider">
                              {role.permissions.length} permissions · {role.is_system ? 'System' : 'Custom'}
                            </p>
                          </div>
                        </div>
                        {isSelected && (
                          <motion.div
                            layoutId="roleCheck"
                            className="w-5 h-5 rounded-full bg-white flex items-center justify-center"
                          >
                            <Check size={12} className="text-black" />
                          </motion.div>
                        )}
                      </div>
                    </motion.button>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Permission Matrix */}
        <div className="lg:col-span-2">
          {!selectedRole ? (
            <div className="bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] rounded-2xl p-12 text-center">
              <Shield size={48} className="text-[var(--theme-text-muted)] mx-auto mb-4" />
              <p className="text-sm font-bold text-[var(--theme-text-secondary)]">Select a role</p>
              <p className="text-xs text-[var(--theme-text-muted)] mt-1">Choose a role from the list to manage permissions</p>
            </div>
          ) : (
            <motion.div
              key={selectedRole.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] rounded-2xl overflow-hidden"
            >
              {/* Header */}
              <div className="p-6 border-b border-[var(--theme-border)]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border ${getRoleColor(selectedRole.name).bg} ${getRoleColor(selectedRole.name).border}`}>
                      {selectedRole.is_system ? (
                        <Lock size={20} className={getRoleColor(selectedRole.name).text} />
                      ) : (
                        <Shield size={20} className={getRoleColor(selectedRole.name).text} />
                      )}
                    </div>
                    <div>
                      <h2 className="text-base font-black text-[var(--theme-text)]">{selectedRole.name}</h2>
                      <p className="text-[10px] text-[var(--theme-text-muted)] uppercase tracking-widest">
                        {selectedRole.is_system ? 'System role — protected' : 'Custom role'} · {selectedRole.permissions.length} permissions
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {hasChanges && (
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-2 px-5 py-2.5 bg-white text-black rounded-2xl text-xs font-black uppercase tracking-wider hover:bg-white/90 transition-all shadow-lg active:scale-95 disabled:opacity-40"
                      >
                        {saving ? (
                          <span className="w-3.5 h-3.5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                        ) : (
                          <Save size={14} />
                        )}
                        Save
                      </button>
                    )}
                    {!selectedRole.is_system && (
                      <button
                        onClick={() => setDeleteConfirm({ open: true, role: selectedRole })}
                        className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 hover:bg-rose-500/20 transition-all active:scale-95"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              </div>

               {/* Permission Categories */}
               <div className="p-6 space-y-4">
                 {Object.entries(groupedPermissions).map(([category, categoryPerms]) => {
                   const allSelected = categoryPerms.every(p => selectedRole.permissions.includes(p.key));
                   const someSelected = categoryPerms.some(p => selectedRole.permissions.includes(p.key));

                   return (
                      <div key={category} className="bg-[var(--theme-surface)] border border-[var(--theme-border)] rounded-[24px] overflow-hidden">
                        <div className="px-5 py-3.5 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] font-black text-[var(--theme-text)] uppercase tracking-[0.2em]">
                              {CATEGORY_LABELS[category] || category}
                            </span>
                            <span className="text-[10px] text-[var(--theme-text-muted)] font-bold tabular-nums">
                              {categoryPerms.length}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            {!selectedRole.is_system && (
                               <span className={`text-[10px] uppercase tracking-wider font-bold ${allSelected ? 'text-emerald-400' : someSelected ? 'text-amber-400' : 'text-[var(--theme-text-muted)]'}`}>
                                 {allSelected ? 'All on' : someSelected ? 'Partial' : 'Off'}
                               </span>
                            )}
                            {!selectedRole.is_system && (
                              <motion.button
                                whileTap={{ scale: 0.95 }}
                                onClick={() => handleCategoryToggle(categoryPerms, !allSelected)}
                                className="text-[10px] font-bold text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] transition-colors"
                              >
                                {allSelected ? 'Clear' : 'Select all'}
                              </motion.button>
                            )}
                          </div>
                        </div>

                        <div className="px-4 pb-4 space-y-1.5">
                          {categoryPerms.map((perm) => {
                            const isSelected = selectedRole.permissions.includes(perm.key);
                            return (
                              <motion.button
                                key={perm.id}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => handlePermissionToggle(perm.key)}
                                disabled={selectedRole.is_system}
                                className={`w-full flex items-center gap-3 p-3 rounded-2xl border text-left transition-all ${
                                  isSelected
                                    ? 'bg-[var(--theme-surface-soft)] border-[var(--theme-border-strong)]'
                                    : 'bg-[var(--theme-surface)] border-[var(--theme-border)]'
                                } ${selectedRole.is_system ? 'opacity-70 cursor-not-allowed' : 'hover:border-[var(--theme-border-strong)]'}`}
                              >
                                <div className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-all ${
                                  isSelected
                                    ? 'bg-white border-[var(--theme-border-strong)] shadow-md'
                                    : 'border-[var(--theme-border)]'
                                }`}>
                                  {isSelected && <Check size={12} className="text-black" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-bold text-[var(--theme-text)] truncate">{perm.key}</p>
                                  {perm.description && (
                                    <p className="text-[10px] text-[var(--theme-text-muted)] truncate">{perm.description}</p>
                                  )}
                                </div>
                              </motion.button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* Create Role Sheet */}
      <AnimatePresence>
        {showCreateSheet && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-md"
              onClick={() => setShowCreateSheet(false)}
            />
            <motion.div
              initial={{ x: '100%', opacity: 0.8 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '100%', opacity: 0.8 }}
              transition={{ type: 'spring', stiffness: 400, damping: 35, mass: 0.9 }}
              className="fixed right-0 top-0 bottom-0 z-[101] w-full max-w-md bg-[var(--theme-surface)] border-l border-[var(--theme-border)] shadow-2xl flex flex-col rounded-l-[3.5rem]"
            >
              <div className="p-6 border-b border-[var(--theme-border)]">
                <h2 className="text-base font-black text-[var(--theme-text)]">New Role</h2>
                <p className="text-[10px] text-[var(--theme-text-muted)] mt-1 uppercase tracking-widest">Create a new role</p>
              </div>

              <form onSubmit={handleCreateRole} className="flex-1 overflow-y-auto p-6 space-y-5">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--theme-text-secondary)] font-bold">Role name *</label>
                  <input
                    required
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value)}
                    placeholder="e.g. dispatcher"
                    className="w-full bg-[var(--theme-surface)] border border-[var(--theme-border)] focus:border-[var(--theme-border-strong)] px-4 py-3 text-sm text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none rounded-2xl transition-all"
                  />
                </div>

                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20">
                  <div className="flex items-start gap-3">
                    <AlertTriangle size={18} className="text-amber-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-bold text-amber-400">Note</p>
                      <p className="text-[10px] text-amber-400/70 mt-1 leading-relaxed">
                        After creating the role, you can assign permissions. System roles cannot be modified.
                      </p>
                    </div>
                  </div>
                </div>
              </form>

              <div className="p-6 border-t border-[var(--theme-border)] flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateSheet(false)}
                  className="px-5 py-2.5 text-xs font-bold text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] transition-colors rounded-xl hover:bg-[var(--theme-surface-soft)]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateRole}
                  disabled={creating || !newRoleName.trim()}
                  className="flex items-center gap-2 bg-white text-black px-6 py-2.5 rounded-2xl font-bold text-xs tracking-wide transition-all disabled:opacity-40 shadow-lg hover:bg-white/90 active:scale-95"
                >
                  {creating ? (
                    <span className="w-3.5 h-3.5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                  ) : (
                    <Plus size={12} />
                  )}
                  Create
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={deleteConfirm.open}
        onClose={() => setDeleteConfirm({ open: false, role: null })}
        onConfirm={handleDelete}
        title="Delete Role"
        description={`Delete "${deleteConfirm.role?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        loading={deleting}
      />

      <ConfirmDialog
        open={showUnsavedDialog}
        onClose={() => { setShowUnsavedDialog(false); setPendingAction(null); }}
        onConfirm={() => {
          setHasChanges(false);
          if (pendingAction) {
            const action = pendingAction;
            setPendingAction(null);
            action();
          }
        }}
        title="Unsaved changes"
        description="You have unsaved permission changes. Continuing will discard them."
        confirmLabel="Continue"
        cancelLabel="Cancel"
        loading={false}
      />
    </div>
  );
}
