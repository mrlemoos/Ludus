/** Trusted server state. Billing owns paid expiry and suspension; onboarding owns beta expiry. */
export interface PlusAccess {
  complimentaryPlus?: boolean;
  trialExpiresAt: number | null;
  paidAccessUntil?: number | null;
  paidAccessSuspended?: boolean;
}

export function hasPlusAccess(access: PlusAccess, now: number): boolean {
  function active(until: number | null | undefined) {
    return typeof until === 'number' && Number.isFinite(until) && until > now;
  }
  return (
    access.complimentaryPlus === true ||
    active(access.trialExpiresAt) ||
    (!access.paidAccessSuspended && active(access.paidAccessUntil))
  );
}
