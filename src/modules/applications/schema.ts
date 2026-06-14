import { z } from 'zod';

export const createApplicationSchema = z.object({
  body: z.object({ universityName: z.string().min(1), course: z.string().min(1) }),
});

export const statusSchema = z.object({
  body: z.object({
    status: z.enum([
      'CREATED',
      'REJECTED',
      'DOCUMENT_VERIFIED',
      'SENT_TO_UNIVERSITY',
      'PENDING_WITH_UNIVERSITY',
      'VERIFIED_BY_UNIVERSITY',
      'PAYMENT_PENDING',
      'COMPLETED',
    ]),
    rejectionReason: z.string().optional(),
  }),
});

export const paymentSchema = z.object({
  body: z.object({
    paymentLink: z.string().url().optional(),
    paymentStatus: z.enum(['PENDING', 'COMPLETED', 'FAILED']),
  }),
});
