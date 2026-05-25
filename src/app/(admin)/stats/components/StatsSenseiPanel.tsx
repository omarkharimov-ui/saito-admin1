'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  BrainCircuit, Loader2, XCircle, Sparkles, Sliders, MessageSquare, Send, Zap,
  Lightbulb, AlertTriangle, Sprout, Users, CloudRain, Cloud, Sun, ChevronDown,
  CalendarDays, ArrowRight, ShoppingBag, Link2, Target, BarChart3, TrendingDown,
  Wind, Star, Flag, Thermometer,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage, interpolateTemplate } from '@/lib/i18n/LanguageContext';
import GoldSelect from '@/components/GoldSelect';

interface ProductPerf {
  name: string;
  sold: number;
  revenue: number;
  views: number;
  conversion: string;
}

interface SenseiAdvice {
  title: string;
  text: string;
  type: string;
}

interface BehavioralInsight {
  type: 'insight' | 'risk' | 'growth';
  icon: string;
  title: string;
  text: string;
  impact: 'high' | 'medium' | 'low';
}

interface BehavioralData {
  customerProfile: string;
  insights: BehavioralInsight[];
  missedPairings: string[];
  behaviorPattern: string;
  coPurchasePairs: { pair: string; count: number }[];
  soloProducts: string[];
  avgBasketSize: number;
}

interface Correlation {
  factor: string;
  effect: string;
  action: string;
  type: 'weather' | 'event' | 'pattern';
}

interface CorrelatorData {
  weatherImpact: { summary: string; recommendation: string; riskLevel: string };
  eventImpact: { summary: string; recommendation: string; urgency: string };
  correlations: Correlation[];
  weatherCategoryAdvice: string;
  weekendEffect: string;
  weatherForecast: {
    date: string;
    dayName: string;
    tempMin: number;
    tempMax: number;
    condition: 'rain' | 'snow' | 'clear' | 'cloudy' | 'windy' | 'storm';
    rainHours: number;
    maxWind: number;
    impact: {
      level: 'high' | 'medium' | 'low';
      revenueExpectation: string;
      summary: string;
      recommendation: string;
    };
  }[];
  upcomingEvents: { date: string; name: string; impact: string; score: number; dayOfWeek: string }[];
  isWeekend: boolean;
  dayOfWeek: string;
}


interface StatsSenseiPanelProps {
  stats: {
    totalRevenue: number;
    totalOrders: number;
    aov: number;
    peakHours?: { hour: number; count: number }[];
    chartData?: { date: string; value: number }[];
    productPerformance: ProductPerf[];
    tableChurn?: { totalTables: number; repeatTables: number; churnedTables: number; churnRate: number; avgDaysBetween: number } | null;
    haloProducts?: { name: string; avgWith: number; avgWithout: number; uplift: number; ordersWith: number }[];
    cancelPeakHours?: Record<string, { hour: number; count: number }[]>;
    categoryPerformance?: { name: string; sold: number; revenue: number }[];
  };
  aiAnalysis: string | null;
  aiDisplayed: string | null;
  aiLoading: boolean;
  aiClosing: boolean;
  logoFlash: boolean;
  senseiStatsAdvice: SenseiAdvice | null;
  chatMessages: { role: 'user' | 'ai'; text: string }[];
  chatLoading: boolean;
  whatIfProduct: string;
  whatIfChange: number;
  whatIfResult: string | null;
  whatIfLoading: boolean;
  onFetchAiAnalysis: () => void;
  onCloseAiAnalysis: () => void;
  onSendChat: (msg: string) => void;
  onWhatIfProductChange: (v: string) => void;
  onWhatIfChangeChange: (v: number) => void;
  onFetchWhatIf: () => void;
  orderItems?: any[];
  restaurantCity?: string;
}

/* ─── Matrix Rain ─── */
function MatrixRain() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const visibleRef = useRef(true);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    const cols = Math.floor(canvas.width / 14);
    const drops = Array(cols).fill(0);
    const chars = 'アイウエオカキクケコ0123456789₼%';
    const observer = new IntersectionObserver(([e]) => { visibleRef.current = e.isIntersecting; }, { threshold: 0 });
    observer.observe(canvas);
    const onVis = () => { visibleRef.current = document.visibilityState === 'visible'; };
    document.addEventListener('visibilitychange', onVis);
    let intervalId: ReturnType<typeof setInterval>;
    const draw = () => {
      if (!visibleRef.current || document.visibilityState === 'hidden') return;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.06)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'rgba(212, 175, 55, 0.15)';
      ctx.font = '11px monospace';
      for (let i = 0; i < drops.length; i++) {
        const ch = chars[Math.floor(Math.random() * chars.length)];
        ctx.fillText(ch, i * 14, drops[i] * 14);
        if (drops[i] * 14 > canvas.height && Math.random() > 0.975) drops[i] = 0;
        drops[i]++;
      }
    };
    intervalId = setInterval(draw, 80);
    return () => { clearInterval(intervalId); observer.disconnect(); document.removeEventListener('visibilitychange', onVis); };
  }, []);
  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none opacity-40" />;
}

/* ─── Typing Effect Hook ─── */
function useTypingEffect(text: string | null, speed = 20) {
  const [displayed, setDisplayed] = useState<string | null>(null);
  useEffect(() => {
    if (!text) { setDisplayed(null); return; }
    setDisplayed('');
    let i = 0;
    let rafId: number;
    let lastTime = 0;
    const step = (now: number) => {
      if (now - lastTime >= speed) {
        lastTime = now;
        i++;
        setDisplayed(text.slice(0, i));
        if (i >= text.length) return;
      }
      rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [text, speed]);
  return displayed;
}

// Module-level component: stable reference prevents unmount/remount on parent re-render
export function HologramGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const visibleRef = useRef(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize();
    const onResize = () => resize();
    window.addEventListener('resize', onResize);

    // IntersectionObserver — fully pause when scrolled out of view
    const observer = new IntersectionObserver(
      ([entry]) => { visibleRef.current = entry.isIntersecting; },
      { threshold: 0 }
    );
    observer.observe(canvas);

    const cols = 16;
    const rows = 8;
    const chars = '0123456789₼+-×÷%ΔΣΠ';
    type Cell = { x: number; y: number; char: string; phase: number; speed: number };
    const cells: Cell[] = [];
    for (let i = 0; i < cols * rows; i++) {
      cells.push({
        x: (i % cols) / cols,
        y: Math.floor(i / cols) / rows,
        char: chars[Math.floor(Math.random() * chars.length)],
        phase: Math.random() * Math.PI * 2,
        speed: 0.5 + Math.random() * 1.5,
      });
    }

    let interval: ReturnType<typeof setInterval> | null = null;
    const draw = () => {
      if (!ctx || !visibleRef.current || document.visibilityState === 'hidden') return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const w = canvas.width;
      const h = canvas.height;
      const cw = w / cols;
      const rh = h / rows;

      // Sparse grid lines
      ctx.strokeStyle = 'rgba(212, 175, 55, 0.012)';
      ctx.lineWidth = 0.5;
      for (let i = 0; i <= cols; i += 3) {
        const x = i * cw;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let i = 0; i <= rows; i += 3) {
        const y = i * rh;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }

      // Flowing numbers
      cells.forEach(c => {
        c.phase += c.speed * 0.015;
        const alpha = (Math.sin(c.phase) + 1) * 0.5 * 0.04;
        if (alpha < 0.003) return;
        if (Math.random() < 0.005) c.char = chars[Math.floor(Math.random() * chars.length)];
        ctx.fillStyle = `rgba(212, 175, 55, ${alpha})`;
        ctx.font = `${Math.max(9, Math.min(12, cw * 0.45))}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(c.char, c.x * w + cw / 2, c.y * h + rh / 2);
      });
    };

    interval = setInterval(draw, 300);
    return () => {
      window.removeEventListener('resize', onResize);
      observer.disconnect();
      if (interval) clearInterval(interval);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />;
}

export default function StatsSenseiPanel({
  stats, aiAnalysis, aiDisplayed, aiLoading, aiClosing, logoFlash,
  senseiStatsAdvice, chatMessages, chatLoading,
  whatIfProduct, whatIfChange, whatIfResult, whatIfLoading,
  onFetchAiAnalysis, onCloseAiAnalysis, onSendChat,
  onWhatIfProductChange, onWhatIfChangeChange, onFetchWhatIf,
  orderItems,
  restaurantCity = 'Baku,AZ',
}: StatsSenseiPanelProps) {
  const { t, language } = useLanguage();
  const [chatInput, setChatInput] = useState('');
  const [chatOpen, setChatOpen] = useState(false);
  const [fabHovered, setFabHovered] = useState(false);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  const [tooltipShown, setTooltipShown] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [predictiveBubble, setPredictiveBubble] = useState<string | null>(null);
  const [robotJoy, setRobotJoy] = useState(false);
  const [robotMouse, setRobotMouse] = useState({ x: 0, y: 0 });
  const fabRef = useRef<HTMLDivElement>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // LERP targets & current values — no state, direct DOM update via RAF
  const mouseTargetRef = useRef({ x: 0, y: 0 });
  const headCurrentRef = useRef({ x: 0, y: 0 });
  const eyeCurrentRef  = useRef({ x: 0, y: 0 });
  const headDivRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const predictiveIndexRef = useRef(0);

  /* ─── Mobile breakpoint sync ─── */
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  /* ─── Welcome tooltip — disabled ─── */
  useEffect(() => {
    // tooltip removed
  }, []);

  /* ─── Stop scan overlay when AI finishes loading ─── */
  useEffect(() => {
    if (!aiLoading && scanning) setScanning(false);
  }, [aiLoading]);

  /* ─── Mouse tracking + LERP RAF loop ─── */
  useEffect(() => {
    if (chatOpen) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

    const onMove = (e: MouseEvent) => {
      if (!fabRef.current) return;
      const rect = fabRef.current.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy) || 1;
      const diag = Math.hypot(window.innerWidth, window.innerHeight);
      const f = Math.min(dist, diag * 0.55) / (diag * 0.55);
      // clamp: ±40deg head horizontal, ±12deg vertical (in our scale units)
      mouseTargetRef.current = {
        x: clamp((dx / dist) * f * 4, -4, 4),
        y: clamp((dy / dist) * f * 3, -3, 3),
      };
    };

    const tick = () => {
      const tgt = mouseTargetRef.current;
      // Head: slow LERP (0.07) — lags behind
      headCurrentRef.current = {
        x: lerp(headCurrentRef.current.x, tgt.x, 0.07),
        y: lerp(headCurrentRef.current.y, tgt.y, 0.07),
      };
      // Eyes: fast LERP (0.18) — snap to target faster
      eyeCurrentRef.current = {
        x: lerp(eyeCurrentRef.current.x, tgt.x, 0.18),
        y: lerp(eyeCurrentRef.current.y, tgt.y, 0.18),
      };
      // Apply head 3D rotation directly to DOM
      if (headDivRef.current) {
        const ry = headCurrentRef.current.x * 14;
        const rx = -headCurrentRef.current.y * 11;
        headDivRef.current.style.transform = `rotateY(${ry}deg) rotateX(${rx}deg)`;
      }
      // Sync React state for pupil SVG cx/cy (throttled via RAF — ~60fps)
      setRobotMouse({ x: eyeCurrentRef.current.x, y: eyeCurrentRef.current.y });
      rafRef.current = requestAnimationFrame(tick);
    };

    window.addEventListener('mousemove', onMove);
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener('mousemove', onMove);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [chatOpen]);


  /* ─── Predictive bubbles every 45 s ─── */
  useEffect(() => {
    if (chatOpen) return;
    const buildHints = (): string[] => {
      const hints: string[] = [];
      if (stats.peakHours?.length) {
        const peak = stats.peakHours[0];
        hints.push(
          language === 'az' ? `⏰ Saat ${peak.hour}:00 pik saatdır — ortalama ${peak.count} sifariş` :
          language === 'ru' ? `⏰ ${peak.hour}:00 — пик, ~${peak.count} заказов` :
          `⏰ ${peak.hour}:00 is peak — avg ${peak.count} orders`
        );
      }
      if (stats.productPerformance?.length) {
        const top = stats.productPerformance[0];
        hints.push(
          language === 'az' ? `✨ Ən çox satan: "${top.name}" — ${top.sold} ədəd` :
          language === 'ru' ? `✨ Топ продукт: "${top.name}" — ${top.sold} шт.` :
          `✨ Top seller: "${top.name}" — ${top.sold} sold`
        );
      }
      if (stats.aov) {
        hints.push(
          language === 'az' ? `📊 Orta sifariş dəyəri: ₼${stats.aov.toFixed(1)}` :
          language === 'ru' ? `📊 Средний чек: ₼${stats.aov.toFixed(1)}` :
          `📊 Avg order value: ₼${stats.aov.toFixed(1)}`
        );
      }
      if (stats.totalOrders > 0) {
        hints.push(
          language === 'az' ? `📈 Bu dövrdə ${stats.totalOrders} sifariş, ₼${stats.totalRevenue.toFixed(0)} gəlir` :
          language === 'ru' ? `📈 ${stats.totalOrders} зак., ₼${stats.totalRevenue.toFixed(0)} выручка` :
          `📈 ${stats.totalOrders} orders, ₼${stats.totalRevenue.toFixed(0)} revenue`
        );
      }
      return hints.length ? hints : [
        language === 'az' ? '🤖 Soruş, kömək edim!' :
        language === 'ru' ? '🤖 Спрашивай, помогу!' : '🤖 Ask me anything!'
      ];
    };
    const cycle = () => {
      const hints = buildHints();
      setPredictiveBubble(hints[predictiveIndexRef.current % hints.length]);
      predictiveIndexRef.current++;
      setTimeout(() => setPredictiveBubble(null), 7000);
    };
    const interval = setInterval(cycle, 45000);
    return () => clearInterval(interval);
  }, [chatOpen, stats, language]);

  /* ─── Idle hint after 30 s no mouse move ─── */
  useEffect(() => {
    if (chatOpen) return;
    const resetIdle = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        if (!chatOpen) setPredictiveBubble(
          language === 'az' ? '🤖 Hər şey haqqında soruşa bilərsən — toxun!' :
          language === 'ru' ? '🤖 Могу помочь, нажми!' : '🤖 Need help? Tap me!'
        );
        setTimeout(() => setPredictiveBubble(null), 6000);
      }, 30000);
    };
    window.addEventListener('mousemove', resetIdle);
    resetIdle();
    return () => { window.removeEventListener('mousemove', resetIdle); if (idleTimerRef.current) clearTimeout(idleTimerRef.current); };
  }, [chatOpen, language]);

  /* ─── Deep Scan Data State ─── */
  const [behavioralData, setBehavioralData] = useState<BehavioralData | null>(null);
  const [deepScanLoading, setDeepScanLoading] = useState(false);
  const [correlatorData, setCorrelatorData] = useState<CorrelatorData | null>(null);
  const [simProduct, setSimProduct] = useState('');
  const [simPriceChange, setSimPriceChange] = useState(0);
  const [simResult, setSimResult] = useState<string | null>(null);
  const [simLoading, setSimLoading] = useState(false);
  const [simExpanded, setSimExpanded] = useState(false);
  const simResultTyped = useTypingEffect(simResult, 12);

  /* ─── Cross-sell Simulator State ─── */
  const [crossBase, setCrossBase] = useState('');
  const [crossAddon, setCrossAddon] = useState('');
  const [crossPrice, setCrossPrice] = useState(1);
  const [crossRate, setCrossRate] = useState(30);
  const [crossResult, setCrossResult] = useState<string | null>(null);
  const [overviewExpanded, setOverviewExpanded] = useState(false);

  /* ─── Deep Scan Fetchers ─── */
  const fetchAllDeepData = async () => {
    if (stats.totalOrders === 0) return;
    setDeepScanLoading(true);
    try {
      const [behRes, corrRes] = await Promise.all([
        fetch('/api/sensei/behavioral', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderItems: orderItems || [], peakHours: stats.peakHours || [], totalOrders: stats.totalOrders, aov: stats.aov, language }),
        }),
        fetch('/api/sensei/correlator', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            totalOrders: stats.totalOrders, totalRevenue: stats.totalRevenue, aov: stats.aov,
            chartData: stats.chartData || [], peakHours: stats.peakHours || [], language,
            categoryPerformance: stats.categoryPerformance || [],
            city: restaurantCity,
          }),
        }),
      ]);
      const behData = await behRes.json();
      const corrData = await corrRes.json();
      if (!behData.error) setBehavioralData(behData);
      if (!corrData.error) setCorrelatorData(corrData);
    } catch { /* silent */ }
    finally { setDeepScanLoading(false); }
  };

  const fetchSimulation = async () => {
    const prod = stats.productPerformance.find(p => p.name === simProduct);
    if (!prod || simPriceChange === 0) return;
    setSimLoading(true); setSimResult(null);
    try {
      const res = await fetch('/api/sensei/whatif', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product: prod.name, currentPrice: prod.revenue / (prod.sold || 1), changePercent: simPriceChange, currentSold: prod.sold, totalRevenue: stats.totalRevenue, language }),
      });
      const data = await res.json();
      if (data.projection) setSimResult(data.projection);
    } catch { /* silent */ }
    finally { setSimLoading(false); }
  };

  // Pre-fetch deep data as soon as button is clicked (not after aiAnalysis resolves)
  const handleDeepScanClick = () => {
    if (!behavioralData && !correlatorData && !deepScanLoading) {
      fetchAllDeepData();
    }
    onFetchAiAnalysis();
  };

  // Keep fallback: also fetch if aiAnalysis arrived but deep data still missing
  useEffect(() => {
    if (!aiAnalysis) return;
    if (!behavioralData && !correlatorData && !deepScanLoading) {
      fetchAllDeepData();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiAnalysis]);

  const handleSend = () => {
    if (!chatInput.trim() || chatLoading) return;
    onSendChat(chatInput.trim());
    setChatInput('');
  };

  const productNames = stats.productPerformance.slice(0, 10).map(p => p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

  const hl = (text: string): React.ReactNode[] => {
    const parts = text.split(/(<<[^>]+>>|₼[\d,.]+|\b\d+[.,]?\d*\s*%?\b)/g);
    return parts.map((part, idx) => {
      if (/^<<.+>>$/.test(part)) {
        const word = part.slice(2, -2);
        return <span key={idx} className="text-white/90 font-semibold">{word}</span>;
      }
      if (/₼[\d,.]+|\b\d+[.,]?\d*\s*%?\b/.test(part)) {
        return <strong key={idx} className="text-white/85 font-semibold">{part}</strong>;
      }
      return <span key={idx}>{part}</span>;
    });
  };

  const parseAction = (ln: string) => {
    const impactMatch = ln.match(/\[(t[əe]sir|.ffekt|impact)[:\s]*(y[üu]ks[əe]k|high|visok|orta|medium|sredni|a[sş]a[gğ][ıi]|low|nizki)\]/i);
    const level = impactMatch?.[2]?.toLowerCase() ?? '';
    const isHigh = /y[üu]ks[əe]k|high|visok/.test(level);
    const isMed  = /orta|medium|sredni/.test(level);
    // Aggressively remove ALL bracketed content including impact markers
    let text = ln.replace(/^\d+\.\s*/, '');
    text = text.replace(/\s*\[[^\]]+\]\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
    // Fallback: remove any remaining parenthesis/brace patterns too
    text = text.replace(/\s*\([^)]+\)\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
    return { text, isHigh, isMed, isLow: !isHigh && !isMed };
  };

  /* ─── Smart External Insights — Hero Banner ─── */
  function renderSmartInsights() {
    if (!correlatorData) return null;

    const condMeta: Record<string, { emoji: string; color: string; border: string; bg: string; glow: string }> = {
      rain:   { emoji: '🌧️', color: 'text-white/60', border: 'border-white/[0.08]', bg: 'rgba(255,255,255,0.02)', glow: 'transparent' },
      storm:  { emoji: '⛈️', color: 'text-white/60', border: 'border-white/[0.08]', bg: 'rgba(255,255,255,0.02)', glow: 'transparent' },
      snow:   { emoji: '❄️', color: 'text-white/60', border: 'border-white/[0.08]', bg: 'rgba(255,255,255,0.02)', glow: 'transparent' },
      windy:  { emoji: '💨', color: 'text-white/60', border: 'border-white/[0.08]', bg: 'rgba(255,255,255,0.02)', glow: 'transparent' },
      clear:  { emoji: '☀️', color: 'text-gold/70',  border: 'border-gold/[0.15]',  bg: 'rgba(212,175,55,0.03)', glow: 'rgba(212,175,55,0.08)' },
      cloudy: { emoji: '☁️', color: 'text-white/50', border: 'border-white/[0.06]', bg: 'rgba(255,255,255,0.015)', glow: 'transparent' },
    };

    // Bayram adına görə emoji seç
    function eventEmoji(name: string): string {
      const n = name.toLowerCase();
      if (/qələbə|victory|победа|9 may|may 9/.test(n)) return '🎖️';
      if (/respublika|republic|республика/.test(n)) return '🇦🇿';
      if (/novruz|nevruz/.test(n)) return '🌸';
      if (/müstəqillik|independence|независимост/.test(n)) return '🏛️';
      if (/qadın|women|женщин/.test(n)) return '🌹';
      if (/konstitusiya|constitution|конституц/.test(n)) return '📜';
      if (/qurtuluş|salvation|спасен/.test(n)) return '⚔️';
      if (/silahlı|armed|вооруж/.test(n)) return '🎗️';
      if (/dirçəliş|revival|возрожд/.test(n)) return '🕯️';
      if (/həmrəylik|solidarity|солидарн/.test(n)) return '🤝';
      if (/yeni il|new year|новый год/.test(n)) return '🎉';
      return '🏅';
    }

    // Days until
    function daysUntil(dateStr: string): number {
      const now = new Date();
      const target = new Date(dateStr + 'T00:00:00');
      return Math.ceil((target.getTime() - now.setHours(0,0,0,0)) / (1000 * 60 * 60 * 24));
    }

    // Today's weather — always show if available
    const todayWeather = correlatorData.weatherForecast?.[0];
    // Nearest upcoming events (up to 2), sorted by date
    const sortedEvents = [...(correlatorData.upcomingEvents || [])]
      .sort((a, b) => a.date.localeCompare(b.date))
      .filter(e => daysUntil(e.date) >= 0)
      .slice(0, 2);

    if (!todayWeather && sortedEvents.length === 0) return null;

    return (
      <div className="flex flex-col gap-2">
        {/* Weather Hero */}
        {todayWeather && (() => {
          const m = condMeta[todayWeather.condition] || condMeta.cloudy;
          return (
            <motion.div key="wx-hero" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
              className={`relative overflow-hidden rounded-2xl border ${m.border} p-3.5 flex items-center gap-4`}
              style={{ background: `radial-gradient(ellipse at 0% 50%, ${m.glow}, transparent 70%), ${m.bg}` }}>
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${m.color}`} style={{ background: m.bg }}>
                {todayWeather.condition === 'rain' ? <CloudRain size={16} /> : todayWeather.condition === 'storm' ? <CloudRain size={16} /> : todayWeather.condition === 'snow' ? <Thermometer size={16} /> : todayWeather.condition === 'clear' ? <Sun size={16} /> : todayWeather.condition === 'windy' ? <Wind size={16} /> : <Cloud size={16} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`text-[10px] font-black tracking-[0.3em] uppercase ${m.color}`}>
                    {todayWeather.dayName} · {todayWeather.tempMax}°/{todayWeather.tempMin}°
                  </span>
                  <span className="text-[9px] font-medium text-white/40 px-1.5 py-0.5 rounded-full border border-white/10 bg-white/[0.03]">{todayWeather.impact.revenueExpectation}</span>
                </div>
                <p className="text-[11px] text-white/65 leading-snug">{todayWeather.impact.recommendation}</p>
              </div>
            </motion.div>
          );
        })()}

        {/* Events — up to 2 cards side-by-side */}
        {sortedEvents.length > 0 && (
          <div className={`grid gap-2 ${sortedEvents.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {sortedEvents.map((ev, i) => {
              const days = daysUntil(ev.date);
              const emoji = eventEmoji(ev.name);
              const isHigh = ev.impact === 'high';
              const isMed  = ev.impact === 'medium';
              const isToday = days === 0;
              const isTomorrow = days === 1;

              const countdownLabel = isToday
                ? t('sensei_today')
                : isTomorrow
                  ? t('sensei_tomorrow')
                  : interpolateTemplate(t('sensei_days'), { n: String(days) });

              return (
                <motion.div
                  key={ev.date + i}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 + i * 0.06 }}
                  className="relative overflow-hidden rounded-2xl border border-white/[0.07] p-3.5 flex items-center gap-3 hover:border-gold/[0.18] transition-colors"
                  style={{ background: 'rgba(255,255,255,0.02)' }}
                >
                  {/* Countdown badge — top right */}
                  <div className="absolute top-2.5 right-3 text-[9px] font-semibold tracking-wide px-1.5 py-0.5 rounded-full border border-white/10 bg-white/[0.04] text-white/50">
                    {countdownLabel}
                  </div>

                  {/* Icon */}
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-white/50 bg-white/[0.04]">
                    {isHigh ? <Star size={15} /> : isMed ? <Flag size={15} /> : <CalendarDays size={15} />}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0 pr-10">
                    <p className="text-[12px] font-bold leading-tight mb-0.5 truncate text-white/70">{ev.name}</p>
                    <span className="text-[10px] font-medium tracking-wide text-white/35">
                      {ev.dayOfWeek} · {ev.date.slice(5).replace('-', '/')}
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  /* ─── Behavioral Inline — KPI strip ─── */
  function renderBehavioralInline() {
    if (!behavioralData) return null;
    const kpis = [
      { value: behavioralData.avgBasketSize, label: t('deep_scan_basket_size'), color: 'text-gold' },
      { value: behavioralData.coPurchasePairs.length, label: t('deep_scan_co_purchase'), color: 'text-white/70' },
      { value: behavioralData.soloProducts.length, label: t('deep_scan_solo_products'), color: 'text-white/70' },
    ];
    return (
      <div className="flex items-stretch gap-px rounded-2xl overflow-hidden border border-white/[0.06]">
        {kpis.map((k, i) => (
          <div key={i} className="flex-1 flex flex-col items-center justify-center gap-1 py-3 bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
            <span className={`text-xl font-black font-serif ${k.color}`}>{k.value}</span>
            <span className="text-[9px] uppercase tracking-[0.25em] text-white/30 text-center px-2">{k.label}</span>
          </div>
        ))}
        {behavioralData.insights[0] && (
          <div className="flex-[2] flex items-center gap-3 px-4 py-3 bg-white/[0.015] hover:bg-white/[0.03] transition-colors">
            <Lightbulb size={13} className="text-gold/50 flex-shrink-0" />
            <p className="text-[11px] text-white/55 leading-snug line-clamp-2">{behavioralData.insights[0].text}</p>
          </div>
        )}
      </div>
    );
  }

  /* ─── Simulator Expandable (Minimalist) ─── */
  function renderSimulatorExpandable() {
    return (
      <div>
        <button type="button" onClick={() => setSimExpanded(v => !v)}
          className="w-full flex items-center justify-between rounded-xl bg-white/[0.03] border border-white/[0.08] px-4 py-3 hover:bg-white/[0.06] hover:border-white/[0.14] transition-all">
          <div className="flex items-center gap-2">
            <Sliders size={13} className="text-gold/70" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-white/65">
              {t('deep_scan_simulator')}
            </span>
          </div>
          <ChevronDown size={14} className={`text-white/40 transition-transform duration-200 ${simExpanded ? 'rotate-180' : ''}`} />
        </button>
        <AnimatePresence initial={false}>
          {simExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              className="overflow-hidden mt-2">
              {renderSimulatorTab()}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  const renderAnalysis = () => {
    if (!aiAnalysis) return null;
    const parsed: Record<string, string[]> = { overview: [], risk: [], actions: [] };
    let active: keyof typeof parsed | null = null;
    aiAnalysis.split('\n').forEach(line => {
      const ln = line.trim();
      if (!ln) return;
      if (/\[(v.ziyy.t|состояние|overview)\]/i.test(ln)) { active = 'overview'; return; }
      if (/\[(risk|r.ski|risks)\]/i.test(ln)) { active = 'risk'; return; }
      if (/\[(addim|d.ystr|action|р.ком|t.vsiy.)\]/i.test(ln)) { active = 'actions'; return; }
      if (active) parsed[active].push(ln);
    });
    const actionLines = parsed.actions.filter(ln => /^\d+\./.test(ln));
    const overviewSnippet = parsed.overview.join(' ').replace(/\s+/g, ' ').trim().split(/[.!?]/)[0];

    // ── Weather + Event context tips ──────────────────────────────────────────
    type WeatherTip = { icon: string; title: string; tip: string; accent: string; border: string; bg: string };
    const weatherEventTips: WeatherTip[] = [];

    const todayWeather = correlatorData?.weatherForecast?.[0];
    if (todayWeather) {
      const cond = todayWeather.condition;
      const wIcon = cond === 'rain' || cond === 'storm' ? '🌧️' : cond === 'snow' ? '❄️' : cond === 'clear' ? '☀️' : cond === 'windy' ? '💨' : '☁️';
      const wTipMap: Record<string, { az: string; en: string; ru: string }> = {
        rain:   { az: 'Yağış günü — delivery kampaniyası başladın, çatdırılma endirim kodu göndərin.', en: 'Rainy day — launch a delivery promo, send discount codes for delivery.', ru: 'Дождь — запустите промо на доставку, отправьте скидочные коды.' },
        storm:  { az: 'Fırtına var — personala əvvəlcədən xəbər verin, menyu sadələşdirin.', en: 'Storm ahead — alert staff early, simplify menu for the day.', ru: 'Шторм — предупредите персонал, упростите меню на день.' },
        snow:   { az: 'Qar yağır — isti içkilər və çorba kateqoriyasını önə çıxarın.', en: 'Snow — promote hot drinks and soups, feature warm comfort foods.', ru: 'Снег — продвигайте горячие напитки и супы.' },
        clear:  { az: 'Günəşli gün — terrasa xüsusi diqqət, açıq hava seçeneklerini irəli çəkin.', en: 'Sunny — highlight terrace seating, promote outdoor menu options.', ru: 'Солнечно — выделите террасу, продвигайте блюда для улицы.' },
        windy:  { az: 'Küləkli hava — daxili otaq rezervasiyalarını stimullaşdırın.', en: 'Windy — encourage indoor reservations, promote cozy indoor experience.', ru: 'Ветрено — стимулируйте бронирование в зале.' },
        cloudy: { az: 'Buludlu gün — çorba ve isti yeməkləri menyu önünə çıxarın.', en: 'Overcast — feature warming dishes and soups prominently.', ru: 'Пасмурно — выделите горячие блюда и супы.' },
      };
      const wt = wTipMap[cond] || wTipMap.cloudy;
      const accent = cond === 'rain' || cond === 'storm' ? '#60a5fa' : cond === 'snow' ? '#67e8f9' : cond === 'clear' ? '#fbbf24' : cond === 'windy' ? '#fb923c' : '#94a3b8';
      weatherEventTips.push({
        icon: wIcon,
        title: `${todayWeather.dayName} · ${todayWeather.tempMax}°/${todayWeather.tempMin}°`,
        tip: language === 'az' ? wt.az : language === 'ru' ? wt.ru : wt.en,
        accent,
        border: `1px solid ${accent}22`,
        bg: `radial-gradient(ellipse at 0% 50%, ${accent}10, transparent 60%)`,
      });
    }

    const nearEvents = [...(correlatorData?.upcomingEvents || [])]
      .sort((a, b) => a.date.localeCompare(b.date))
      .filter(ev => {
        const now = new Date(); now.setHours(0,0,0,0);
        return Math.ceil((new Date(ev.date + 'T00:00:00').getTime() - now.getTime()) / 86400000) >= 0;
      })
      .slice(0, 2);

    nearEvents.forEach(ev => {
      const days = Math.ceil((new Date(ev.date + 'T00:00:00').getTime() - (() => { const n = new Date(); n.setHours(0,0,0,0); return n.getTime(); })()) / 86400000);
      const isHigh = ev.impact === 'high';
      const countTxt = days === 0
        ? t('sensei_today').replace('!', '')
        : days === 1
          ? t('sensei_tomorrow')
          : interpolateTemplate(t('sensei_days_later'), { n: String(days) });

      const evTips: { az: string; en: string; ru: string }[] = [
        { az: `${ev.name} — ${countTxt}. Xüsusi menyu, deko və ya bayram təklifi hazırlayın.`, en: `${ev.name} — ${countTxt}. Prepare a special menu, décor, or holiday offer.`, ru: `${ev.name} — ${countTxt}. Подготовьте специальное меню или праздничное предложение.` },
      ];
      const accent = isHigh ? '#f59e0b' : '#a78bfa';
      weatherEventTips.push({
        icon: days <= 1 ? '🎉' : '📅',
        title: `${ev.name} · ${ev.date.slice(5).replace('-', '/')}`,
        tip: language === 'az' ? evTips[0].az : language === 'ru' ? evTips[0].ru : evTips[0].en,
        accent,
        border: `1px solid ${accent}25`,
        bg: `radial-gradient(ellipse at 100% 50%, ${accent}0e, transparent 65%)`,
      });
    });

    // ── Peak hours ─────────────────────────────────────────────────────────────
    const peakHours = stats.peakHours ?? [];
    const topPeaks = [...peakHours].sort((a, b) => b.count - a.count).slice(0, 6);
    const maxCount = topPeaks[0]?.count || 1;

    return (
      <div className="flex flex-col gap-4">

        {/* ── Overview — always open ── */}
        {parsed.overview.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-white/[0.07] overflow-hidden"
            style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.025), rgba(255,255,255,0.01))' }}>
            <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/[0.04]">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
              <span className="text-[10px] font-black tracking-[0.3em] uppercase text-white/35">
                {t('sensei_overview')}
              </span>
            </div>
            <div className="px-5 py-4 space-y-2">
              {parsed.overview.map((ln, i) => <p key={i} className="text-[15px] text-white/75 leading-relaxed">{hl(ln)}</p>)}
            </div>
          </motion.div>
        )}

        {/* ── Risk — compact inline alert ── */}
        {parsed.risk.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }}
            className="relative rounded-2xl border border-red-500/20 overflow-hidden px-5 py-3.5"
            style={{ background: 'linear-gradient(135deg, rgba(239,68,68,0.06), rgba(239,68,68,0.02))' }}>
            <div className="absolute left-0 inset-y-0 w-[3px] bg-gradient-to-b from-red-500/60 to-red-500/10 rounded-r-full" />
            <div className="flex items-start gap-3">
              <AlertTriangle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <span className="text-[10px] font-black tracking-[0.3em] uppercase text-red-400/60 block mb-1.5">
                  {t('sensei_risk')}
                </span>
                <div className="space-y-1.5">
                  {parsed.risk.map((ln, i) => <p key={i} className="text-[14px] text-white/70 leading-snug">{hl(ln)}</p>)}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Weather + Event Contextual Tips — unified card ── */}
        {weatherEventTips.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.07 }}
            className="rounded-2xl border border-white/[0.06] overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.015)' }}>
            <div className="flex items-center gap-2 px-5 pt-4 pb-3 border-b border-white/[0.04]">
              <CalendarDays size={11} className="text-white/25" />
              <span className="text-[10px] font-black tracking-[0.3em] uppercase text-white/25">
                {t('sensei_tips_header')}
              </span>
            </div>
            <div className="divide-y divide-white/[0.04]">
              {weatherEventTips.map((tip, i) => (
                <div key={i} className="flex items-start gap-3.5 px-5 py-3.5">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${tip.accent}18` }}>
                  {tip.icon === '🌧️' ? <CloudRain size={14} style={{ color: tip.accent }} /> : tip.icon === '⛈️' ? <CloudRain size={14} style={{ color: tip.accent }} /> : tip.icon === '❄️' ? <Thermometer size={14} style={{ color: tip.accent }} /> : tip.icon === '☀️' ? <Sun size={14} style={{ color: tip.accent }} /> : tip.icon === '�' ? <Wind size={14} style={{ color: tip.accent }} /> : tip.icon === '🎉' ? <Star size={14} style={{ color: tip.accent }} /> : <CalendarDays size={14} style={{ color: tip.accent }} />}
                </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold text-white/40 mb-0.5 truncate">{tip.title}</p>
                    <p className="text-[13px] text-white/65 leading-snug">{tip.tip}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ── Action plan — numbered priority cards ── */}
        {actionLines.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <div className="flex items-center gap-2 mb-3">
              <Zap size={12} className="text-gold" />
              <span className="text-[10px] font-black tracking-[0.3em] uppercase text-gold/60">
                {t('sensei_action_plan')}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {actionLines.map((ln, i) => {
                const { text, isHigh, isMed } = parseAction(ln);
                const topProd = stats.productPerformance[i] ?? stats.productPerformance[0];
                return (
                  <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.12 + i * 0.06 }}
                    className="relative flex items-center gap-4 rounded-xl px-4 py-3 border border-white/[0.06] bg-white/[0.015]">
                    <span className="flex-shrink-0 w-6 h-6 rounded-lg text-[11px] font-bold flex items-center justify-center border border-white/10 bg-white/[0.04] text-white/45">{i + 1}</span>
                    <p className="flex-1 text-[14px] text-white/75 leading-snug">{hl(text)}</p>
                    {topProd && (
                      <button type="button" onClick={() => {
                        const params = new URLSearchParams({
                          ai_title: interpolateTemplate(t('sensei_campaign_title'), { name: topProd.name }),
                          ai_product: topProd.name,
                          ai_discount: isHigh ? '20' : isMed ? '15' : '10',
                        });
                        window.location.href = `/campaigns?${params.toString()}`;
                      }}
                        className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-[9px] font-semibold border border-white/10 bg-white/[0.04] text-white/40 hover:text-white/65 hover:bg-white/[0.07] transition-all">
                        <Zap size={9} />
                        {t('sensei_apply')}
                      </button>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}


      </div>
    );
  };

  /* ─── Floating Sensei Chat (rendered via portal) ─── */
  const renderFloatingChat = () => {
    if (typeof document === 'undefined') return null;
    if (isMobile) return null;
    const greetMsg = language === 'az'
      ? 'Salam! Mən Saito AI-yəm. Satışlar, sifarişlər, məhsullar — hər şey haqqında soruşa bilərsən.'
      : language === 'ru'
        ? 'Привет! Я Saito AI. Спрашивай всё о продажах, заказах и меню.'
        : 'Hi! I\'m Saito AI. Ask me anything about sales, orders, or your menu.';

    return createPortal(
      <>
        {/* Deep Scan laser overlay */}
        <AnimatePresence>
          {scanning && (
            <motion.div key="scan-overlay"
              className="fixed inset-0 z-[500] pointer-events-none overflow-hidden"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.35)' }} />
              <motion.div className="absolute left-0 right-0 h-[2px]"
                style={{
                  top: 0,
                  background: 'linear-gradient(90deg, transparent 0%, rgba(212,175,55,0.85) 20%, rgba(255,224,80,1) 50%, rgba(212,175,55,0.85) 80%, transparent 100%)',
                  boxShadow: '0 0 28px 8px rgba(212,175,55,0.55)',
                }}
                animate={(() => { const h = (typeof window !== 'undefined' ? window.innerHeight : 900) + 10; return { y: [-h, h, -h] }; })()}
                transition={{ duration: 2.0, ease: 'easeInOut', repeat: Infinity, repeatType: 'loop' }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {!chatOpen && (
            <motion.div
              key="chat-fab-wrapper"
              className="fixed bottom-8 right-8 z-[200] flex flex-col items-end gap-3"
              initial={{ opacity: 0, scale: 0.8, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 20 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}>

              {/* Bubble: welcome / predictive / hover */}
              <AnimatePresence mode="wait">
                {(predictiveBubble || tooltipShown || fabHovered) && (
                  <motion.div key={predictiveBubble ?? (fabHovered ? 'hover' : 'welcome')}
                    initial={{ opacity: 0, y: 8, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 4, scale: 0.95 }}
                    transition={{ duration: 0.22 }}
                    className="relative max-w-[210px] px-4 py-3 rounded-2xl rounded-br-sm"
                    style={{ background: 'rgba(10,10,10,0.96)', border: '1px solid rgba(212,175,55,0.18)', backdropFilter: 'blur(20px)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
                    <p className="text-[12px] text-white/80 leading-relaxed">
                      {predictiveBubble ?? (
                        fabHovered
                          ? <span className="text-gold/90 font-semibold">{language === 'az' ? 'Nə bilmək istəyirsən?' : language === 'ru' ? 'Что хочешь узнать?' : 'What do you want to know?'}</span>
                          : (language === 'az' ? 'Salam! Nə soruşmaq istəyirsən?' : language === 'ru' ? 'Привет! Чем могу помочь?' : 'Hi! What can I help with?')
                      )}
                    </p>
                    <span className="absolute -bottom-[7px] right-5 w-3.5 h-3.5 rotate-45"
                      style={{ background: 'rgba(10,10,10,0.96)', borderRight: '1px solid rgba(212,175,55,0.18)', borderBottom: '1px solid rgba(212,175,55,0.18)' }} />
                  </motion.div>
                )}
              </AnimatePresence>

            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {chatOpen && (
            <>
              <motion.div
                key="chat-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setChatOpen(false)}
                className="fixed inset-0 z-[198] bg-black/40 backdrop-blur-sm"
              />
              <motion.div
                key="chat-panel"
                initial={{ x: '100%', opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: '100%', opacity: 0 }}
                transition={{ type: 'spring', stiffness: 320, damping: 32 }}
                className="fixed right-0 top-0 bottom-0 z-[199] w-full sm:w-[420px] max-w-[95vw] sm:max-w-none flex flex-col"
                style={{ background: 'rgba(8,8,8,0.97)', backdropFilter: 'blur(24px)', borderLeft: '1px solid rgba(212,175,55,0.15)' }}>
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06] shrink-0">
                  <div className="flex items-center gap-3">
                    {/* Robot avatar */}
                    <div className="relative w-10 h-10 rounded-full bg-black border border-gold/30 flex items-center justify-center flex-shrink-0"
                      style={{ boxShadow: '0 0 14px rgba(212,175,55,0.22)' }}>
                      <svg width="22" height="22" viewBox="0 0 36 36" fill="none">
                        <line x1="18" y1="3" x2="18" y2="7" stroke="rgba(212,175,55,0.7)" strokeWidth="1.5" strokeLinecap="round"/>
                        <circle cx="18" cy="2.5" r="1.8" fill="#D4AF37"/>
                        <rect x="9" y="7" width="18" height="14" rx="4" fill="rgba(212,175,55,0.1)" stroke="rgba(212,175,55,0.6)" strokeWidth="1.2"/>
                        <circle cx="14" cy="14" r="2.2" fill="#D4AF37"/>
                        <circle cx="22" cy="14" r="2.2" fill="#D4AF37"/>
                        <path d="M14 19.5 Q18 22 22 19.5" stroke="rgba(212,175,55,0.8)" strokeWidth="1.2" strokeLinecap="round" fill="none"/>
                        <rect x="11" y="22" width="14" height="9" rx="3" fill="rgba(212,175,55,0.07)" stroke="rgba(212,175,55,0.35)" strokeWidth="1.1"/>
                        <circle cx="18" cy="26.5" r="1.5" fill="#D4AF37" opacity="0.7"/>
                      </svg>
                      <span className="absolute top-0 right-0 w-2 h-2 rounded-full bg-gold">
                        <span className="absolute inset-0 rounded-full bg-gold animate-ping opacity-60" />
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white/90">Saito AI</p>
                      <p className="text-[10px] text-gold/50 mt-0.5">
                        {language === 'az' ? 'onlayn • hazıram' : language === 'ru' ? 'онлайн • готов' : 'online • ready'}
                      </p>
                    </div>
                  </div>
                  <button onClick={() => setChatOpen(false)}
                    className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-white/40 hover:text-white/70 transition-all">
                    <XCircle size={15} />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
                  {chatMessages.length === 0 && (
                    <div className="flex flex-col gap-3 pt-2">
                      {/* Robot greeting bubbles */}
                      {[
                        language === 'az' ? 'Salam! 👋 Mən Saito AI-yəm.' : language === 'ru' ? 'Привет! 👋 Я Saito AI.' : 'Hi there! 👋 I\'m Saito AI.',
                        language === 'az' ? 'Satışlar, sifarişlər, məhsullar, kateqoriyalar — istədiklərin haqqında hər şeyi bilə bilərəm.' : language === 'ru' ? 'Я знаю всё о твоих продажах, заказах, товарах и категориях.' : 'I know all about your sales, orders, products and categories.',
                        language === 'az' ? 'Nə soruşmaq istəyirsən?' : language === 'ru' ? 'Чем могу помочь?' : 'What would you like to know?',
                      ].map((msg, i) => (
                        <motion.div key={i} className="flex justify-start"
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.35, duration: 0.3 }}>
                          <div className="flex items-end gap-2 max-w-[85%]">
                            {i === 0 && (
                              <div className="w-6 h-6 rounded-full bg-black border border-gold/25 flex items-center justify-center flex-shrink-0 mb-1"
                                style={{ boxShadow: '0 0 8px rgba(212,175,55,0.15)' }}>
                                <svg width="13" height="13" viewBox="0 0 36 36" fill="none">
                                  <rect x="9" y="7" width="18" height="14" rx="4" fill="rgba(212,175,55,0.1)" stroke="rgba(212,175,55,0.6)" strokeWidth="1.8"/>
                                  <circle cx="14" cy="14" r="2.4" fill="#D4AF37"/>
                                  <circle cx="22" cy="14" r="2.4" fill="#D4AF37"/>
                                  <path d="M14 19.5 Q18 22 22 19.5" stroke="rgba(212,175,55,0.8)" strokeWidth="1.4" strokeLinecap="round" fill="none"/>
                                </svg>
                              </div>
                            )}
                            {i !== 0 && <div className="w-6 flex-shrink-0" />}
                            <div className="px-4 py-2.5 rounded-2xl rounded-bl-sm text-[13px] text-white/75 leading-relaxed"
                              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(212,175,55,0.10)' }}>
                              {msg}
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                  {chatMessages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                        msg.role === 'user' ? 'bg-white/[0.07] border border-white/[0.12] text-white/85 rounded-br-sm' : 'bg-black border border-gold/[0.15] text-white/75 rounded-bl-sm'
                      }`}>
                        {msg.role === 'ai' && (
                          <div className="flex items-center gap-1.5 mb-2">
                            <BrainCircuit size={11} className="text-gold/60" />
                            <span className="text-[9px] text-gold/50 uppercase tracking-widest font-bold">Sensei</span>
                          </div>
                        )}
                        {msg.text}
                      </div>
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="flex justify-start">
                      <div className="bg-black border border-gold/[0.15] px-4 py-3 rounded-2xl rounded-bl-sm flex gap-1.5 items-center">
                        <span className="w-1.5 h-1.5 bg-gold/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 bg-gold/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 bg-gold/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  )}
                </div>
                <div className="px-5 py-4 border-t border-white/[0.06] shrink-0">
                  <div className="flex gap-2">
                    <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSend()}
                      placeholder={t('sensei_ask_placeholder')} autoFocus
                      className="flex-1 bg-white/[0.04] border border-white/[0.10] rounded-xl px-4 py-3 text-sm text-white/85 placeholder-white/25 outline-none focus:border-gold/30 transition-all" />
                    <button type="button" onClick={handleSend} disabled={!chatInput.trim() || chatLoading}
                      className="px-4 py-3 rounded-xl bg-gold/10 border border-gold/25 text-gold hover:bg-gold/15 disabled:opacity-30 transition-all">
                      <Send size={15} />
                    </button>
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </>,
      document.body
    );
  };

  const renderStaticAdvice = () => {
    if (!senseiStatsAdvice) return <p className="text-white/20 italic text-sm">{t('stats_analyzing')}</p>;
    const isCritical = senseiStatsAdvice.type === 'critical';
    const isGrowth   = senseiStatsAdvice.type === 'growth';
    const metric = isCritical
      ? { value: `${stats.aov.toFixed(0)}₼`, label: 'AOV' }
      : isGrowth
        ? { value: `${stats.totalRevenue.toLocaleString()}₼`, label: t('sensei_revenue_label') }
        : { value: stats.totalOrders.toString(), label: t('sensei_orders_label') };
    const textColor = isCritical ? 'text-white/80' : isGrowth ? 'text-gold' : 'text-white/80';
    const dimColor  = isCritical ? 'text-white/35' : isGrowth ? 'text-gold/50' : 'text-white/35';
    return (
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-6 rounded-2xl border border-white/[0.07] bg-white/[0.02] px-6 py-4">
        <div className="flex-shrink-0 text-center min-w-[64px]">
          <div className={`text-2xl font-bold font-serif ${textColor} leading-none`}>{metric.value}</div>
          <div className={`text-[9px] uppercase tracking-widest mt-1 ${dimColor}`}>{metric.label}</div>
        </div>
        <div className="w-px self-stretch border-l border-white/[0.07]" />
        <div className="flex-1 min-w-0">
          <p className={`text-[9px] font-bold uppercase tracking-[0.2em] mb-1.5 ${dimColor}`}>{senseiStatsAdvice.title}</p>
          <p className="text-sm text-white/60 leading-snug line-clamp-2">{senseiStatsAdvice.text}</p>
        </div>
      </motion.div>
    );
  };

  return (
    <>
    <div className="bg-card border border-white/[0.06] p-6 relative rounded-2xl">
      <HologramGrid />
      <div className="relative z-10 flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative">
              <motion.span className="absolute inset-0 rounded-xl blur-lg pointer-events-none"
                animate={{ backgroundColor: aiClosing ? 'rgba(212,175,55,0)' : aiLoading ? 'rgba(212,175,55,0.55)' : 'rgba(212,175,55,0.22)' }}
                transition={{ duration: aiClosing ? 0.3 : 0.6 }} />
              <motion.div className="relative p-2.5 bg-gold text-black rounded-xl z-10"
                animate={{
                  boxShadow: aiClosing ? '0 0 0px 0px rgba(212,175,55,0)' : logoFlash ? '0 0 48px 14px rgba(212,175,55,1)' : aiLoading ? '0 0 28px 6px rgba(212,175,55,0.7)' : '0 8px 24px rgba(212,175,55,0.35)',
                  scale: aiClosing ? 0.88 : logoFlash ? 1.18 : 1,
                  opacity: aiClosing ? 0.55 : 1,
                  filter: aiClosing ? 'grayscale(0.6) brightness(0.7)' : 'none',
                }}
                transition={{ duration: aiClosing ? 0.35 : logoFlash ? 0.15 : 0.5, ease: 'easeInOut' }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.75)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
                  <path d="M9 13a4.5 4.5 0 0 0 3-4" /><path d="M6.003 5.125A3 3 0 0 0 6.401 6.5" />
                  <path d="M3.477 10.896a4 4 0 0 1 .585-.396" /><path d="M6 18a4 4 0 0 1-1.967-.516" />
                  <path d="M12 13h4" /><path d="M12 18h6a2 2 0 0 1 2 2v1" /><path d="M12 8h8" />
                  <path d="M16 8V5a2 2 0 0 1 2-2" />
                  <circle cx="16" cy="13" r=".5" fill="rgba(0,0,0,0.75)" stroke="none" />
                  <circle cx="18" cy="3" r=".5" fill="rgba(0,0,0,0.75)" stroke="none" />
                  <circle cx="20" cy="21" r=".5" fill="rgba(0,0,0,0.75)" stroke="none" />
                  <circle cx="20" cy="8" r=".5" fill="rgba(0,0,0,0.75)" stroke="none" />
                  <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" stroke="white" strokeWidth={aiLoading ? 2.5 : 1.6} opacity={aiLoading ? 1 : 0.45} strokeDasharray={aiLoading ? '5 55' : '3 75'} strokeDashoffset="0" style={{ animation: `circuitSpark ${aiLoading ? '1.4s' : '4s'} linear infinite`, filter: aiLoading ? 'drop-shadow(0 0 3px #FFD700)' : 'none' }} />
                  <path d="M12 8h8M16 8V5a2 2 0 0 1 2-2M12 13h4M12 18h6a2 2 0 0 1 2 2v1" stroke="white" strokeWidth={aiLoading ? 2.2 : 1.4} opacity={aiLoading ? 0.95 : 0.35} strokeDasharray={aiLoading ? '3 25' : '2 40'} strokeDashoffset="0" style={{ animation: `circuitSpark ${aiLoading ? '1s' : '3s'} linear infinite reverse`, filter: aiLoading ? 'drop-shadow(0 0 2px #FFE566)' : 'none' }} />
                </svg>
              </motion.div>
              <AnimatePresence>
                {aiLoading && [
                  { x: -18, y: -16, d: 0 }, { x: 18, y: -18, d: 0.15 }, { x: 22, y: 10, d: 0.3 },
                  { x: -20, y: 12, d: 0.45 }, { x: 0, y: -22, d: 0.6 }, { x: 14, y: -8, d: 0.1 },
                ].map((p, i) => (
                  <motion.span key={i} className="absolute w-1 h-1 rounded-full bg-gold pointer-events-none z-30" style={{ left: '50%', top: '50%' }}
                    initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
                    animate={{ x: [0, p.x * 0.5, p.x, p.x * 0.6, 0], y: [0, p.y * 0.5, p.y, p.y * 1.2, 0], opacity: [0, 1, 0.8, 0.4, 0], scale: [0, 1.2, 1, 0.6, 0] }}
                    transition={{ duration: 1.8, repeat: Infinity, delay: p.d, ease: 'easeInOut' }} />
                ))}
              </AnimatePresence>
            </div>
            <div>
              <h3 className="text-xl font-serif font-bold text-gold">{t('stats_sensei_analysis')}</h3>
              {aiAnalysis && <p className="text-[10px] text-gold/40 uppercase tracking-widest mt-0.5">{t('stats_deep_scan_active')}</p>}
            </div>
          </div>
          <div className="relative">
            <AnimatePresence mode="wait">
              {scanning ? (
                <motion.div key="scanning-indicator"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="w-8 h-8 flex items-center justify-center">
                  <Sparkles size={16} className="text-gold" />
                </motion.div>
              ) : aiLoading ? (
                <motion.div key="loading-indicator"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gold/20 bg-gold/[0.06] text-gold/60 text-[10px] uppercase tracking-widest font-bold">
                  <Loader2 size={12} className="animate-spin" />
                </motion.div>
              ) : (
                <motion.button key="action-button" type="button"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  onClick={() => {
                    if (aiAnalysis) { onCloseAiAnalysis(); return; }
                    handleDeepScanClick();
                    setScanning(true);
                  }}
                  disabled={!aiAnalysis && stats.totalOrders === 0}
                  className="relative flex items-center gap-1.5 px-4 py-2 rounded-xl border border-gold/40 bg-gold/10 text-gold text-[10px] uppercase tracking-widest font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-[0_0_12px_rgba(212,175,55,0.15)]">
                  {aiAnalysis ? <XCircle size={12} /> : <Sparkles size={12} />}
                  {aiAnalysis ? t('close') : t('stats_deep_scan')}
                  {!aiAnalysis && <span className="absolute inset-0 rounded-xl ring-1 ring-gold/20 animate-ping opacity-30 pointer-events-none" />}
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Main content — Static advice or Deep Scan tabs */}
        <motion.div key={aiAnalysis ? 'open' : 'closed'}
          initial={{ opacity: 0, y: -10, scale: 0.98 }}
          animate={aiClosing ? { opacity: 0, scale: 0.97, y: 8 } : { opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>

          {aiLoading && !scanning ? (
            <div className="flex items-center gap-2 py-6 px-1">
              <span className="w-1 h-1 rounded-full bg-gold/40 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1 h-1 rounded-full bg-gold/40 animate-bounce" style={{ animationDelay: '120ms' }} />
              <span className="w-1 h-1 rounded-full bg-gold/40 animate-bounce" style={{ animationDelay: '240ms' }} />
            </div>
          ) : aiDisplayed ? (
            <div className="flex flex-col gap-4">
              {/* Critical Alerts — Weather / Holidays (prioritized at top) */}
              {renderSmartInsights()}

              {/* AI Analysis */}
              {renderAnalysis()}

              {/* Behavioral Insights */}
              {renderBehavioralInline()}

              {/* Expandable Simulator */}
              {renderSimulatorExpandable()}

            </div>
          ) : renderStaticAdvice()}
        </motion.div>
      </div>
      <BrainCircuit size={150} className="absolute -bottom-10 -right-10 text-gold/[0.03] rotate-12" />
    </div>
    {renderFloatingChat()}
    </>
  );


  /* ═══════════════════════════════════════════════════════════════
     DEEP SCAN TAB RENDERERS
     ═══════════════════════════════════════════════════════════════ */

  function renderDeepLoading() {
    return (
      <div className="flex items-center justify-center gap-2 py-10">
        <Loader2 size={14} className="animate-spin text-gold/40" />
        <span className="text-[10px] text-white/30 uppercase tracking-widest">{t('deep_scan_loading')}</span>
      </div>
    );
  }

  function renderDeepEmpty() {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12">
        <BarChart3 size={24} className="text-white/15" />
        <p className="text-xs text-white/25">{t('deep_scan_no_data')}</p>
      </div>
    );
  }

  /* ─── Simulator Tab ─── */
  function renderSimulatorTab() {
    return (
      <div className="flex flex-col gap-5">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl bg-white/[0.02] border border-white/[0.06] p-5">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[160px]">
              <label className="text-[10px] text-white/30 uppercase tracking-widest mb-1.5 block">
                {t('stats_col_product')}
              </label>
              <GoldSelect
                value={simProduct}
                options={[{ value: '', label: '—' }, ...stats.productPerformance.map(p => ({ value: p.name, label: p.name }))]}
                onChange={(v) => { setSimProduct(v); setSimResult(null); }}
                placeholder="—"
              />
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="text-[10px] text-white/30 uppercase tracking-widest mb-1.5 block">
                {interpolateTemplate(t('sensei_cross_sell_price'), { price: `${simPriceChange > 0 ? '+' : ''}${simPriceChange}%` })}
              </label>
              <input type="range" min={-30} max={30} step={5} value={simPriceChange}
                onChange={e => { setSimPriceChange(Number(e.target.value)); setSimResult(null); }}
                className="w-full accent-gold" />
            </div>
            <button type="button" onClick={fetchSimulation} disabled={!simProduct || simPriceChange === 0 || simLoading}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-gold/10 border border-gold/25 text-gold text-xs font-bold disabled:opacity-30 transition-all"
              style={{ boxShadow: '0 0 12px rgba(212,175,55,0.15)' }}>
              {simLoading ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              {t('deep_scan_run_simulation')}
            </button>
          </div>
        </motion.div>

        {/* Simulation Result with Matrix Effect */}
        <AnimatePresence>
          {simResultTyped && (
            <motion.div initial={{ opacity: 0, scaleY: 0.8 }} animate={{ opacity: 1, scaleY: 1 }} exit={{ opacity: 0, scaleY: 0.8 }}
              className="relative rounded-2xl overflow-hidden" style={{ transformOrigin: 'top' }}>
              <MatrixRain />
              <div className="relative z-10 p-6 border border-gold/20 rounded-2xl"
                style={{ background: 'linear-gradient(135deg, rgba(212,175,55,0.06), rgba(0,0,0,0.8))' }}>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-2 h-2 rounded-full bg-gold" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold/70 font-mono">
                    {t('deep_scan_run_simulation')}
                  </span>
                </div>
                <p className="text-sm text-white/80 leading-relaxed font-mono">
                  {simResultTyped}
                  <motion.span animate={{ opacity: [1, 0] }} transition={{ duration: 0.5, repeat: Infinity }} className="text-gold">▊</motion.span>
                </p>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-5">
                  <div className="rounded-xl bg-red-500/[0.06] border border-red-500/15 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingDown size={12} className="text-red-400" />
                      <span className="text-[9px] font-bold uppercase tracking-widest text-red-300/70">{t('deep_scan_retention_risk')}</span>
                    </div>
                    <p className="text-[11px] text-white/55">
                      {simPriceChange > 0
                        ? interpolateTemplate(language === 'az' ? `Qiymət {pct}% artırıldıqda, müştərilərin ~{risk}%-i rəqibə keçə bilər.` : language === 'ru' ? `При повышении на {pct}%, ~{risk}% клиентов могут уйти к конкурентам.` : `A {pct}% increase may cause ~{risk}% of customers to switch to competitors.`, { pct: String(simPriceChange), risk: String(Math.round(simPriceChange * 1.5)) })
                        : interpolateTemplate(language === 'az' ? `Qiymət {pct}% azaldıldıqda, müştəri sadiqliyi artacaq, amma marja azalacaq.` : language === 'ru' ? `Снижение на {pct}% повысит лояльность, но снизит маржу.` : `A {pct}% decrease may boost loyalty but reduce margins.`, { pct: String(Math.abs(simPriceChange)) })}
                    </p>
                  </div>
                  <div className="rounded-xl bg-white/[0.03] border border-white/[0.07] p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Users size={12} className="text-white/40" />
                      <span className="text-[9px] font-bold uppercase tracking-widest text-white/40">{t('deep_scan_competitor_note')}</span>
                    </div>
                    <p className="text-[11px] text-white/45 italic">
                      {language === 'az' ? 'Rəqib datası mövcud deyil — daxili dataya əsasən elastiklik hesablanıb.' : language === 'ru' ? 'Данные конкурентов недоступны — эластичность рассчитана по внутренним данным.' : 'Competitor data unavailable — elasticity calculated from internal data.'}
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ─── Cross-sell Simulator ─── */}
        <div className="border-t border-white/[0.06] pt-5">
          <div className="flex items-center gap-2 mb-4">
            <ShoppingBag size={13} className="text-emerald-400" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-300/70">
              {t('sensei_cross_sell_title')}
            </span>
          </div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl bg-white/[0.02] border border-white/[0.06] p-5">
            <div className="flex flex-wrap gap-4 items-end">
              <div className="flex-1 min-w-[160px]">
                <label className="text-[10px] text-white/30 uppercase tracking-widest mb-1.5 block">
                  {t('sensei_cross_sell_base')}
                </label>
                <GoldSelect
                  value={crossBase}
                  options={[{ value: '', label: '—' }, ...stats.productPerformance.map(p => ({ value: p.name, label: `${p.name} (${p.sold} sold)` }))]}
                  onChange={(v) => { setCrossBase(v); setCrossResult(null); }}
                  placeholder="—"
                />
              </div>
              <div className="flex-1 min-w-[120px]">
                <label className="text-[10px] text-white/30 uppercase tracking-widest mb-1.5 block">
                  {t('sensei_cross_sell_addon')}
                </label>
                <input type="text" value={crossAddon} onChange={e => { setCrossAddon(e.target.value); setCrossResult(null); }}
                  placeholder={t('sensei_cross_sell_addon_ph')}
                  className="w-full bg-transparent border-b border-white/10 text-sm text-white/80 py-2 outline-none placeholder-white/20" />
              </div>
              <div className="flex-1 min-w-[100px]">
                <label className="text-[10px] text-white/30 uppercase tracking-widest mb-1.5 block">
                  {interpolateTemplate(t('sensei_cross_sell_price'), { price: String(crossPrice) })}
                </label>
                <input type="range" min={0.5} max={10} step={0.5} value={crossPrice}
                  onChange={e => { setCrossPrice(Number(e.target.value)); setCrossResult(null); }}
                  className="w-full accent-emerald-400" />
              </div>
              <div className="flex-1 min-w-[100px]">
                <label className="text-[10px] text-white/30 uppercase tracking-widest mb-1.5 block">
                  {interpolateTemplate(t('sensei_cross_sell_rate'), { rate: String(crossRate) })}
                </label>
                <input type="range" min={5} max={80} step={5} value={crossRate}
                  onChange={e => { setCrossRate(Number(e.target.value)); setCrossResult(null); }}
                  className="w-full accent-emerald-400" />
              </div>
              <button type="button"
                onClick={() => {
                  const base = stats.productPerformance.find((p: any) => p.name === crossBase);
                  if (!base || !crossAddon) return;
                  const monthlySold = base.sold * 4; // rough monthly projection from period data
                  const projected = Math.round(monthlySold * (crossRate / 100) * crossPrice);
                  const perOrder = (crossRate / 100) * crossPrice;
                  setCrossResult(interpolateTemplate(t('sensei_cross_sell_result'), {
                    base: crossBase, addon: crossAddon,
                    price: String(crossPrice), rate: String(crossRate),
                    projected: projected.toLocaleString(), perOrder: perOrder.toFixed(2),
                  }));
                }}
                disabled={!crossBase || !crossAddon}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-xs font-bold hover:bg-emerald-500/20 disabled:opacity-30 transition-all">
                <ShoppingBag size={13} />
                {t('sensei_cross_sell_calc')}
              </button>
            </div>
          </motion.div>

          <AnimatePresence>
            {crossResult && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                className="mt-4 rounded-2xl bg-emerald-500/[0.06] border border-emerald-500/20 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Sprout size={14} className="text-emerald-400" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-300/70">
                    {t('sensei_cross_sell_result_title')}
                  </span>
                </div>
                <p className="text-sm text-white/80 leading-relaxed">{crossResult}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    );
  }
}
