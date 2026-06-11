import { z } from 'zod';

export const createApplicationSchema = z.object({
  body: z.object({ universityId: z.string().min(1), course: z.string().min(1) }),
});

export const statusSchema = z.object({
  body: z.object({
    status: z.enum(['PROFILE', 'DOCUMENTS', 'VERIFICATION', 'APPLICATION', 'PAYMENT', 'COMPLETED']),
    rejectionReason: z.string().optional(),
  }),
});

export const paymentSchema = z.object({
  body: z.object({
    paymentLink: z.string().url().optional(),
    paymentStatus: z.enum(['PENDING', 'COMPLETED', 'FAILED']),
  }),
});
