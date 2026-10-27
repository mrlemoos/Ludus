import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { magicLink } from 'better-auth/plugins/magic-link';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import * as schema from './schema';

export function localDevelopment(request: Request, env: Env) {
  return env.LOCAL_DEV === 'true' && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(request.url).hostname);
}
export function authFor(request: Request, env: Env, capture?: (url: string) => void) {
  const local = localDevelopment(request, env);
  const secret = env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error('Authentication is not configured');
  const db = drizzle(env.DB, { schema });
  return betterAuth({
    secret, rateLimit: { enabled: !local }, baseURL: new URL(request.url).origin,
    database: drizzleAdapter(db, { provider: 'sqlite', schema, transaction: false }),
    databaseHooks: { user: { create: { before: async (user) => {
      const invited = await db.select().from(schema.invitations).where(eq(schema.invitations.email, user.email.toLowerCase())).get();
      return invited ? { data: user } : false;
    } } } },
    plugins: [magicLink({ storeToken: 'hashed', expiresIn: 600, sendMagicLink: async ({ email, url }) => {
      const invited = await db.select().from(schema.invitations).where(eq(schema.invitations.email, email.toLowerCase())).get();
      if (!invited) return;
      if (local && capture) { capture(url); return; }
      if (!env.RESEND_API_KEY || !env.AUTH_EMAIL_FROM) throw new Error('Email delivery is not configured');
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: env.AUTH_EMAIL_FROM, to: email, subject: 'Sign in to Ludus', text: `Sign in to Ludus: ${url}\nThis link expires in 10 minutes. If you did not request it, ignore this email.` }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error('Email delivery failed');
    } })],
  });
}
