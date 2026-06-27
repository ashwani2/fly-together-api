/**
 * Thin client for the Flywire Agents Payments API.
 *
 * Wraps the two calls we need — initialize a payment and query a single
 * payment — handling the custom versioned mime types and the
 * `X-Authentication-Key` header. All amounts are in the currency subunit
 * (e.g. cents), per the Flywire spec.
 *
 * Docs: "Flywire Agents - Payments API". Sandbox base:
 * https://api-platform.demo.flywire.com/agents
 */
import { env } from '../config/env.js';
import { AppError } from './errors.js';

// Custom mime types the API uses for content negotiation (version 1.0).
const INIT_CONTENT_TYPE = 'application/flywire.agents.payment.initialization+json;version=1.0';
const DETAILS_ACCEPT = 'application/flywire.agents.payment.details+json;version=1.0';

/** Flywire payment lifecycle states (status.value in the details payload). */
export type FlywireStatus = 'PENDING' | 'INITIATED' | 'GUARANTEED' | 'DELIVERED' | 'CANCELLED';

/** Our internal payment status (Prisma PaymentStatus). */
export type PaymentStatus = 'PENDING' | 'COMPLETED' | 'FAILED';

export interface FlywireSubject {
  type: 'student';
  firstName: string;
  lastName: string;
  email: string;
  country: string;
  studentId?: string;
}

export interface FlywirePaymentDetails {
  id: string;
  reference?: string;
  status: { value: FlywireStatus; transitions?: Record<string, string> };
  amounts?: { expected?: { total?: number } };
  currency?: string;
  destinationId?: string;
  links: { pay?: string; self?: string; receipt?: string };
}

/**
 * Maps a Flywire lifecycle status to our internal PaymentStatus.
 * DELIVERED → COMPLETED, CANCELLED → FAILED, everything in-flight → PENDING.
 */
export function mapFlywireStatus(status: FlywireStatus): PaymentStatus {
  switch (status) {
    case 'DELIVERED':
      return 'COMPLETED';
    case 'CANCELLED':
      return 'FAILED';
    default:
      return 'PENDING';
  }
}

function requireKey(): string {
  if (!env.FLYWIRE_API_KEY) {
    throw new AppError(503, 'FLYWIRE_NOT_CONFIGURED', 'Flywire is not configured (FLYWIRE_API_KEY missing).');
  }
  return env.FLYWIRE_API_KEY;
}

/**
 * Turns a non-2xx Flywire response into an AppError. Flywire validation errors
 * arrive as `{ type, data: { faults: [{ path, reason }] } }` or
 * `{ status, faults: [...] }`; we surface the first reason.
 */
function flywireError(status: number, body: unknown): AppError {
  const b = body as any;
  const faults = b?.data?.faults ?? b?.faults;
  if (Array.isArray(faults) && faults.length) {
    const first = faults[0];
    const reason = typeof first === 'string' ? first : (first?.reason ?? first?.path ?? 'validation failed');
    return AppError.badRequest(`Flywire rejected the payment: ${reason}`, faults);
  }
  return new AppError(status >= 500 ? 502 : 400, 'FLYWIRE_ERROR', `Flywire request failed (${status}).`, body);
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Initializes a payment and returns its details (including links.pay). */
export async function initializePayment(input: {
  subject: FlywireSubject;
  destinationId: string;
  /** Amount in the currency subunit (e.g. cents). */
  amount: number;
}): Promise<FlywirePaymentDetails> {
  const key = requireKey();
  const res = await fetch(`${env.FLYWIRE_API_BASE}/payments`, {
    method: 'POST',
    headers: {
      'Content-Type': INIT_CONTENT_TYPE,
      Accept: DETAILS_ACCEPT,
      'X-Authentication-Key': key,
    },
    body: JSON.stringify({
      subject: input.subject,
      payment: { destinationId: input.destinationId, amount: input.amount },
    }),
  });
  const body = await parseBody(res);
  if (!res.ok) throw flywireError(res.status, body);
  return body as FlywirePaymentDetails;
}

/** Queries a single payment by its Flywire id and returns the latest details. */
export async function getPayment(flywireId: string): Promise<FlywirePaymentDetails> {
  const key = requireKey();
  const res = await fetch(`${env.FLYWIRE_API_BASE}/payments/${encodeURIComponent(flywireId)}`, {
    method: 'GET',
    headers: { Accept: DETAILS_ACCEPT, 'X-Authentication-Key': key },
  });
  const body = await parseBody(res);
  if (res.status === 404) throw AppError.notFound('Flywire payment not found.');
  if (!res.ok) throw flywireError(res.status, body);
  return body as FlywirePaymentDetails;
}
