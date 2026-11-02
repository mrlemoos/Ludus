import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const vars = existsSync('.dev.vars') ? readFileSync('.dev.vars', 'utf8') : '';
if (!/^LOCAL_DEV=/m.test(vars)) {writeFileSync('.dev.vars', `${vars}\nLOCAL_DEV="true"\n`);}
if (!/^OPERATOR_IDS=/m.test(readFileSync('.dev.vars', 'utf8')))
  {writeFileSync('.dev.vars', `${readFileSync('.dev.vars', 'utf8')}OPERATOR_IDS="local-leo"\n`);}
const configured = readFileSync('.dev.vars', 'utf8');
if (!/^BETTER_AUTH_SECRET=/m.test(configured))
  {writeFileSync(
    '.dev.vars',
    `${configured}BETTER_AUTH_SECRET="${randomBytes(32).toString('hex')}"\n`,
  );}
execFileSync('pnpm', ['db:migrate'], { stdio: 'inherit' });
execFileSync(
  'pnpm',
  [
    'exec',
    'wrangler',
    'd1',
    'execute',
    'ludus',
    '--local',
    '--command',
    "INSERT INTO invitations(email,expires_at) VALUES ('leo.lemos.ds@icloud.com',unixepoch()*1000+604800000) ON CONFLICT(email) DO UPDATE SET expires_at=excluded.expires_at; INSERT INTO user(id,name,email,email_verified,created_at,updated_at) VALUES ('local-leo','Leo','leo.lemos.ds@icloud.com',0,unixepoch()*1000,unixepoch()*1000) ON CONFLICT(email) DO NOTHING;",
  ],
  { stdio: 'inherit' },
);
execFileSync(
  'pnpm',
  [
    'exec',
    'wrangler',
    'd1',
    'execute',
    'ludus',
    '--local',
    '--command',
    "INSERT INTO player_profiles(user_id,username,language,timezone,chess_level,teaching_profile,activity_public,adult_attested_at,policy_version,onboarded_at,trial_expires_at) VALUES('local-leo','Leo','en-GB','Europe/Madrid','intermediate','club',1,unixepoch()*1000,'2026-10-30',unixepoch()*1000,unixepoch()*1000+2592000000) ON CONFLICT(user_id) DO NOTHING; INSERT INTO timezone_history(user_id,effective_at,timezone) VALUES('local-leo',0,'Europe/Madrid') ON CONFLICT DO NOTHING;",
  ],
  { stdio: 'inherit' },
);
execFileSync(
  'pnpm',
  [
    'exec',
    'wrangler',
    'd1',
    'execute',
    'ludus',
    '--local',
    '--command',
    "INSERT INTO invitations(email,expires_at) VALUES('ludus-friend@example.test',unixepoch()*1000+604800000) ON CONFLICT(email) DO UPDATE SET expires_at=excluded.expires_at; INSERT INTO user(id,name,email,email_verified,created_at,updated_at) VALUES('local-friend','Friend','ludus-friend@example.test',0,unixepoch()*1000,unixepoch()*1000) ON CONFLICT(email) DO NOTHING; INSERT INTO player_profiles(user_id,username,language,timezone,chess_level,teaching_profile,activity_public,adult_attested_at,policy_version,onboarded_at,trial_expires_at) VALUES('local-friend','Friend','en-GB','Europe/Madrid','beginner','beginner',1,unixepoch()*1000,'2026-10-30',unixepoch()*1000,unixepoch()*1000+2592000000) ON CONFLICT(user_id) DO NOTHING; INSERT INTO timezone_history(user_id,effective_at,timezone) VALUES('local-friend',0,'Europe/Madrid') ON CONFLICT DO NOTHING;",
  ],
  { stdio: 'inherit' },
);
console.log(
  'Leo seeded locally. Open /play and choose Sign in as dev. Local sign-in is disabled on deployed hosts.',
);
