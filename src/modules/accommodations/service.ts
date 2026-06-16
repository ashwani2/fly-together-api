import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';
import type { BookingStatus } from '@prisma/client';

type Input = {
  name?: string; city?: string; universityProximity?: string; price?: string;
  type?: string; amenities?: string[]; image?: string; description?: string;
  lat?: number; lng?: number;
};

export async function list(query: { city?: string; type?: string; maxPrice?: string }) {
  return prisma.accommodation.findMany({
    where: {
      ...(query.city ? { city: { contains: query.city, mode: 'insensitive' } } : {}),
      ...(query.type ? { type: query.type } : {}),
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function get(id: string) {
  const item = await prisma.accommodation.findUnique({ where: { id } });
  if (!item) throw AppError.notFound('Accommodation not found');
  return item;
}

export async function create(input: Input) {
  return prisma.accommodation.create({ data: input as Required<Input> });
}

export async function update(id: string, input: Input) {
  await get(id);
  return prisma.accommodation.update({ where: { id }, data: input });
}

export async function remove(id: string) {
  await get(id);
  await prisma.accommodation.delete({ where: { id } });
  return { success: true };
}

// ── Bookings ──────────────────────────────────────────────────────────────────

const bookingInclude = {
  accommodation: { select: { id: true, name: true, city: true, price: true, image: true, type: true } },
  user: { select: { id: true, email: true } },
} as const;

export async function createBooking(userId: string, accommodationId: string, input: { checkIn: string; checkOut: string; message?: string }) {
  const acc = await get(accommodationId);

  const booking = await prisma.accommodationBooking.create({
    data: {
      userId,
      accommodationId,
      checkIn: new Date(input.checkIn),
      checkOut: new Date(input.checkOut),
      message: input.message ?? null,
    },
    include: { ...bookingInclude, user: { select: { id: true, email: true } } },
  });

  // Notify all admins of the new booking request
  const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } });
  if (admins.length) {
    await prisma.notification.createMany({
      data: admins.map((a) => ({
        userId: a.id,
        title: 'New accommodation booking request',
        message: `${booking.user.email} requested "${acc.name}" (${input.checkIn} → ${input.checkOut}).`,
      })),
    });
  }

  return booking;
}

export async function myBookings(userId: string) {
  return prisma.accommodationBooking.findMany({
    where: { userId },
    include: bookingInclude,
    orderBy: { createdAt: 'desc' },
  });
}

export async function listBookings() {
  return prisma.accommodationBooking.findMany({
    include: bookingInclude,
    orderBy: { createdAt: 'desc' },
  });
}

export async function updateBookingStatus(bookingId: string, status: BookingStatus) {
  const existing = await prisma.accommodationBooking.findUnique({
    where: { id: bookingId },
    include: { accommodation: { select: { name: true } } },
  });
  if (!existing) throw AppError.notFound('Booking not found');

  const updated = await prisma.accommodationBooking.update({
    where: { id: bookingId },
    data: { status },
    include: bookingInclude,
  });

  // Notify the student of the status change
  const isConfirmed = status === 'CONFIRMED';
  await prisma.notification.create({
    data: {
      userId: existing.userId,
      title: isConfirmed ? 'Accommodation booking confirmed' : 'Accommodation booking cancelled',
      message: isConfirmed
        ? `Your booking for "${existing.accommodation.name}" has been confirmed.`
        : `Your booking for "${existing.accommodation.name}" has been cancelled.`,
    },
  });

  return updated;
}
