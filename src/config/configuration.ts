import { z } from 'zod';

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

  YAPPY_MOCK: z.string().optional(),
  YAPPY_MERCHANT_ID: z.string().optional(),
  YAPPY_SECRET_KEY: z.string().optional(),
  YAPPY_URL_DOMAIN: z.string().optional(),
  YAPPY_API_URL: z.string().optional(),
  YAPPY_SITE_URL: z.string().optional(),
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
