import { z } from 'zod';

// Captures one SOP-generator submission. Mirrors the public generator form;
// only the name, university and course are required (country/campus optional).
export const createSopLeadSchema = z.object({
  body: z.object({
    fullName: z.string().min(1, 'Full name is required').max(200),
    country: z.string().max(120).optional(),
    university: z.string().min(1, 'University is required').max(200),
    campus: z.string().max(200).optional(),
    course: z.string().min(1, 'Course is required').max(200),
  }),
});
