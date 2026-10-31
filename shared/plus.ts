/** Trusted server state. Billing owns paid expiry and suspension; onboarding owns beta expiry. */
export type PlusAccess = {
  complimentaryPlus?: boolean;
  trialExpiresAt: number | null;
  paidAccessUntil?: number | null;
  paidAccessSuspended?: boolean;
};

export function hasPlusAccess(access: PlusAccess, now: number): boolean {
  const active = (until: number | null | undefined) => typeof until === 'number' && Number.isFinite(until) && until > now;
  return access.complimentaryPlus === true || active(access.trialExpiresAt) || (!access.paidAccessSuspended && active(access.paidAccessUntil));
}
