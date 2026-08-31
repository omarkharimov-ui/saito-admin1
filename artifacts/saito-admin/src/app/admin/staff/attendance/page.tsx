'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Clock, Users, AlertTriangle, CheckCircle, XCircle, Calendar } from 'lucide-react';
import { toast } from '@/lib/toast';

type AttendanceRecord = {
  staff_id: string;
  staff_name: string;
  role: string;
  scheduled_start: string;
  scheduled_end: string;
  actual_start: string | null;
  actual_end: string | null;
  late_minutes: number;
  overtime_minutes: number;
  status: 'present' | 'late' | 'absent' | 'left_early';
};

export default function AttendancePage() {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  const fetchAttendance = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/staff/attendance?date=${selectedDate}`);
      if (res.ok) {
        const data = await res.json();
        setRecords(data.records || []);
      }
    } catch { toast.error('Failed to load attendance'); }
    finally { setLoading(false); }
  }, [selectedDate]);

  useEffect(() => { fetchAttendance(); }, [fetchAttendance]);

  const onTime = records.filter(r => r.status === 'present').length;
  const late = records.filter(r => r.status === 'late').length;
  const absent = records.filter(r => r.status === 'absent').length;

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-2xl font-black text-[var(--theme-text)] tracking-tight">ATTENDANCE</h1>
          <p className="text-[10px] text-[var(--theme-text-muted)] mt-0.5 uppercase tracking-widest">
            Scheduled vs Actual
          </p>
        </div>
        <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
          className="rounded-xl px-4 py-2 text-xs text-[var(--theme-text)] outline-none"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }} />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3 flex-shrink-0">
        <div className="p-4 rounded-2xl border" style={{ background: 'rgba(16, 185, 129, 0.05)', borderColor: 'rgba(16, 185, 129, 0.15)' }}>
          <CheckCircle size={16} className="text-emerald-400 mb-2" />
          <p className="text-xl font-bold text-[var(--theme-text)]">{onTime}</p>
          <p className="text-[9px] text-[var(--theme-text-muted)] uppercase tracking-wider">On Time</p>
        </div>
        <div className="p-4 rounded-2xl border" style={{ background: 'rgba(245, 158, 11, 0.05)', borderColor: 'rgba(245, 158, 11, 0.15)' }}>
          <AlertTriangle size={16} className="text-amber-400 mb-2" />
          <p className="text-xl font-bold text-[var(--theme-text)]">{late}</p>
          <p className="text-[9px] text-[var(--theme-text-muted)] uppercase tracking-wider">Late</p>
        </div>
        <div className="p-4 rounded-2xl border" style={{ background: 'rgba(244, 63, 94, 0.05)', borderColor: 'rgba(244, 63, 94, 0.15)' }}>
          <XCircle size={16} className="text-rose-400 mb-2" />
          <p className="text-xl font-bold text-[var(--theme-text)]">{absent}</p>
          <p className="text-[9px] text-[var(--theme-text-muted)] uppercase tracking-wider">Absent</p>
        </div>
      </div>

      {/* Records */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.02)' }} />
            ))}
          </div>
        ) : records.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Calendar size={48} className="mx-auto text-[var(--theme-text-muted)] mb-4" />
              <p className="text-sm text-[var(--theme-text-secondary)]">No attendance records</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {records.map((record, idx) => (
              <div key={record.staff_id} className="p-4 rounded-xl flex items-center gap-4"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="min-w-[150px]">
                  <p className="text-sm font-medium text-[var(--theme-text)]">{record.staff_name}</p>
                  <p className="text-[10px] text-[var(--theme-text-muted)]">{record.role}</p>
                </div>
                <div className="min-w-[120px]">
                  <p className="text-xs text-[var(--theme-text)]">{record.scheduled_start} - {record.scheduled_end}</p>
                  <p className="text-[10px] text-[var(--theme-text-muted)]">scheduled</p>
                </div>
                <div className="min-w-[120px]">
                  <p className="text-xs text-[var(--theme-text)]">
                    {record.actual_start ? `${record.actual_start} - ${record.actual_end || 'now'}` : '—'}
                  </p>
                  <p className="text-[10px] text-[var(--theme-text-muted)]">actual</p>
                </div>
                <div className="min-w-[80px]">
                  {record.late_minutes > 0 && (
                    <p className="text-xs text-amber-400">+{record.late_minutes}m late</p>
                  )}
                  {record.overtime_minutes > 0 && (
                    <p className="text-xs text-emerald-400">+{record.overtime_minutes}m OT</p>
                  )}
                </div>
                <div className="ml-auto">
                  <span className={`px-2 py-1 rounded-lg text-[10px] font-medium ${
                    record.status === 'present' ? 'bg-emerald-500/10 text-emerald-400' :
                    record.status === 'late' ? 'bg-amber-500/10 text-amber-400' :
                    record.status === 'absent' ? 'bg-rose-500/10 text-rose-400' :
                    'bg-zinc-500/10 text-zinc-400'
                  }`}>
                    {record.status.toUpperCase()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
