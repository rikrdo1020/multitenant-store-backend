import { z } from 'zod';

const DEFAULT_DEEP_LINK_SCHEMES = 'multitenant';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

function validateResetOrInviteBaseUrl(
  value: string,
  env: 'development' | 'production' | 'test',
  allowedSchemes: string,
): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }

  const protocol = parsed.protocol.replace(':', '');
  const deepLinkSchemes = allowedSchemes
    .split(',')
    .map((scheme) => scheme.trim())
    .filter(Boolean);

  if (parsed.protocol === 'https:') return true;
  if (deepLinkSchemes.includes(protocol)) return true;

  return env !== 'production' && parsed.protocol === 'http:' && LOCAL_HOSTS.has(parsed.hostname);
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),

  DATABASE_URL: z.string().url(),

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  RESEND_API_KEY: z.string().min(1),
  RESEND_FROM_EMAIL: z.string().email(),
  RESEND_FROM_NAME: z.string().min(1),
  MOCK_EMAIL: z
    .enum(['true', 'false'])
    .optional()
    .default('false'),
  EMAIL_ALLOWED_DEEP_LINK_SCHEMES: z.string().default(DEFAULT_DEEP_LINK_SCHEMES),
  EMAIL_RECIPIENT_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),
  EMAIL_RECIPIENT_WINDOW_LIMIT: z.coerce.number().int().positive().default(3),
  EMAIL_ACTOR_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),
  EMAIL_ACTOR_WINDOW_LIMIT: z.coerce.number().int().positive().default(10),
  EMAIL_TENANT_DAILY_LIMIT: z.coerce.number().int().positive().default(200),
  EMAIL_HOURLY_SEND_LIMIT: z.coerce.number().int().positive().default(100),
  EMAIL_DAILY_SEND_LIMIT: z.coerce.number().int().positive().default(500),

  APP_DOMAIN: z.string().optional(),

  FRONTEND_URL: z
    .string()
    .refine(
      (val) => val.split(',').every((u) => {
        try { new URL(u.trim()); return true; } catch { return false; }
      }),
      { message: 'Must be a valid URL or comma-separated list of valid URLs' },
    )
    .default('http://localhost:5173'),
  PASSWORD_RESET_URL: z.string().min(1).default('multitenant://reset-password'),
  TEAM_INVITE_URL: z.string().min(1).default('multitenant://invite'),
  ORDER_TRACKING_URL: z.string().min(1).default('multitenant://track'),

  YAPPY_MOCK: z.string().optional(),
  YAPPY_MERCHANT_ID: z.string().optional(),
  YAPPY_SECRET_KEY: z.string().optional(),
  YAPPY_URL_DOMAIN: z.string().optional(),
  YAPPY_API_URL: z.string().optional(),
  YAPPY_SITE_URL: z.string().optional(),
}).superRefine((env, ctx) => {
  for (const key of ['PASSWORD_RESET_URL', 'TEAM_INVITE_URL', 'ORDER_TRACKING_URL'] as const) {
    if (!validateResetOrInviteBaseUrl(
      env[key],
      env.NODE_ENV,
      env.EMAIL_ALLOWED_DEEP_LINK_SCHEMES,
    )) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: 'Must be HTTPS, an approved deep link scheme, or localhost HTTP outside production',
      });
    }
  }
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const formatted = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Environment validation failed:\n${formatted}`);
  }
  return result.data;
}

export default (): EnvConfig => validateEnv(process.env);
