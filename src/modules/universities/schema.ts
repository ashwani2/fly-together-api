import { z } from 'zod';

const body = z.object({
  name: z.string().min(1),
  location: z.string().min(1),
  logo: z.string().min(1),
  rating: z.number().min(0).max(5).default(0),
  tuitionFee: z.string().min(1),
  description: z.string().min(1),
  courses: z.array(z.string()).default([]),
});

export const createUniversitySchema = z.object({ body });
export const updateUniversitySchema = z.object({ body: body.partial() });
