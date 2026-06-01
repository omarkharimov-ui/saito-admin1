'use client';

import React from 'react';
import { motion } from 'framer-motion';

export function ProductsSkeleton() {
  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="h-8 w-32 bg-white/[0.05] rounded-lg" />
          <div className="h-4 w-48 bg-white/[0.03] rounded" />
        </div>
        <div className="h-10 w-40 bg-gold/20 rounded-xl" />
      </div>

      {/* Search & Filters */}
      <div className="flex items-center gap-4">
        <div className="h-12 flex-1 max-w-md bg-white/[0.03] border border-white/[0.06] rounded-2xl" />
        <div className="h-12 w-32 bg-white/[0.03] rounded-xl" />
        <div className="h-12 w-32 bg-white/[0.03] rounded-xl" />
      </div>

      {/* Products Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {Array.from({ length: 9 }).map((_, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="bg-white/[0.02] border border-white/[0.06] rounded-2xl overflow-hidden"
          >
            {/* Image */}
            <div className="h-40 bg-white/[0.05]" />
            
            {/* Content */}
            <div className="p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div className="h-5 w-3/4 bg-white/[0.08] rounded" />
                <div className="h-6 w-16 bg-white/[0.08] rounded" />
              </div>
              
              <div className="h-3 w-full bg-white/[0.03] rounded" />
              <div className="h-3 w-2/3 bg-white/[0.03] rounded" />
              
              <div className="flex items-center justify-between pt-3 border-t border-white/[0.05]">
                <div className="h-7 w-24 bg-white/[0.05] rounded-lg" />
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 bg-white/[0.05] rounded-lg" />
                  <div className="h-8 w-8 bg-white/[0.05] rounded-lg" />
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
