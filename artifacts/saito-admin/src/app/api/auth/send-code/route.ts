import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(req: NextRequest) {
  const adminClient = getAdminClient();
  if (!adminClient) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  try {
    const { email } = await req.json();

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
    }

    const { data: existingUsers } = await adminClient.auth.admin.listUsers();
    if (existingUsers.users.some(u => u.email === email)) {
      return NextResponse.json({ error: 'User with this email already exists' }, { status: 400 });
    }

    const code = generateCode();
    const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    // Store in DB (shared across all server instances)
    await adminClient.from('verification_codes').upsert(
      { email, code, expires },
      { onConflict: 'email' }
    );

    const { data: settings } = await adminClient
      .from('settings')
      .select('smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from_name')
      .maybeSingle();

    if (!settings?.smtp_host || !settings?.smtp_user || !settings?.smtp_pass) {
      if (process.env.NODE_ENV === 'development') {
        return NextResponse.json({ success: true, code });
      }
      return NextResponse.json({ error: 'SMTP not configured' }, { status: 500 });
    }

    const transporter = nodemailer.createTransport({
      host: settings.smtp_host,
      port: settings.smtp_port || 587,
      secure: (settings.smtp_port || 587) === 465,
      auth: {
        user: settings.smtp_user,
        pass: settings.smtp_pass,
      },
    });

    await transporter.sendMail({
      from: `"${settings.smtp_from_name || 'Saito Admin'}" <${settings.smtp_user}>`,
      to: email,
      subject: 'Verification Code - Saito Admin',
      text: `Your verification code is: ${code}\n\nThis code will expire in 10 minutes.`,
      html: `<div style="font-family: sans-serif; padding: 20px; max-width: 400px;">
        <h2 style="color: #D4AF37;">Verification Code</h2>
        <p>Use the following code to complete your registration:</p>
        <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; padding: 20px; background: #f5f5f5; border-radius: 8px; text-align: center; margin: 16px 0;">
          ${code}
        </div>
        <p style="color: #666; font-size: 12px;">This code will expire in 10 minutes.</p>
      </div>`,
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to send code' }, { status: 500 });
  }
}
