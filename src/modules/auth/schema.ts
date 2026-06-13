import { z } from 'zod';

export const registerSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(8),
    role: z.enum(['STUDENT', 'AGENT']).default('STUDENT'),
    consent: z.literal(true, { errorMap: () => ({ message: 'Consent is required' }) }),
    name: z.string().optional(),
    phoneNumber: z.string().min(1).optional(),
  }),
});

export const loginSchema = z.object({
  body: z.object({ email: z.string().email(), password: z.string().min(1) }),
});

export const refreshSchema = z.object({
  body: z.object({ refreshToken: z.string().min(1) }),
});

export const forgotPasswordSchema = z.object({
  body: z.object({ email: z.string().email() }),
});

export const resetPasswordSchema = z.object({
  body: z.object({ token: z.string().min(10), password: z.string().min(8) }),
});
