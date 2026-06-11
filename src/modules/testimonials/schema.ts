import { z } from 'zod';

const body = z.object({
  studentName: z.string().min(1),
  universityName: z.string().optional(),
  content: z.string().min(1),
  mediaUrl: z.string().min(1),
  mediaType: z.enum(['IMAGE', 'VIDEO']).default('IMAGE'),
  avatarUrl: z.string().optional(),
  isActive: z.boolean().default(true),
});

export const createTestimonialSchema = z.object({ body });
export const updateTestimonialSchema = z.object({ body: body.partial() });
