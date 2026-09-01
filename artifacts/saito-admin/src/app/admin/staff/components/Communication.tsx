'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Plus, Mail, MessageSquare, Bell, FileText } from 'lucide-react';

interface Message {
  message_id: string;
  from_staff_name: string;
  subject: string;
  content: string;
  message_type: string;
  is_read: boolean;
  created_at: string;
}

interface CommunicationProps {
  staffId: string;
  staffName: string;
}

export function Communication({ staffId, staffName }: CommunicationProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [showCompose, setShowCompose] = useState(false);
  const [toStaffId, setToStaffId] = useState('');
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [messageType, setMessageType] = useState('direct');

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/messages?staff=${staffId}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(Array.isArray(data) ? data : []);
      }
    } catch {
      // ignore
    }
  }, [staffId]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  const handleSend = async () => {
    if (!content) return;
    try {
      await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromStaffId: staffId,
          toStaffId: toStaffId || null,
          type: messageType,
          subject,
          content,
        }),
      });
      setShowCompose(false);
      setContent('');
      setSubject('');
      fetchMessages();
    } catch {
      // ignore
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'announcement': return <Bell size={14} />;
      case 'broadcast': return <MessageSquare size={14} />;
      case 'shift_note': return <FileText size={14} />;
      default: return <Mail size={14} />;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-[10px] uppercase tracking-wider text-[var(--theme-text-muted)] font-bold">
          {messages.length} Messages
        </p>
        <button
          onClick={() => setShowCompose(true)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-500 text-white text-xs font-bold"
        >
          <Plus size={12} />
          Compose
        </button>
      </div>

      {/* Messages */}
      <div className="space-y-2">
        {messages.slice(0, 10).map((msg) => (
          <div key={msg.message_id} className={`p-3 rounded-xl border ${
            msg.is_read ? 'bg-white/[0.02] border-white/[0.06]' : 'bg-blue-500/5 border-blue-500/20'
          }`}>
            <div className="flex items-center gap-2 mb-1">
              {getTypeIcon(msg.message_type)}
              <span className="text-xs font-medium text-[var(--theme-text)]">{msg.from_staff_name}</span>
              {!msg.is_read && <span className="ml-auto w-2 h-2 rounded-full bg-blue-400" />}
            </div>
            {msg.subject && <p className="text-xs text-[var(--theme-text)]">{msg.subject}</p>}
            <p className="text-xs text-[var(--theme-text-secondary)] line-clamp-2">{msg.content}</p>
            <p className="text-[9px] text-[var(--theme-text-muted)] mt-1">
              {new Date(msg.created_at).toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      {/* Compose Modal */}
      <AnimatePresence>
        {showCompose && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[102] flex items-center justify-center bg-black/50"
            onClick={() => setShowCompose(false)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="w-full max-w-md p-6 rounded-2xl bg-[var(--theme-surface)] border border-[var(--theme-border)]"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-sm font-bold text-[var(--theme-text)] mb-4">New Message</h3>
              <div className="space-y-3">
                <select
                  value={messageType}
                  onChange={(e) => setMessageType(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.08] text-[var(--theme-text)] text-sm"
                >
                  <option value="direct">Direct Message</option>
                  <option value="broadcast">Broadcast</option>
                  <option value="announcement">Announcement</option>
                  <option value="shift_note">Shift Note</option>
                </select>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Subject"
                  className="w-full px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.08] text-[var(--theme-text)] text-sm"
                />
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Message..."
                  className="w-full px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.08] text-[var(--theme-text)] text-sm resize-none"
                  rows={4}
                />
                <button
                  onClick={handleSend}
                  className="w-full py-2 rounded-xl bg-blue-500 text-white font-bold text-sm flex items-center justify-center gap-2"
                >
                  <Send size={14} />
                  Send
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
