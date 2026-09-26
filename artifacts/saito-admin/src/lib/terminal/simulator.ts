/**
 * 2026-09-26 (owner, Q7): card terminal adapter layer.
 *
 * Owner state: "elimdə fiziki terminal yoxdur, hazır edə bilirsəns et" →
 *   today  = SIMULATOR (virtual handheld): full card flow in POS works
 *            end-to-end (tap → process → approve/decline → auth code →
 *            ledger reference), zero hardware.
 *   later  = real PSP adapter (Harbon / SkyPay / Qiwi / Stripe Terminal):
 *            same interface, provider + API key in Terminals tab → M wave.
 *
 * The simulator is deliberately realistic: ~2.2s processing, 92% approval,
 * 8% decline (operator retries / switches tender), auth code SIM-XXXXXX.
 */

export interface TerminalPayResult {
  ok: boolean;
  code: string;          // authorization code (ledger reference)
  declinedReason?: string;
  ms: number;
  provider: string;
}

export interface TerminalProvider {
  id: string;
  name: string;
  ready: boolean;        // ready=false → "adapter gözləyir" (M wave on owner decision)
  hint?: string;
}

export const TERMINAL_PROVIDERS: TerminalProvider[] = [
  { id: 'simulator', name: 'Simulator (virtual terminal)', ready: true, hint: 'Fiziki terminal qədər full card flow' },
  { id: 'harbon', name: 'Harbon', ready: false, hint: 'AZ — API key + merchant ID tələb olunur' },
  { id: 'skypay', name: 'SkyPay', ready: false, hint: 'AZ/CA — API key tələb olunur' },
  { id: 'qiwi', name: 'Qiwi (PosNet)', ready: false, hint: 'AZ — terminal ID + secret tələb olunur' },
  { id: 'stripe', name: 'Stripe Terminal', ready: false, hint: 'International — reader pairing' },
];

export const ACTIVE_TERMINAL = 'simulator'; // physical terminal varılanda → adapter wave

/** Simulate a handheld terminal tap. Resolves after the processing delay. */
export function terminalPay(amount: number): Promise<TerminalPayResult> {
  const start = Date.now();
  return new Promise(resolve => {
    const delay = 1800 + Math.random() * 900;
    setTimeout(() => {
      const ms = Date.now() - start;
      const declined = Math.random() < 0.08;
      resolve({
        ok: !declined,
        code: `SIM-${String(Math.floor(100000 + Math.random() * 900000))}`,
        declinedReason: declined ? 'Kart rədd etdi (insufficient funds / declined)' : undefined,
        ms,
        provider: ACTIVE_TERMINAL,
      });
    }, delay);
  });
}
