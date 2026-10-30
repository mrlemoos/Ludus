import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const vars = existsSync('.dev.vars') ? readFileSync('.dev.vars', 'utf8') : '';
if (!/^LOCAL_DEV=/m.test(vars)) writeFileSync('.dev.vars', `${vars}\nLOCAL_DEV="true"\n`);
const configured = readFileSync('.dev.vars', 'utf8');
if (!/^BETTER_AUTH_SECRET=/m.test(configured)) writeFileSync('.dev.vars', `${configured}BETTER_AUTH_SECRET="${randomBytes(32).toString('hex')}"\n`);
execFileSync('pnpm', ['db:migrate'], { stdio: 'inherit' });
execFileSync('pnpm', ['exec', 'wrangler', 'd1', 'execute', 'ludus', '--local', '--command',
  "INSERT INTO invitations(email) VALUES ('leo.lemos.ds@icloud.com') ON CONFLICT DO NOTHING; INSERT INTO user(id,name,email,email_verified,created_at,updated_at) VALUES ('local-leo','Leo','leo.lemos.ds@icloud.com',0,unixepoch()*1000,unixepoch()*1000) ON CONFLICT(email) DO NOTHING;"], { stdio: 'inherit' });
console.log('Leo seeded locally. Open /play and choose Sign in as dev. Local sign-in is disabled on deployed hosts.');
