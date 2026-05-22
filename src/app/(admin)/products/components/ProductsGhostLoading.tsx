'use client';

import React from 'react';
import { motion } from 'framer-motion';

export function ProductsGhostLoading() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {Array.from({ length: 9 }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: i * 0.03 }}
          className="bg-white/[0.02] border border-white/[0.06] rounded-2xl overflow-hidden"
        >
          {/* Image Placeholder */}
          <div className="h-40 bg-white/[0.05]" />
          
          {/* Content */}
          <div className="p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div className="h-5 w-3/4 bg-white/[0.08] rounded" />
              <div className="h-6 w-16 bg-white/[0.08] rounded-full" />
            </div>
            
            <div className="h-3 w-full bg-white/[0.04] rounded" />
            <div className="h-3 w-2/3 bg-white/[0.04] rounded" />
            
            <div className="flex items-center justify-between pt-3 border-t border-white/[0.05]">
              <div className="h-6 w-20 bg-white/[0.06] rounded" />
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 bg-white/[0.06] rounded-lg" />
                <div className="h-8 w-8 bg-white/[0.06] rounded-lg" />
              </div>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
