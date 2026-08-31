'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, Clock, Users, Plus, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { toast } from '@/lib/toast';

type ScheduleEntry = {
  id: string;
  staff_id: string;
  staff_name: string;
  staff_role: string;
  schedule_date: string;
  planned_start: string;
  planned_end: string;
};

type DaySchedule = {
  date: string;
  dayName: string;
  staff: {
    id: string;
    name: string;
    role: string;
    start: string;
    end: string;
  }[];
};

export default function SchedulePage() {
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(getWeekStart(new Date()));
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('18:00');

  const fetchSchedule = useCallback(async () => {
    setLoading(true);
    try {
      const startStr = currentWeekStart.toISOString().split('T')[0];
      const endDate = new Date(currentWeekStart);
      endDate.setDate(endDate.getDate() + 6);
      const endStr = endDate.toISOString().split('T')[0];

      const res = await fetch(`/api/staff/schedule?start=${startStr}&end=${endStr}`);
      if (res.ok) {
        const data = await res.json();
        setSchedule(data.schedule || []);
      }
    } catch { toast.error('Failed to load schedule'); }
    finally { setLoading(false); }
  }, [currentWeekStart]);

  useEffect(() => { fetchSchedule(); }, [fetchSchedule]);

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(currentWeekStart);
    date.setDate(date.getDate() + i);
    return {
      date: date.toISOString().split('T')[0],
      dayName: date.toLocaleDateString('en-US', { weekday: 'short' }),
      dayNum: date.getDate(),
    };
  });

  const getScheduleForDay = (date: string) => {
    return schedule.filter(s => s.schedule_date === date);
  };

  const handleAddSchedule = async () => {
    if (!selectedStaff || !selectedDate || !startTime || !endTime) {
      toast.error('Please fill all fields');
      return;
    }
    try {
      const res = await fetch('/api/staff/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staff_id: selectedStaff,
          schedule_date: selectedDate,
          planned_start: startTime,
          planned_end: endTime,
        }),
      });
      if (res.ok) {
        toast.success('Schedule added');
        setShowAddModal(false);
        fetchSchedule();
      } else {
        toast.error('Failed to add schedule');
      }
    } catch { toast.error('Error'); }
  };

  const prevWeek = () => {
    const newDate = new Date(currentWeekStart);
    newDate.setDate(newDate.getDate() - 7);
    setCurrentWeekStart(newDate);
  };

  const nextWeek = () => {
    const newDate = new Date(currentWeekStart);
    newDate.setDate(newDate.getDate() + 7);
    setCurrentWeekStart(newDate);
  };

  // Get unique staff for dropdown
  const uniqueStaff = Array.from(new Set(schedule.map(s => s.staff_id))).map(id => {
    const entry = schedule.find(s => s.staff_id === id);
    return { id, name: entry?.staff_name || '', role: entry?.staff_role || '' };
  });

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-2xl font-black text-[var(--theme-text)] tracking-tight">SCHEDULE</h1>
          <p className="text-[10px] text-[var(--theme-text-muted)] mt-0.5 uppercase tracking-widest">
            Weekly Schedule
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <button onClick={prevWeek} className="p-2 rounded-lg hover:bg-white/5 text-[var(--theme-text-muted)]">
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs text-[var(--theme-text)] px-3">
              {currentWeekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {new Date(currentWeekStart.getTime() + 6 * 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
            <button onClick={nextWeek} className="p-2 rounded-lg hover:bg-white/5 text-[var(--theme-text-muted)]">
              <ChevronRight size={16} />
            </button>
          </div>
          <button onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[var(--theme-text)] text-[var(--theme-surface)] rounded-xl text-xs font-bold uppercase tracking-wider hover:opacity-90 transition-all">
            <Plus size={14} /> Add Shift
          </button>
        </div>
      </div>

      {/* Schedule Grid */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-24 rounded-2xl animate-pulse" style={{ background: 'rgba(255,255,255,0.02)' }} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
            {/* Header Row */}
            <div className="grid grid-cols-7 gap-px" style={{ background: 'rgba(255,255,255,0.06)' }}>
              {weekDays.map(day => (
                <div key={day.date} className="p-3 text-center" style={{ background: 'rgba(255,255,255,0.02)' }}>
                  <p className="text-[10px] text-[var(--theme-text-muted)] uppercase">{day.dayName}</p>
                  <p className="text-sm font-bold text-[var(--theme-text)]">{day.dayNum}</p>
                </div>
              ))}
            </div>
            {/* Staff Rows */}
            <div className="grid grid-cols-7 gap-px" style={{ background: 'rgba(255,255,255,0.06)' }}>
              {weekDays.map(day => {
                const daySchedule = getScheduleForDay(day.date);
                return (
                  <div key={day.date} className="p-2 min-h-[80px]" style={{ background: 'rgba(255,255,255,0.01)' }}>
                    {daySchedule.length === 0 ? (
                      <p className="text-[10px] text-[var(--theme-text-muted)] text-center mt-4">No shifts</p>
                    ) : (
                      <div className="space-y-1">
                        {daySchedule.map(entry => (
                          <div key={entry.id} className="p-1.5 rounded-lg text-[9px]" style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                            <p className="font-medium text-emerald-400 truncate">{entry.staff_name}</p>
                            <p className="text-[8px] text-emerald-400/70">{entry.planned_start} - {entry.planned_end}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Add Schedule Modal */}
      <AnimatePresence>
        {showAddModal && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-md" onClick={() => setShowAddModal(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[101] w-full max-w-md bg-[var(--theme-surface)] rounded-2xl shadow-2xl border border-[var(--theme-border)]">
              <div className="p-6 border-b border-[var(--theme-border)] flex items-center justify-between">
                <h2 className="text-base font-bold text-[var(--theme-text)]">Add Schedule</h2>
                <button onClick={() => setShowAddModal(false)} className="p-1 rounded-lg hover:bg-white/5 text-[var(--theme-text-muted)]">
                  <X size={16} />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-[var(--theme-text-secondary)] font-bold">Staff</label>
                  <select value={selectedStaff} onChange={e => setSelectedStaff(e.target.value)}
                    className="w-full mt-1 rounded-xl px-4 py-3 text-sm text-[var(--theme-text)] outline-none"
                    style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <option value="">Select staff...</option>
                    {uniqueStaff.map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-[var(--theme-text-secondary)] font-bold">Date</label>
                  <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
                    className="w-full mt-1 rounded-xl px-4 py-3 text-sm text-[var(--theme-text)] outline-none"
                    style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-[var(--theme-text-secondary)] font-bold">Start Time</label>
                    <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                      className="w-full mt-1 rounded-xl px-4 py-3 text-sm text-[var(--theme-text)] outline-none"
                      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }} />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-[var(--theme-text-secondary)] font-bold">End Time</label>
                    <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
                      className="w-full mt-1 rounded-xl px-4 py-3 text-sm text-[var(--theme-text)] outline-none"
                      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }} />
                  </div>
                </div>
              </div>
              <div className="p-6 border-t border-[var(--theme-border)] flex items-center justify-end gap-3">
                <button onClick={() => setShowAddModal(false)} className="px-4 py-2 text-xs font-bold text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] rounded-xl">Cancel</button>
                <button onClick={handleAddSchedule}
                  className="px-6 py-2 bg-[var(--theme-text)] text-[var(--theme-surface)] rounded-xl font-bold text-xs tracking-wide transition-all">
                  Add Shift
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
