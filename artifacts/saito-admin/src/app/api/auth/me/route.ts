import { NextResponse } from 'next/server';
import { validateAuth } from '@/lib/api-auth';

export async function GET() {
  try {
    const auth = await validateAuth();
    
    if (!auth.authenticated) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    return NextResponse.json({
      id: auth.user?.id,
      email: auth.user?.email,
      role: auth.role,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
