'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface LanguageTransitionProps {
  isTransitioning: boolean;
  children: React.ReactNode;
}

export default function LanguageTransition({ isTransitioning, children }: LanguageTransitionProps) {
  const [showTransition, setShowTransition] = useState(false);

  useEffect(() => {
    if (isTransitioning) {
      setShowTransition(true);
      
      // Hide transition after animation completes
      const timer = setTimeout(() => {
        setShowTransition(false);
      }, 800); // Match the animation duration
      
      return () => clearTimeout(timer);
    }
  }, [isTransitioning]);

  return (
    <>
      {/* Main content */}
      <div className={`transition-opacity duration-300 ${showTransition ? 'opacity-0' : 'opacity-100'}`}>
        {children}
      </div>

      {/* Black screen transition */}
      <AnimatePresence>
        {showTransition && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '-100%' }}
            transition={{ 
              type: 'tween',
              duration: 0.4,
              ease: [0.4, 0, 0.2, 1]
            }}
            className="fixed inset-0 z-[9999] bg-black"
          >
            {/* Optional loading indicator */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex flex-col items-center gap-4">
                {/* Language switching animation */}
                <div className="relative w-16 h-16">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    className="absolute inset-0 border-2 border-gold/20 border-t-gold rounded-full"
                  />
                  <motion.div
                    animate={{ rotate: -360 }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                    className="absolute inset-2 border-2 border-gold/10 border-b-gold/50 rounded-full"
                  />
                </div>
                
                {/* Language text */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2, duration: 0.3 }}
                  className="text-center"
                >
                  <p className="text-gold text-sm font-medium tracking-wider uppercase">
                    Dil dəyişdirilir
                  </p>
                  <p className="text-white/40 text-xs mt-1">
                    Language switching
                  </p>
                </motion.div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
