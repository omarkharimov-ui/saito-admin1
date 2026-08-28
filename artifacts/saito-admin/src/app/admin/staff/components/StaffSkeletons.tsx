'use client';

import React from 'react';
import { Users, UserPlus } from 'lucide-react';
import { EmptyState } from '@/components/ui/primitives';

export function StaffEmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <EmptyState
      icon={<Users size={48} />}
      title="İşçi tapılmadı"
      description="Axtarış kriteriyalarını dəyişdirin və ya yeni işçi əlavə edin"
      action={
        <button
          onClick={onCreate}
          className="flex items-center gap-2 px-5 py-2.5 bg-white text-black rounded-2xl text-xs font-bold tracking-wide hover:bg-white/90 transition-all shadow-lg active:scale-95"
        >
          <UserPlus size={14} />
          Yeni İşçi
        </button>
      }
    />
  );
}

export function ShiftsEmptyState() {
  return (
    <EmptyState
      icon={<Users size={48} />}
      title="Smeta tapılmadı"
      description="Hazırda aktiv smena yoxdur və ya filtrə uyğun nəticə yoxdur"
    />
  );
}

export function StaffSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div
          key={i}
          className="h-16 rounded-2xl bg-white/[0.02] border border-white/[0.04] animate-pulse"
          style={{ animationDelay: `${i * 50}ms` }}
        />
      ))}
    </div>
  );
}

export function ShiftSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="h-24 rounded-2xl bg-white/[0.02] border border-white/[0.04] animate-pulse"
          style={{ animationDelay: `${i * 80}ms` }}
        />
      ))}
    </div>
  );
}
