interface Env {
  STRIPE_API_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_BILLING_ENABLED?: string;
  STRIPE_TAX_READY?: string;
  STRIPE_LIFECYCLE_READY?: string;
  OPERATOR_IDS?: string;
  COACH_API_KEY?: string;
  COACH_API_URL?: string;
  COACH_MODEL?: string;
  COACH_EVALUATION_JSON?: string;
  COACH_INPUT_USD_PER_MILLION?: string;
  COACH_OUTPUT_USD_PER_MILLION?: string;
  LOCAL_DEV?: string;
  BETTER_AUTH_SECRET?: string;
  RESEND_API_KEY?: string;
  AUTH_EMAIL_FROM?: string;
}
