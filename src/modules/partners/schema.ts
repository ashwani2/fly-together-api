import { z } from 'zod';

const body = z.object({
  name: z.string().min(1),
  imageUrl: z.string().min(1),
  redirectionUrl: z.string().min(1),
});

export const createPartnerSchema = z.object({ body });
export const updatePartnerSchema = z.object({ body: body.partial() });
