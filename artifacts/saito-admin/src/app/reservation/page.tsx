'use client';

export const dynamic = 'force-dynamic';

import React from 'react';
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import Reservation from "@/components/sections/Reservation";
import { motion } from "framer-motion";

export default function ReservationPage() {
  return (
    <main className="relative min-h-screen bg-black text-white selection:bg-gold selection:text-black overflow-x-hidden">
      <Navbar />
      
      {/* Page Header Padding */}
      <div className="pt-32 pb-12">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: "easeOut" }}
        >
          <Reservation />
        </motion.div>
      </div>
      
      <Footer />

      {/* Background grain/noise effect */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.03] z-[99] bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />
    </main>
  );
}
