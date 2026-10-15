// Read a required environment variable, failing loudly if it is missing so a
// misconfigured deploy errors at the first use instead of misbehaving quietly.
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Set it in .env.local (local) or Vercel Project Settings (deployed).`,
    );
  }
  return value;
}
