import { z } from 'zod';

const body = z.object({
  name: z.string().min(1),
  city: z.string().min(1),
  universityProximity: z.string().optional(),
  price: z.string().min(1),
  type: z.string().min(1),
  amenities: z.array(z.string()).default([]),
  image: z.string().min(1),
  description: z.string().min(1),
});

export const createAccommodationSchema = z.object({ body });
export const updateAccommodationSchema = z.object({ body: body.partial() });
