import { z } from 'zod';

const body = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  excerpt: z.string().min(1),
  content: z.string().min(1),
  coverImage: z.string().min(1),
  author: z.string().min(1),
  category: z.string().min(1),
  readTime: z.string().min(1),
  isActive: z.boolean().default(true),
  videoUrl: z.string().optional(),
  publishedBy: z.string().optional(),
});

export const createBlogSchema = z.object({ body });
export const updateBlogSchema = z.object({ body: body.partial() });
