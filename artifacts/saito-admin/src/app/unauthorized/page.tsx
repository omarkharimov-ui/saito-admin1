'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';

export default function UnauthorizedPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#0a0a0a]">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full text-center space-y-6"
      >
        <div className="flex justify-center">
          <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20">
            <ShieldAlert size={40} className="text-red-500" />
          </div>
        </div>
        
        <div className="space-y-2">
          <h1 className="text-3xl font-serif font-bold text-white tracking-tight">Access Denied</h1>
          <p className="text-white/40 text-sm tracking-wide">
            You do not have the required permissions to access this section. 
            Please contact your administrator if you believe this is an error.
          </p>
        </div>

        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white/5 text-white text-sm font-medium hover:bg-white/10 transition-colors border border-white/10"
        >
          <ArrowLeft size={16} />
          Go Back
        </button>
      </motion.div>
    </div>
  );
}
