/** Paid periods and grace are checked against time on every request, independent of reconciliation cadence. */
export async function paidAccessUntil(db: D1Database, owner: string, now = Date.now()): Promise<number | null> {
  const row = await db.prepare(`SELECT MAX(until) AS until FROM (
    SELECT MIN(i.period_end,COALESCE(s.cancel_at,i.period_end)) AS until
    FROM billing_invoice_access i JOIN billing_subscriptions s ON s.id=i.subscription
    WHERE i.owner=? AND i.risk='clear' AND i.period_start<=? AND s.cancel_requested_at IS NULL
    UNION ALL
    SELECT s.grace_until AS until FROM billing_subscriptions s
    WHERE s.owner=? AND s.cancel_requested_at IS NULL AND s.grace_until>?
      AND EXISTS(SELECT 1 FROM billing_invoice_access i WHERE i.subscription=s.id AND i.risk='clear')
      AND NOT EXISTS(SELECT 1 FROM billing_invoice_access i WHERE i.subscription=s.id AND i.risk IN ('refunded','disputed') AND i.period_end>=?)
  ) WHERE NOT EXISTS(SELECT 1 FROM account_deletions WHERE user_id=?)`).bind(owner, now, owner, now, now, owner).first<{ until: number | null }>();
  return row?.until ?? null;
}
