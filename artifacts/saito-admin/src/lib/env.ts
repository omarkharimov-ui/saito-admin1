export function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    throw new Error(`Missing environment variable: ${name}. Please add it to .env.local`);
  }
  return val;
}

export function getEnv(name: string, fallback: string): string {
  return process.env[name] || fallback;
}
