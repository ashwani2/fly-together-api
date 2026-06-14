import { z } from 'zod';

export const createAgentSchema = z.object({
  body: z.object({
    name: z.string().min(1),
    email: z.string().email(),
    password: z.string().min(8),
  }),
});

export const verifyDocumentSchema = z.object({
  body: z.object({
    status: z.enum(['UPLOADED', 'PENDING', 'VERIFIED', 'REJECTED']),
  }),
});
