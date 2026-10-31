/** Grants follow verified email ownership; pending invitations need no fabricated account or onboarding. */
export async function hasComplimentaryPlus(db: D1Database, owner: string): Promise<boolean> {
  const grant = await db.prepare(`SELECT g.email FROM complimentary_plus g JOIN user u ON lower(u.email)=g.email
    WHERE u.id=? AND u.email_verified=1 AND g.revoked_at IS NULL
    AND NOT EXISTS(SELECT 1 FROM account_deletions WHERE user_id=?)`).bind(owner, owner).first();
  return !!grant;
}

export async function hasComplimentaryInvitation(db: D1Database, email: string): Promise<boolean> {
  return !!await db.prepare('SELECT email FROM complimentary_plus WHERE email=? AND revoked_at IS NULL').bind(email.toLowerCase()).first();
}
