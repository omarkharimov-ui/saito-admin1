import { NextResponse } from 'next/server';
import { groqChat, parseJsonFromText } from '@/lib/groq';

export async function POST(request: Request) {
  try {
    const { items } = await request.json();

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ minutes: 30 }); // Default
    }

    const itemNames = items.map(i => `${i.quantity}x ${i.product_name}`).join(', ');
    
    const systemPrompt = `Sən restoran mətbəx köməkçisisən. Verilən yemək siyahısına əsasən, bu yeməklərin hamısının eyni vaxtda qonağın masasına hazır olması üçün mətbəxin nə qədər vaxt (dəqiqə ilə) qabaqcadan hazırlığa başlamalı olduğunu təxmin et. 
    Yalnız JSON formatında cavab ver: {"minutes": number, "reason": "qısa izah"}`;

    const userPrompt = `Sifariş siyahısı: ${itemNames}. Bu sifariş üçün hazırlıq vaxtı nə qədər olmalıdır?`;

    const aiResponse = await groqChat(systemPrompt, userPrompt);
    const result = parseJsonFromText<{ minutes: number; reason: string }>(aiResponse);

    return NextResponse.json({
      minutes: result?.minutes || 30,
      reason: result?.reason || 'Standart hazırlıq vaxtı'
    });
  } catch (error: any) {
    return NextResponse.json({ minutes: 30, error: error.message });
  }
}
