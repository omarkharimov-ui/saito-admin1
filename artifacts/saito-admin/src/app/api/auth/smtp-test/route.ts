import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(req: NextRequest) {
  const adminClient = getAdminClient();
  if (!adminClient) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }
  
  try {
    const { toEmail } = await req.json();
    
    if (!toEmail) {
      return NextResponse.json({ error: 'Recipient email required' }, { status: 400 });
    }
    
    // Fetch SMTP settings
    const { data: settings, error: settingsError } = await adminClient
      .from('settings')
      .select('smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from_name')
      .maybeSingle();
    
    if (settingsError || !settings?.smtp_host || !settings?.smtp_user || !settings?.smtp_pass) {
      return NextResponse.json({ error: 'SMTP settings not configured' }, { status: 400 });
    }
    
    // Create transporter
    const transporter = nodemailer.createTransport({
      host: settings.smtp_host,
      port: settings.smtp_port || 587,
      secure: (settings.smtp_port || 587) === 465,
      auth: {
        user: settings.smtp_user,
        pass: settings.smtp_pass,
      },
    });
    
    // Send test email
    await transporter.sendMail({
      from: `"${settings.smtp_from_name || 'Saito Admin'}" <${settings.smtp_user}>`,
      to: toEmail,
      subject: 'SMTP Test - Saito Admin',
      text: 'This is a test email from Saito Admin panel. Your SMTP settings are working correctly!',
      html: `<div style="font-family: sans-serif; padding: 20px;">
        <h2 style="color: #D4AF37;">SMTP Test Email</h2>
        <p>This is a test email from <strong>Saito Admin</strong> panel.</p>
        <p style="padding: 12px; background: #f0f0f0; border-radius: 6px;">
          Your SMTP settings are working correctly!
        </p>
      </div>`,
    });
    
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to send test email' }, { status: 500 });
  }
}
