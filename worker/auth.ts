import { invitationEligible } from '../shared/profile';
import { hasComplimentaryInvitation } from './complimentary-plus';
import * as schema from './schema';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { betterAuth } from 'better-auth/minimal';
import { magicLink } from 'better-auth/plugins/magic-link';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';

export function localDevelopment(request: Request, env: Env) {
  return (
    env.LOCAL_DEV === 'true' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(new URL(request.url).hostname)
  );
}
export async function admitSession(db: D1Database, userId: string, now: number): Promise<boolean> {
  const admitted = await db
    .prepare(`UPDATE invitations SET redeemed_by=?,redeemed_at=COALESCE(redeemed_at,?)
    WHERE email=(SELECT lower(email) FROM user WHERE id=? AND email_verified=1 AND NOT EXISTS (SELECT 1 FROM account_deletions WHERE user_id=?))
    AND (redeemed_by=? OR (redeemed_by IS NULL AND (expires_at>? OR EXISTS(SELECT 1 FROM complimentary_plus WHERE complimentary_plus.email=invitations.email AND revoked_at IS NULL)))) RETURNING email`)
    .bind(userId, now, userId, userId, userId, now)
    .first();
  return !!admitted;
}
export function authFor(request: Request, env: Env, capture?: (url: string) => void) {
  const local = localDevelopment(request, env);
  const secret = env.BETTER_AUTH_SECRET;
  if (!secret) {throw new Error('Authentication is not configured');}
  const db = drizzle(env.DB, { schema });
  async function eligible(email: string, id: string | null) {
    if (
      id &&
      (await env.DB.prepare('SELECT user_id FROM account_deletions WHERE user_id = ?')
        .bind(id)
        .first())
    )
      {return false;}
    const invited = await db
      .select()
      .from(schema.invitations)
      .where(eq(schema.invitations.email, email.toLowerCase()))
      .get();
    return (
      invitationEligible(invited ?? null, id, Date.now()) ||
      (!!invited &&
        (invited.redeemedBy === null || invited.redeemedBy === id) &&
        (await hasComplimentaryInvitation(env.DB, email)))
    );
  }
  return betterAuth({
    secret,
    rateLimit: { enabled: !local },
    baseURL: new URL(request.url).origin,
    database: drizzleAdapter(db, { provider: 'sqlite', schema, transaction: false }),
    databaseHooks: {
      user: {
        create: {
          before: async (user) => 
            (await eligible(user.email, null)) ? { data: user } : false
          ,
        },
      },
      session: {
        create: {
          before: async (session) => {
            const admitted = await admitSession(env.DB, session.userId, Date.now());
            return admitted ? { data: session } : false;
          },
          after: async (session) => {
            if (
              await env.DB.prepare('SELECT user_id FROM account_deletions WHERE user_id=?')
                .bind(session.userId)
                .first()
            ) {
              await db.delete(schema.session).where(eq(schema.session.id, session.id));
            }
          },
        },
      },
    },
    plugins: [
      magicLink({
        storeToken: 'hashed',
        expiresIn: 600,
        sendMagicLink: async ({ email, url }) => {
          const user = await db
            .select()
            .from(schema.user)
            .where(eq(schema.user.email, email.toLowerCase()))
            .get();
          if (!(await eligible(email, user?.id ?? null))) {return;}
          if (local && capture) {
            capture(url);
            return;
          }
          if (!env.RESEND_API_KEY || !env.AUTH_EMAIL_FROM)
            {throw new Error('Email delivery is not configured');}
          const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${env.RESEND_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: env.AUTH_EMAIL_FROM,
              to: email,
              subject: 'Sign in to Ludus',
              text: `Sign in to Ludus: ${url}\nThis link expires in 10 minutes. If you did not request it, ignore this email.`,
            }),
            signal: AbortSignal.timeout(10_000),
          });
          if (!response.ok) {throw new Error('Email delivery failed');}
        },
      }),
    ],
  });
}
