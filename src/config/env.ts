import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().default(4000),
  JWT_ACCESS_SECRET: z.string().min(8),
  JWT_REFRESH_SECRET: z.string().min(8),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  UPLOAD_DIR: z.string().default('uploads'),
  SIGNED_URL_SECRET: z.string().min(8),
  SIGNED_URL_TTL_SECONDS: z.coerce.number().default(300),
  FRONTEND_URL: z.string().default('http://localhost:3000'),
  RESET_TOKEN_TTL_MINUTES: z.coerce.number().default(60),
  // SMTP is optional — if unset, reset emails are logged to the server console.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default('Fly Together <no-reply@flytogether.com>'),
  // Amber Student partner accommodation search (third-party inventory feed).
  AMBER_API_BASE: z.string().url().default('https://base.amberstudent.com/api/v0/leads/partners'),
  AMBER_PARTNER_SLUG: z.string().default('erasmus-pl-ef53ec75'),
});

export const env = schema.parse(process.env);
export type Env = z.infer<typeof schema>;
