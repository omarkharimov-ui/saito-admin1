'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Shield, AlertTriangle, CheckCircle, XCircle, Clock, User, LogIn, LogOut, Key } from 'lucide-react';

interface SecurityEvent {
  id: string;
  event_type: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  created_at: string;
  ip_address?: string;
}

interface SecurityTabProps {
  staffId: string;
}

export function SecurityTab({ staffId }: SecurityTabProps) {
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<string>('all');

  const fetchSecurityEvents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/staff/${staffId}/security`);
      if (res.ok) {
        const data = await res.json();
        setEvents(Array.isArray(data) ? data : []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [staffId]);

  useEffect(() => {
    fetchSecurityEvents();
  }, [fetchSecurityEvents]);

  const filteredEvents = filter === 'all'
    ? events
    : events.filter(e => e.severity === filter);

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'login': return <LogIn size={14} />;
      case 'logout': return <LogOut size={14} />;
      case 'failed_login': return <XCircle size={14} />;
      case 'pin_change': return <Key size={14} />;
      case 'permission_change': return <Shield size={14} />;
      default: return <AlertTriangle size={14} />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-rose-400 bg-rose-500/10 border-rose-500/20';
      case 'high': return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
      case 'medium': return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
      default: return 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20';
    }
  };

  const getEventColor = (type: string) => {
    switch (type) {
      case 'login': return 'text-emerald-400';
      case 'logout': return 'text-blue-400';
      case 'failed_login': return 'text-rose-400';
      case 'pin_change': return 'text-amber-400';
      case 'permission_change': return 'text-purple-400';
      default: return 'text-zinc-400';
    }
  };

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-4 gap-3">
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
          <Shield size={14} className="text-blue-400 mb-1" />
          <p className="text-sm font-bold text-[var(--theme-text)]">{events.length}</p>
          <p className="text-[9px] text-[var(--theme-text-muted)]">Total Events</p>
        </div>
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
          <CheckCircle size={14} className="text-emerald-400 mb-1" />
          <p className="text-sm font-bold text-emerald-400">{events.filter(e => e.event_type === 'login').length}</p>
          <p className="text-[9px] text-[var(--theme-text-muted)]">Logins</p>
        </div>
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
          <XCircle size={14} className="text-rose-400 mb-1" />
          <p className="text-sm font-bold text-rose-400">{events.filter(e => e.event_type === 'failed_login').length}</p>
          <p className="text-[9px] text-[var(--theme-text-muted)]">Failed</p>
        </div>
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
          <AlertTriangle size={14} className="text-amber-400 mb-1" />
          <p className="text-sm font-bold text-amber-400">{events.filter(e => e.severity === 'high' || e.severity === 'critical').length}</p>
          <p className="text-[9px] text-[var(--theme-text-muted)]">Alerts</p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {['all', 'critical', 'high', 'medium', 'low'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize ${
              filter === f
                ? 'bg-blue-500 text-white'
                : 'bg-white/[0.03] border border-white/[0.08] text-[var(--theme-text-muted)]'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Events List */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 rounded-xl animate-pulse bg-white/[0.02]" />
          ))}
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="p-8 rounded-2xl bg-white/[0.02] border border-white/[0.06] text-center">
          <Shield size={48} className="mx-auto text-[var(--theme-text-muted)] mb-4" />
          <p className="text-sm text-[var(--theme-text-secondary)]">No security events</p>
          <p className="text-xs text-[var(--theme-text-muted)] mt-1">Security events will appear here</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredEvents.map((event) => (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`p-3 rounded-xl border ${getSeverityColor(event.severity)}`}
            >
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 ${getEventColor(event.event_type)}`}>
                  {getEventIcon(event.event_type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-[var(--theme-text)]">{event.description}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Clock size={10} className="text-[var(--theme-text-muted)]" />
                    <span className="text-[9px] text-[var(--theme-text-muted)]">
                      {new Date(event.created_at).toLocaleString()}
                    </span>
                    {event.ip_address && (
                      <span className="text-[9px] text-[var(--theme-text-muted)]">
                        IP: {event.ip_address}
                      </span>
                    )}
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded text-[9px] font-medium capitalize ${getSeverityColor(event.severity)}`}>
                  {event.severity}
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
