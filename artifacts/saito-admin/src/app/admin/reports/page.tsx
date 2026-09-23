'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
export default function ReportsRedirect() { const r = useRouter(); useEffect(() => { r.replace('/admin/stats'); }, []); return null; }
