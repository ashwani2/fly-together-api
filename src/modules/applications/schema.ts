import { z } from 'zod';

export const createApplicationSchema = z.object({
  body: z.object({ universityName: z.string().min(1), course: z.string().min(1) }),
});

export const statusSchema = z.object({
  body: z.object({
    status: z.enum([
      'CREATED',
      'REJECTED',
      'DOCUMENT_VERIFIED',
      'SENT_TO_UNIVERSITY',
      'PENDING_WITH_UNIVERSITY',
      'VERIFIED_BY_UNIVERSITY',
      'PAYMENT_PENDING',
      'COMPLETED',
    ]),
    rejectionReason: z.string().optional(),
  }),
});

export const paymentSchema = z.object({
  body: z.object({
    paymentLink: z.string().url().optional(),
    paymentStatus: z.enum(['PENDING', 'COMPLETED', 'FAILED']),
  }),
});

// Initialize a Flywire payment for an application. `amount` is in major units
// (e.g. EUR), entered by the admin/agent; the service converts it to subunit.
export const initializeFlywireSchema = z.object({
  body: z.object({
    amount: z.coerce.number().positive('Amount must be greater than 0'),
  }),
});

// Schedule a Google Meet for an application (admin/agent). `scheduledAt` is
// coerced to a Date; `meetLink` is the meeting URL shown on the timeline + email.
export const scheduleMeetingSchema = z.object({
  body: z.object({
    scheduledAt: z.coerce.date({ message: 'A valid date and time is required' }),
    meetLink: z.string().url('Enter a valid meeting link'),
    note: z.string().max(500).optional(),
  }),
});
