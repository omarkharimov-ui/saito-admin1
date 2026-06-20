import { createClient } from '@supabase/supabase-js';

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export interface TransactionStep {
  name: string;
  execute: () => Promise<any>;
  rollback: () => Promise<void>;
}

export async function withTransaction(steps: TransactionStep[]): Promise<{ success: true; results: any[] }> {
  const supabase = svc();
  const results: any[] = [];
  const auditEntries: any[] = [];

  for (const step of steps) {
    let result: any;
    try {
      result = await step.execute();
      results.push(result);

      auditEntries.push({
        operation: step.name,
        status: 'completed',
        snapshot: JSON.stringify(result),
        created_at: new Date().toISOString(),
      });
    } catch (err: any) {
      auditEntries.push({
        operation: step.name,
        status: 'failed',
        error: err.message,
        created_at: new Date().toISOString(),
      });

      try { await supabase.from('transaction_logs').insert(auditEntries); } catch {}

      for (let i = steps.length - 1; i >= 0; i--) {
        try {
          await steps[i].rollback();
          try { await supabase.from('transaction_logs').insert({ operation: `rollback:${steps[i].name}`, status: 'rolled_back', created_at: new Date().toISOString() }); } catch {}
        } catch (rbErr: any) {
          console.error(`Rollback failed for step ${steps[i].name}:`, rbErr);
        }
      }

      throw err;
    }
  }

  try { await supabase.from('transaction_logs').insert(auditEntries); } catch {}

  return { success: true, results };
}

export async function createTransactionLog(
  operation: string,
  status: string,
  details?: string
): Promise<void> {
  const supabase = svc();
  try {
    await supabase.from('transaction_logs').insert({
      operation,
      status,
      details: details || null,
      created_at: new Date().toISOString(),
    });
  } catch {}
}
