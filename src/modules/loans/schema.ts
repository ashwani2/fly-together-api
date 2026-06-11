import { z } from 'zod';

export const createLoanSchema = z.object({
  body: z.object({
    amount: z.string().min(1),
    details: z.record(z.any()).optional(),
  }),
});

export const updateLoanStatusSchema = z.object({
  body: z.object({ status: z.string().min(1) }),
});
