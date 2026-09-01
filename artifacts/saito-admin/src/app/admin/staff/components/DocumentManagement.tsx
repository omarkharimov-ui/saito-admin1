'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { FileText, Upload, AlertTriangle, CheckCircle } from 'lucide-react';

interface Document {
  id: string;
  document_type: string;
  file_name: string;
  expiration_date: string;
  is_verified: boolean;
}

interface DocumentManagementProps {
  staffId: string;
}

export function DocumentManagement({ staffId }: DocumentManagementProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await fetch(`/api/documents?staff=${staffId}`);
      if (res.ok) {
        const data = await res.json();
        setDocuments(Array.isArray(data) ? data : []);
      }
    } catch {
      // ignore
    }
  }, [staffId]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const isExpiringSoon = (date: string) => {
    if (!date) return false;
    const exp = new Date(date);
    const now = new Date();
    const diff = exp.getTime() - now.getTime();
    return diff < 30 * 24 * 60 * 60 * 1000;
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      contract: 'Contract',
      id: 'ID Document',
      certification: 'Certification',
      training: 'Training',
      medical: 'Medical',
      other: 'Other',
    };
    return labels[type] || type;
  };

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
          <FileText size={14} className="text-blue-400 mb-1" />
          <p className="text-sm font-bold text-[var(--theme-text)]">{documents.length}</p>
          <p className="text-[9px] text-[var(--theme-text-muted)]">Total</p>
        </div>
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
          <CheckCircle size={14} className="text-emerald-400 mb-1" />
          <p className="text-sm font-bold text-emerald-400">{documents.filter(d => d.is_verified).length}</p>
          <p className="text-[9px] text-[var(--theme-text-muted)]">Verified</p>
        </div>
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
          <AlertTriangle size={14} className="text-amber-400 mb-1" />
          <p className="text-sm font-bold text-amber-400">{documents.filter(d => isExpiringSoon(d.expiration_date)).length}</p>
          <p className="text-[9px] text-[var(--theme-text-muted)]">Expiring</p>
        </div>
      </div>

      {/* Documents List */}
      <div className="space-y-2">
        {documents.map((doc) => (
          <div key={doc.id} className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText size={14} className="text-[var(--theme-text-muted)]" />
                <div>
                  <p className="text-xs font-medium text-[var(--theme-text)]">{doc.file_name}</p>
                  <p className="text-[9px] text-[var(--theme-text-muted)]">{getTypeLabel(doc.document_type)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {doc.is_verified && <CheckCircle size={12} className="text-emerald-400" />}
                {isExpiringSoon(doc.expiration_date) && <AlertTriangle size={12} className="text-amber-400" />}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
