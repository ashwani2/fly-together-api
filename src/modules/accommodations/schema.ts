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
  lat: z.number().optional(),
  lng: z.number().optional(),
});

export const createAccommodationSchema = z.object({ body });
export const updateAccommodationSchema = z.object({ body: body.partial() });

export const createBookingSchema = z.object({
  body: z.object({
    checkIn: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
    checkOut: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
    message: z.string().max(500).optional(),
  }).refine((d) => new Date(d.checkOut) > new Date(d.checkIn), {
    message: 'Check-out must be after check-in',
    path: ['checkOut'],
  }),
});

export const updateBookingStatusSchema = z.object({
  body: z.object({ status: z.enum(['CONFIRMED', 'CANCELLED']) }),
});
