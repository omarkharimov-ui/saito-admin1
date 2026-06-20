'use client';

import React from 'react';
import { motion } from 'framer-motion';

// Reusable skeleton components for instant page loading

// Kombo kartına uyğun skeleton (real ölçülər) + fade-out
export function ComboCardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <motion.div 
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8 }}
      className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white/[0.02] border border-white/[0.06] rounded-2xl overflow-hidden">
          {/* Şəkil hissəsi - h-36 */}
          <div className="h-36 bg-white/[0.05]" />
          
          {/* Content hissəsi */}
          <div className="p-4 space-y-3">
            {/* Title + Price */}
            <div className="flex items-start justify-between gap-2">
              <div className="h-4 bg-white/[0.05] rounded w-2/3" />
              <div className="h-5 bg-white/[0.08] rounded w-16" />
            </div>
            
            {/* Description */}
            <div className="h-3 bg-white/[0.03] rounded w-full" />
            <div className="h-3 bg-white/[0.03] rounded w-2/3" />
            
            {/* Items preview */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <div className="h-6 bg-white/[0.04] rounded-lg w-20" />
              <div className="h-6 bg-white/[0.04] rounded-lg w-16" />
              <div className="h-6 bg-white/[0.04] rounded-lg w-24" />
            </div>
            
            {/* Footer */}
            <div className="flex items-center justify-between pt-3 border-t border-white/[0.05]">
              <div className="h-7 bg-white/[0.04] rounded-lg w-24" />
              <div className="h-3 bg-white/[0.03] rounded w-20" />
            </div>
          </div>
        </div>
      ))}
    </motion.div>
  );
}

export function CardSkeleton({ count = 6 }: { count?: number }) {
  return (
    <motion.div 
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8 }}
      className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5">
          <div className="flex gap-4">
            <div className="w-20 h-20 bg-white/[0.05] rounded-xl" />
            <div className="flex-1 space-y-3">
              <div className="h-4 bg-white/[0.05] rounded w-3/4" />
              <div className="h-3 bg-white/[0.03] rounded w-1/2" />
              <div className="h-5 bg-white/[0.05] rounded w-1/3 mt-2" />
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-white/[0.04] flex justify-between">
            <div className="h-3 bg-white/[0.03] rounded w-20" />
            <div className="h-3 bg-white/[0.03] rounded w-16" />
          </div>
        </div>
      ))}
    </motion.div>
  );
}

export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <motion.div 
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8 }}
      className="space-y-3">
      {/* Header */}
      <div className="flex gap-4 px-4 py-3 bg-white/[0.02] rounded-xl">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-4 bg-white/[0.05] rounded flex-1" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 px-4 py-4 bg-white/[0.02] rounded-xl">
          <div className="h-4 bg-white/[0.05] rounded w-16" />
          <div className="h-4 bg-white/[0.05] rounded flex-1" />
          <div className="h-4 bg-white/[0.05] rounded w-24" />
          <div className="h-4 bg-white/[0.05] rounded w-20" />
          <div className="h-4 bg-white/[0.05] rounded w-24" />
        </div>
      ))}
    </motion.div>
  );
}

export function StatSkeleton({ count = 4 }: { count?: number }) {
  return (
    <motion.div 
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8 }}
      className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5">
          <div className="h-3 bg-white/[0.05] rounded w-20 mb-3" />
          <div className="h-8 bg-white/[0.05] rounded w-16" />
        </div>
      ))}
    </motion.div>
  );
}

export function RowSkeleton({ count = 6 }: { count?: number }) {
  return (
    <motion.div 
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8 }}
      className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-4 bg-white/[0.02] rounded-xl">
          <div className="w-12 h-12 bg-white/[0.05] rounded-lg" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-white/[0.05] rounded w-1/3" />
            <div className="h-3 bg-white/[0.03] rounded w-1/2" />
          </div>
          <div className="h-8 bg-white/[0.05] rounded w-20" />
        </div>
      ))}
    </motion.div>
  );
}
