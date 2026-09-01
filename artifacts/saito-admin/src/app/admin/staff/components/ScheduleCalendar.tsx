'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, Clock, Plus, ChevronLeft, ChevronRight, X, Users, AlertTriangle } from 'lucide-react';

interface ScheduleEntry {
  schedule_id: string;
  staff_id: string;
  staff_name: string;
  role_name: string;
  schedule_date: string;
  planned_start: string;
  planned_end: string;
  notes: string;
}

interface StaffMember {
  id: string;
  full_name: string;
  role_name: string;
}

interface ScheduleCalendarProps {
  staffId?: string;
}

export function ScheduleCalendar({ staffId }: ScheduleCalendarProps) {
  const [currentWeek, setCurrentWeek] = useState<Date>(new Date());
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedStaff, setSelectedStaff] = useState<string>('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [notes, setNotes] = useState('');

  const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const hours = Array.from({ length: 14 }, (_, i) => i + 6);

  const getWeekDates = useCallback((date: Date) => {
    const week = [];
    const start = new Date(date);
    const day = start.getDay();
    const diff = start.getDate() - day + (day === 0 ? -6 : 1);
    start.setDate(diff);

    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      week.push(d);
    }
    return week;
  }, []);

  const weekDates = getWeekDates(currentWeek);

  const fetchSchedule = useCallback(async () => {
    setLoading(true);
    try {
      const start = weekDates[0].toISOString().split('T')[0];
      const end = weekDates[6].toISOString().split('T')[0];
      const res = await fetch(`/api/schedule?start=${start}&end=${end}`);
      if (res.ok) {
        const data = await res.json();
        setSchedule(Array.isArray(data) ? data : []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [weekDates]);

  const fetchStaff = useCallback(async () => {
    try {
      const res = await fetch('/api/staff/directory-v2');
      if (res.ok) {
        const data = await res.json();
        setStaff(data.staff || []);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchSchedule();
    fetchStaff();
  }, [fetchSchedule, fetchStaff]);

  const prevWeek = () => {
    const d = new Date(currentWeek);
    d.setDate(d.getDate() - 7);
    setCurrentWeek(d);
  };

  const nextWeek = () => {
    const d = new Date(currentWeek);
    d.setDate(d.getDate() + 7);
    setCurrentWeek(d);
  };

  const handleAddSchedule = async () => {
    if (!selectedStaff || !selectedDate) return;

    try {
      const res = await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staffId: selectedStaff,
          date: selectedDate,
          start: startTime,
          end: endTime,
          notes,
        }),
      });

      if (res.ok) {
        setShowAddModal(false);
        setSelectedDate('');
        setSelectedStaff('');
        setNotes('');
        fetchSchedule();
      }
    } catch {
      // ignore
    }
  };

  const getScheduleForDay = (date: string) => {
    return schedule.filter((s) => s.schedule_date === date);
  };

  const formatDate = (date: Date) => {
    return date.toISOString().split('T')[0];
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={prevWeek}
            className="p-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="text-center">
            <p className="text-sm font-medium text-[var(--theme-text)]">
              {weekDates[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {weekDates[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
          <button
            onClick={nextWeek}
            className="p-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 text-white text-xs font-bold"
        >
          <Plus size={14} />
          Add Shift
        </button>
      </div>

      {/* Calendar Grid */}
      <div className="rounded-xl border border-white/[0.06] overflow-hidden">
        {/* Day Headers */}
        <div className="grid grid-cols-8 border-b border-white/[0.06]">
          <div className="p-2 text-[10px] text-[var(--theme-text-muted)] font-medium border-r border-white/[0.06]">
            Time
          </div>
          {weekDates.map((date, i) => (
            <div
              key={i}
              className={`p-2 text-center border-r border-white/[0.06] last:border-r-0 ${
                formatDate(date) === formatDate(new Date()) ? 'bg-emerald-500/5' : ''
              }`}
            >
              <p className="text-[10px] text-[var(--theme-text-muted)]">{weekDays[i]}</p>
              <p className={`text-sm font-medium ${formatDate(date) === formatDate(new Date()) ? 'text-emerald-400' : 'text-[var(--theme-text)]'}`}>
                {date.getDate()}
              </p>
            </div>
          ))}
        </div>

        {/* Time Slots */}
        <div className="max-h-[400px] overflow-y-auto">
          {hours.map((hour) => (
            <div key={hour} className="grid grid-cols-8 border-b border-white/[0.04] last:border-b-0">
              <div className="p-2 text-[10px] text-[var(--theme-text-muted)] border-r border-white/[0.06] flex items-start justify-center">
                {hour.toString().padStart(2, '0')}:00
              </div>
              {weekDates.map((date, dayIndex) => {
                const dateStr = formatDate(date);
                const daySchedule = getScheduleForDay(dateStr).filter((s) => {
                  const startHour = parseInt(s.planned_start.split(':')[0]);
                  return startHour === hour;
                });

                return (
                  <div
                    key={dayIndex}
                    className="p-1 border-r border-white/[0.06] last:border-r-0 min-h-[40px]"
                  >
                    {daySchedule.map((entry) => (
                      <div
                        key={entry.schedule_id}
                        className="p-1 rounded bg-blue-500/10 border border-blue-500/20 text-[9px] text-blue-400 mb-1"
                      >
                        <p className="font-medium truncate">{entry.staff_name}</p>
                        <p className="text-blue-400/70">{entry.planned_start.slice(0, 5)}-{entry.planned_end.slice(0, 5)}</p>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Add Shift Modal */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[102] flex items-center justify-center bg-black/50"
            onClick={() => setShowAddModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="w-full max-w-md p-6 rounded-2xl bg-[var(--theme-surface)] border border-[var(--theme-border)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-[var(--theme-text)]">Add Shift</h3>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="p-1 rounded-lg text-[var(--theme-text-muted)] hover:text-[var(--theme-text)]"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-[var(--theme-text-muted)] font-bold mb-2 block">
                    Staff
                  </label>
                  <select
                    value={selectedStaff}
                    onChange={(e) => setSelectedStaff(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.08] text-[var(--theme-text)] text-sm focus:outline-none focus:border-[var(--theme-text)]"
                  >
                    <option value="">Select staff</option>
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.full_name} ({s.role_name})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-wider text-[var(--theme-text-muted)] font-bold mb-2 block">
                    Date
                  </label>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.08] text-[var(--theme-text)] text-sm focus:outline-none focus:border-[var(--theme-text)]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-[var(--theme-text-muted)] font-bold mb-2 block">
                      Start Time
                    </label>
                    <input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.08] text-[var(--theme-text)] text-sm focus:outline-none focus:border-[var(--theme-text)]"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-[var(--theme-text-muted)] font-bold mb-2 block">
                      End Time
                    </label>
                    <input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.08] text-[var(--theme-text)] text-sm focus:outline-none focus:border-[var(--theme-text)]"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-wider text-[var(--theme-text-muted)] font-bold mb-2 block">
                    Notes
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Optional notes..."
                    className="w-full px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.08] text-[var(--theme-text)] text-sm focus:outline-none focus:border-[var(--theme-text)]"
                  />
                </div>

                <button
                  onClick={handleAddSchedule}
                  disabled={!selectedStaff || !selectedDate}
                  className="w-full py-3 rounded-xl bg-emerald-500 text-white font-bold text-sm disabled:opacity-50"
                >
                  Add Shift
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
