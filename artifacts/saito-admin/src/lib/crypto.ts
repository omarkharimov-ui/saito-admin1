import crypto from 'crypto';

export function hashPin(pin: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const iterations = 260000;
  const hash = crypto.pbkdf2Sync(pin, salt, iterations, 64, 'sha256').toString('hex');
  return `pbkdf2_sha256$${iterations}$${salt}$${hash}`;
}

export function verifyPin(pin: string, hash: string): boolean {
  if (!hash || !hash.startsWith('pbkdf2_sha256$')) return false;
  const parts = hash.split('$');
  if (parts.length !== 4) return false;
  const iterations = parseInt(parts[1], 10);
  const salt = parts[2];
  const expectedHash = parts[3];
  const inputHash = crypto.pbkdf2Sync(pin, salt, iterations, 64, 'sha256').toString('hex');
  return inputHash === expectedHash;
}
