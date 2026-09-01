'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Plus, AlertCircle, CheckCircle, Star, Wrench } from 'lucide-react';

interface HandoverNote {
  note_id: string;
  from_staff_name: string;
  note_type: string;
  priority: string;
  content: string;
  is_read: boolean;
  created_at: string;
}

interface ShiftHandoverProps {
  shiftId: string;
  staffId: string;
  staffName: string;
}

export function ShiftHandover({ shiftId, staffId, staffName }: ShiftHandoverProps) {
  const [notes, setNotes] = useState<HandoverNote[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [noteType, setNoteType] = useState('general');
  const [priority, setPriority] = useState('normal');
  const [content, setContent] = useState('');

  const fetchNotes = useCallback(async () => {
    try {
      const res = await fetch(`/api/handover?shift=${shiftId}`);
      if (res.ok) {
        const data = await res.json();
        setNotes(Array.isArray(data) ? data : []);
      }
    } catch {
      // ignore
    }
  }, [shiftId]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const handleAdd = async () => {
    if (!content) return;
    try {
      await fetch('/api/handover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shiftId,
          fromStaffId: staffId,
          type: noteType,
          priority,
          content,
        }),
      });
      setShowAdd(false);
      setContent('');
      fetchNotes();
    } catch {
      // ignore
    }
  };

  const getPriorityColor = (p: string) => {
    switch (p) {
      case 'urgent': return 'text-rose-400 bg-rose-500/10';
      case 'high': return 'text-amber-400 bg-amber-500/10';
      case 'normal': return 'text-blue-400 bg-blue-500/10';
      default: return 'text-zinc-400 bg-zinc-500/10';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'cash': return <CheckCircle size={14} />;
      case 'issues': return <AlertCircle size={14} />;
      case 'vip': return <Star size={14} />;
      case 'maintenance': return <Wrench size={14} />;
      default: return <FileText size={14} />;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-[10px] uppercase tracking-wider text-[var(--theme-text-muted)] font-bold">
          {notes.length} Notes
        </p>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-500 text-white text-xs font-bold"
        >
          <Plus size={12} />
          Add
        </button>
      </div>

      {/* Notes List */}
      <div className="space-y-2">
        {notes.map((note) => (
          <div key={note.note_id} className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center gap-2 mb-1">
              {getTypeIcon(note.note_type)}
              <span className="text-xs font-medium text-[var(--theme-text)]">{note.from_staff_name}</span>
              <span className={`ml-auto px-2 py-0.5 rounded text-[9px] font-medium ${getPriorityColor(note.priority)}`}>
                {note.priority}
              </span>
            </div>
            <p className="text-xs text-[var(--theme-text-secondary)]">{note.content}</p>
            <p className="text-[9px] text-[var(--theme-text-muted)] mt-1">
              {new Date(note.created_at).toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      {/* Add Modal */}
      <AnimatePresence>
        {showAdd && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[102] flex items-center justify-center bg-black/50"
            onClick={() => setShowAdd(false)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="w-full max-w-md p-6 rounded-2xl bg-[var(--theme-surface)] border border-[var(--theme-border)]"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-sm font-bold text-[var(--theme-text)] mb-4">Add Handover Note</h3>
              <div className="space-y-3">
                <select
                  value={noteType}
                  onChange={(e) => setNoteType(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.08] text-[var(--theme-text)] text-sm"
                >
                  <option value="general">General</option>
                  <option value="cash">Cash</option>
                  <option value="issues">Issues</option>
                  <option value="tasks">Tasks</option>
                  <option value="vip">VIP</option>
                  <option value="maintenance">Maintenance</option>
                </select>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.08] text-[var(--theme-text)] text-sm"
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Enter note..."
                  className="w-full px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.08] text-[var(--theme-text)] text-sm resize-none"
                  rows={4}
                />
                <button
                  onClick={handleAdd}
                  className="w-full py-2 rounded-xl bg-blue-500 text-white font-bold text-sm"
                >
                  Add Note
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
