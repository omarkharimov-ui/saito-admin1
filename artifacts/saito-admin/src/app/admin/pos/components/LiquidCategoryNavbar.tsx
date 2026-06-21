'use client';

import React, { useRef, useState } from 'react';
import { motion, useMotionValue } from 'framer-motion';
import { useTheme } from '@/lib/theme/ThemeContext';

interface Category {
  id: string;
  name: string;
}

interface LiquidCategoryNavbarProps {
  categories: Category[];
  activeId: string | null;
  onChange: (id: string | null) => void;
  allLabel: string;
}

export function LiquidCategoryNavbar({ categories, activeId, onChange, allLabel }: LiquidCategoryNavbarProps) {
  const { lightMode } = useTheme();
  const [isPressed, setIsPressed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const items = [{ id: null, name: allLabel }, ...categories];
  
  return (
    <div 
      ref={containerRef}
      className="relative flex gap-2 items-center overflow-x-auto pb-8 mb-2 scrollbar-none no-scrollbar select-none py-6 px-4"
    >
      {items.map((item) => {
        const isActive = activeId === item.id;
        
        return (
          <button
            key={item.id ?? 'all'}
            onPointerDown={() => setIsPressed(true)}
            onPointerUp={() => setIsPressed(false)}
            onPointerLeave={() => setIsPressed(false)}
            onClick={() => onChange(item.id)}
            className="relative px-7 py-3 rounded-full transition-colors duration-500 flex-shrink-0 outline-none focus-visible:ring-0 group touch-manipulation"
          >
            {isActive && (
              <motion.div
                layoutId="liquid-glass-floating-capsule"
                transition={{
                  type: "spring",
                  stiffness: 500,
                  damping: 35,
                  mass: 0.5,
                }}
                className={`absolute inset-0 z-0 rounded-[22px] border-t border-l shadow-2xl backdrop-blur-[40px]
                  ${isPressed ? 'scale-[1.08] -translate-y-2' : 'scale-100 translate-y-0'}
                  ${lightMode 
                    ? 'bg-zinc-900/95 border-white/20 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)]' 
                    : 'bg-white/10 border-white/30 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.8)]'
                  }`}
                style={{
                  boxShadow: isPressed 
                    ? (lightMode ? '0 35px 60px -15px rgba(0,0,0,0.6)' : '0 35px 60px -15px rgba(0,0,0,1)')
                    : undefined
                }}
              >
                {/* ── HIGH-END OPTICAL REFRACTION (The Iridescent Layer) ── */}
                <motion.div
                  animate={{
                    backgroundPosition: ["0% 0%", "100% 100%"],
                  }}
                  transition={{
                    duration: 3,
                    repeat: Infinity,
                    repeatType: "mirror",
                    ease: "linear",
                  }}
                  className="absolute inset-0 rounded-[22px] opacity-40 pointer-events-none mix-blend-overlay"
                  style={{
                    background: "radial-gradient(circle at center, rgba(120,119,198,0.3) 0%, rgba(255,121,121,0.1) 40%, transparent 70%)",
                    backgroundSize: "200% 200%",
                  }}
                />
                
                {/* ── GLASS EDGE SPECULAR (Light hitting the edges) ── */}
                <div className="absolute inset-0 rounded-[22px] overflow-hidden pointer-events-none">
                  <div className={`absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/40 to-transparent`} />
                  <div className={`absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent`} />
                </div>

                {/* ── LIQUID LIFT GLOW ── */}
                {isPressed && (
                  <motion.div 
                    layoutId="liquid-glow"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className={`absolute -inset-2 rounded-[30px] blur-2xl z-[-1] ${lightMode ? 'bg-zinc-900/20' : 'bg-white/10'}`}
                  />
                )}
              </motion.div>
            )}
            
            <span className={`relative z-10 text-[12px] font-black uppercase tracking-[0.25em] transition-all duration-500
              ${isActive 
                ? 'text-white' 
                : 'text-[#8e8e93] group-hover:text-zinc-900 dark:group-hover:text-white'
              }
              ${isPressed && isActive ? 'scale-110' : 'scale-100'}
            `}>
              {item.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
