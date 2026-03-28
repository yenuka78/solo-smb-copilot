export const OCR_PROVIDERS = ["mock", "openai", "gemini", "google-document-ai", "aws-textract", "azure-document-intelligence"] as const;

export type OcrProvider = (typeof OCR_PROVIDERS)[number];

type BillingEnv = {
  stripeEnabled: boolean;
  stripeSecretKey?: string;
  stripeWebhookSecret?: string;
  stripePublishableKey?: string;
  stripePriceId?: string;
  stripeCheckoutSuccessUrl?: string;
  stripeCheckoutCancelUrl?: string;
  stripePortalReturnUrl?: string;
  stripeReconcileRunnerToken?: string;
  webhookToleranceSeconds: number;
  isStripeConfigured: boolean;
  canCreateCheckout: boolean;
  canCreatePortal: boolean;
  canProcessWebhooks: boolean;
  canRunReconciliation: boolean;
};

type OcrEnv = {
  provider: OcrProvider;
  apiKey?: string;
  endpoint?: string;
  isConfigured: boolean;
};

export type AppEnv = {
  billing: BillingEnv;
  ocr: OcrEnv;
};

function readBoolean(value: string | undefined, fallback = false): boolean {
  if (!value) return fallback;
  return value.toLowerCase() === "true";
}

function readNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readOcrProvider(value: string | undefined): OcrProvider {
  if (!value) return "mock";

  const normalized = value.toLowerCase();
  if ((OCR_PROVIDERS as readonly string[]).includes(normalized)) {
    return normalized as OcrProvider;
  }

  return "mock";
}

export function getEnv(): AppEnv {
  const stripeEnabled = readBoolean(process.env.STRIPE_ENABLED, false);
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  const stripePriceId = process.env.STRIPE_PRICE_ID;
  const stripeCheckoutSuccessUrl = process.env.STRIPE_CHECKOUT_SUCCESS_URL;
  const stripeCheckoutCancelUrl = process.env.STRIPE_CHECKOUT_CANCEL_URL;
  const stripePortalReturnUrl = process.env.STRIPE_PORTAL_RETURN_URL;
  const stripeReconcileRunnerToken = process.env.STRIPE_RECONCILE_RUNNER_TOKEN;

  const ocrProvider = readOcrProvider(process.env.OCR_PROVIDER);
  const ocrApiKey = process.env.OCR_API_KEY;
  const ocrEndpoint = process.env.OCR_ENDPOINT;

  return {
    billing: {
      stripeEnabled,
      stripeSecretKey,
      stripeWebhookSecret,
      stripePublishableKey,
      stripePriceId,
      stripeCheckoutSuccessUrl,
      stripeCheckoutCancelUrl,
      stripePortalReturnUrl,
      stripeReconcileRunnerToken,
      webhookToleranceSeconds: readNumber(process.env.STRIPE_WEBHOOK_TOLERANCE_SECONDS, 300),
      isStripeConfigured: Boolean(stripeEnabled && stripeSecretKey && stripeWebhookSecret && stripePriceId),
      canCreateCheckout: Boolean(stripeEnabled && stripeSecretKey && stripePriceId),
      canCreatePortal: Boolean(stripeEnabled && stripeSecretKey),
      canProcessWebhooks: Boolean(stripeEnabled && stripeWebhookSecret),
      canRunReconciliation: Boolean(stripeEnabled && stripeSecretKey),
    },
    ocr: {
      provider: ocrProvider,
      apiKey: ocrApiKey,
      endpoint: ocrEndpoint,
      isConfigured:
        ocrProvider === "mock"
          ? true
          : ocrProvider === "openai"
            ? Boolean(ocrApiKey || process.env.OPENAI_API_KEY)
            : Boolean(ocrApiKey),
    },
  };
}
