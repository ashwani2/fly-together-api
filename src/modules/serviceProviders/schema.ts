import { z } from 'zod';

const body = z.object({
  name: z.string().min(1),
  category: z.enum(['ACCOMMODATION', 'TICKET_BOOKING', 'LOANS', 'LOGISTICS', 'ONLINE_PAYMENT']),
  rating: z.number().min(0).max(5).default(0),
  price: z.string().min(1),
  location: z.string().optional(),
  image: z.string().min(1),
  description: z.string().min(1),
});

export const createServiceProviderSchema = z.object({ body });
export const updateServiceProviderSchema = z.object({ body: body.partial() });
