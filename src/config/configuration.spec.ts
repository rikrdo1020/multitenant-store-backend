import { describe, expect, it } from 'vitest';
import { validateEnv } from './configuration';

describe('configuration email links', () => {
  it('GIVEN production HTTPS auth links WHEN validating env SHOULD accept them', () => {
    expect(() => validateEnv(baseEnv({
      NODE_ENV: 'production',
      PASSWORD_RESET_URL: 'https://store.example.com/reset-password',
      TEAM_INVITE_URL: 'https://store.example.com/invite',
    }))).not.toThrow();
  });

  it('GIVEN production localhost HTTP auth links WHEN validating env SHOULD reject them', () => {
    expect(() => validateEnv(baseEnv({
      NODE_ENV: 'production',
      PASSWORD_RESET_URL: 'http://localhost:8081/reset-password',
      TEAM_INVITE_URL: 'https://store.example.com/invite',
    }))).toThrow('PASSWORD_RESET_URL');
  });

  it('GIVEN approved native deep links WHEN validating env SHOULD accept them', () => {
    expect(() => validateEnv(baseEnv({
      NODE_ENV: 'production',
      PASSWORD_RESET_URL: 'multitenant://reset-password',
      TEAM_INVITE_URL: 'multitenant://invite',
    }))).not.toThrow();
  });
});

function baseEnv(overrides: Record<string, string>): Record<string, string> {
  return {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://postgres:password@localhost:5432/db',
    JWT_ACCESS_SECRET: 'access-secret-long-enough',
    JWT_REFRESH_SECRET: 'refresh-secret-long-enough',
    RESEND_API_KEY: 're_test',
    RESEND_FROM_EMAIL: 'sender@example.com',
    RESEND_FROM_NAME: 'Store',
    FRONTEND_URL: 'http://localhost:8081',
    PASSWORD_RESET_URL: 'multitenant://reset-password',
    TEAM_INVITE_URL: 'multitenant://invite',
    ...overrides,
  };
}
