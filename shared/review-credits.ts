export const REVIEW_CREDITS_PER_PACK = 10;
export const REVIEW_PACK_PRICE_EUR_CENTS = 499;
export const MONTHLY_FREE_REVIEW_CREDITS = 30;
export const REVIEW_CREDIT_RESERVATION_TIMEOUT_MS = 90_000;

export type ReviewCreditSource = 'intro' | 'beta' | 'complimentary' | 'paid';
export type ReviewCreditReservation = {
  reservationId: string;
  source: ReviewCreditSource;
  packId: string | null;
};
export type ReviewCreditStatus = {
  available: number;
  monthlyFreeRemaining: number;
  introAvailable: boolean;
  paidRemaining: number;
};
