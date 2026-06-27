import dotenv from 'dotenv';
import { z } from 'zod';

// Load the local `.env` only when env isn't already injected. UAT commands run
// via `dotenv -e .env.uat -- <cmd>` pre-populate process.env, so we must NOT
// load `.env` on top of them. Plain commands (local dev) load `.env` as usual.
if (!process.env.DATABASE_URL) dotenv.config();

const schema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().default(4000),
  JWT_ACCESS_SECRET: z.string().min(8),
  JWT_REFRESH_SECRET: z.string().min(8),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  // Public base URL of THIS backend — baked into stored document URLs (docUrl).
  // Set per env: http://localhost:4000 (dev) / https://uat-api... (UAT).
  BACKEND_URL: z.string().url().default('http://localhost:4000'),
  STORAGE_DRIVER: z.enum(['local', 's3', 'cloudinary']).default('local'),
  UPLOAD_DIR: z.string().default('uploads'),
  // Cloudinary — used when STORAGE_DRIVER=cloudinary (e.g. UAT). Optional otherwise.
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
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
  // Flywire Agents Payments API. Used to initialize tuition payments and track
  // their status. FLYWIRE_API_KEY is the X-Authentication-Key from the Agents
  // portal (Settings > General > Integration Details). When unset, the Flywire
  // endpoints return a 503 so the rest of the app keeps working.
  FLYWIRE_API_BASE: z.string().url().default('https://api-platform.demo.flywire.com/agents'),
  FLYWIRE_API_KEY: z.string().optional(),
  // Sandbox test destination: FLYWIRE:ANI (non-integrated, EUR) or FLYWIRE:AIN (integrated).
  FLYWIRE_DESTINATION_ID: z.string().default('FLYWIRE:ANI'),
  // Default payer country (2-letter) for the Flywire subject — students have no
  // country on their profile, so we fall back to this.
  FLYWIRE_SUBJECT_COUNTRY: z.string().length(2).default('IN'),
});

const parsed = schema
  .refine(
    (e) =>
      e.STORAGE_DRIVER !== 'cloudinary' ||
      (e.CLOUDINARY_CLOUD_NAME && e.CLOUDINARY_API_KEY && e.CLOUDINARY_API_SECRET),
    {
      message:
        'STORAGE_DRIVER=cloudinary requires CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET',
      path: ['STORAGE_DRIVER'],
    },
  )
  .parse(process.env);

export const env = parsed;
export type Env = z.infer<typeof schema>;
