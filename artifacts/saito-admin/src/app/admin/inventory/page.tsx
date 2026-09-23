'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
export default function InventoryRedirect() { const r = useRouter(); useEffect(() => { r.replace('/admin/stock'); }, []); return null; }
