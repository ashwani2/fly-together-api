import { z } from 'zod';

export const assignAgentSchema = z.object({
  body: z.object({
    agentId: z.string().min(1).nullable(),
  }),
});
