import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [target, ...input] = process.argv.slice(2);
if (!['--local', '--remote'].includes(target) || input.length === 0)
  throw new Error('Usage: node scripts/grant-plus.ts --local|--remote email [email ...]');
const emails = [...new Set(input.map((email) => email.trim().toLowerCase()))];
if (emails.some((email) => email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))
  throw new Error('Invalid email');
const quote = (email: string) => `'${email.replaceAll("'", "''")}'`;
const dir = mkdtempSync(join(tmpdir(), 'ludus-plus-'));
const now = Date.now();
const sql = emails
  .map(
    (email) => `
INSERT INTO complimentary_plus(email,granted_at,revoked_at)
SELECT ${quote(email)},${now},NULL WHERE NOT EXISTS(SELECT 1 FROM user u JOIN account_deletions d ON d.user_id=u.id WHERE lower(u.email)=${quote(email)})
ON CONFLICT(email) DO UPDATE SET revoked_at=NULL;
INSERT INTO invitations(email,expires_at)
SELECT ${quote(email)},${now + 7 * 86400_000} WHERE EXISTS(SELECT 1 FROM complimentary_plus WHERE email=${quote(email)} AND revoked_at IS NULL)
ON CONFLICT(email) DO UPDATE SET expires_at=CASE WHEN invitations.redeemed_by IS NULL THEN MAX(COALESCE(invitations.expires_at,0),excluded.expires_at) ELSE invitations.expires_at END;`,
  )
  .join('\n');
const env = {
  ...process.env,
  WRANGLER_LOG_PATH: process.env.WRANGLER_LOG_PATH ?? '/tmp/ludus-plus-wrangler.log',
};
const run = (args: string[]) =>
  execFileSync(
    process.execPath,
    ['node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', 'ludus', target, ...args],
    { env, encoding: 'utf8' },
  );
try {
  const file = join(dir, 'grants.sql');
  writeFileSync(file, sql, { mode: 0o600 });
  run(['--file', file, '--json']);
  const result = JSON.parse(
    run([
      '--command',
      `SELECT COUNT(*) AS total FROM complimentary_plus WHERE revoked_at IS NULL AND email IN (${emails.map(quote).join(',')})`,
      '--json',
    ]),
  ) as { results: { total: number }[] }[];
  if (result[0]?.results[0]?.total !== emails.length)
    throw new Error('Some grants were not applied; check pending deletions');
  console.log(
    `${emails.length} complimentary Plus grants verified in ${target === '--remote' ? 'production' : 'local D1'}. No expiry, subscriptions or charges. Email verification and onboarding remain required.`,
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}
