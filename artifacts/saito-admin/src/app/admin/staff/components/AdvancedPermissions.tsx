'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Shield, Check, X, Lock } from 'lucide-react';

interface Permission {
  permission_code: string;
  permission_name: string;
  category_name: string;
  is_granted: boolean;
  source: string;
}

interface AdvancedPermissionsProps {
  staffId: string;
  isManager?: boolean;
}

export function AdvancedPermissions({ staffId, isManager }: AdvancedPermissionsProps) {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchPermissions = useCallback(async () => {
    try {
      const res = await fetch(`/api/permissions?staff=${staffId}`);
      if (res.ok) {
        const data = await res.json();
        setPermissions(Array.isArray(data) ? data : []);
      }
    } catch {
      // ignore
    }
  }, [staffId]);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  const categories = permissions.reduce((acc, p) => {
    if (!acc[p.category_name]) acc[p.category_name] = [];
    acc[p.category_name].push(p);
    return acc;
  }, {} as Record<string, Permission[]>);

  const handleToggle = async (permissionId: string, currentValue: boolean) => {
    if (!isManager) return;
    try {
      await fetch('/api/permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staffId,
          permissionId,
          isGranted: !currentValue,
          reason: 'Manual override',
          createdBy: staffId,
        }),
      });
      fetchPermissions();
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
          <Shield size={14} className="text-blue-400 mb-1" />
          <p className="text-sm font-bold text-[var(--theme-text)]">{permissions.length}</p>
          <p className="text-[9px] text-[var(--theme-text-muted)]">Total</p>
        </div>
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
          <Check size={14} className="text-emerald-400 mb-1" />
          <p className="text-sm font-bold text-emerald-400">{permissions.filter(p => p.is_granted).length}</p>
          <p className="text-[9px] text-[var(--theme-text-muted)]">Granted</p>
        </div>
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
          <X size={14} className="text-rose-400 mb-1" />
          <p className="text-sm font-bold text-rose-400">{permissions.filter(p => !p.is_granted).length}</p>
          <p className="text-[9px] text-[var(--theme-text-muted)]">Denied</p>
        </div>
      </div>

      {/* Permissions by Category */}
      <div className="space-y-4">
        {Object.entries(categories).map(([category, perms]) => (
          <div key={category}>
            <p className="text-[10px] uppercase tracking-wider text-[var(--theme-text-muted)] font-bold mb-2">
              {category}
            </p>
            <div className="space-y-1">
              {perms.map((perm) => (
                <div
                  key={perm.permission_code}
                  className="flex items-center justify-between p-2 rounded-lg bg-white/[0.02] border border-white/[0.06]"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[var(--theme-text)]">{perm.permission_name}</span>
                    {perm.source === 'override' && (
                      <span className="px-1.5 py-0.5 rounded text-[8px] bg-amber-500/10 text-amber-400">Override</span>
                    )}
                  </div>
                  <button
                    onClick={() => handleToggle(perm.permission_code, perm.is_granted)}
                    disabled={!isManager}
                    className={`w-8 h-5 rounded-full transition-colors ${
                      perm.is_granted ? 'bg-emerald-500' : 'bg-zinc-600'
                    } ${!isManager ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white transition-transform ${
                      perm.is_granted ? 'translate-x-3.5' : 'translate-x-0.5'
                    }`} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
