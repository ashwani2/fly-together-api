import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { env } from '../config/env.js';
import { mapFlywireStatus, initializePayment, getPayment } from './flywire.js';

describe('mapFlywireStatus', () => {
  it('maps in-flight statuses to PENDING', () => {
    expect(mapFlywireStatus('PENDING')).toBe('PENDING');
    expect(mapFlywireStatus('INITIATED')).toBe('PENDING');
    expect(mapFlywireStatus('GUARANTEED')).toBe('PENDING');
  });
  it('maps DELIVERED to COMPLETED and CANCELLED to FAILED', () => {
    expect(mapFlywireStatus('DELIVERED')).toBe('COMPLETED');
    expect(mapFlywireStatus('CANCELLED')).toBe('FAILED');
  });
});

describe('flywire client', () => {
  const originalKey = env.FLYWIRE_API_KEY;
  beforeEach(() => {
    env.FLYWIRE_API_KEY = 'test-key';
  });
  afterEach(() => {
    env.FLYWIRE_API_KEY = originalKey;
    vi.unstubAllGlobals();
  });

  it('sends versioned headers and amount, returns details', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          id: 'abc-123',
          status: { value: 'PENDING' },
          currency: 'EUR',
          links: { pay: 'https://pay.flywire.com/abc-123/pay', self: 'https://x/abc-123' },
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await initializePayment({
      subject: { type: 'student', firstName: 'A', lastName: 'B', email: 'a@b.com', country: 'IN' },
      destinationId: 'FLYWIRE:ANI',
      amount: 480000,
    });

    expect(res.id).toBe('abc-123');
    expect(res.links.pay).toContain('/pay');
    const opts = (fetchMock.mock.calls[0] as any[])[1] as RequestInit;
    expect((opts.headers as Record<string, string>)['X-Authentication-Key']).toBe('test-key');
    expect(JSON.parse(opts.body as string).payment.amount).toBe(480000);
  });

  it('surfaces Flywire validation faults as a 400', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({ type: 'failed-validation', data: { faults: [{ path: '/payment/items', reason: 'Amount must be greater than £50.00' }] } }),
          { status: 400 },
        ),
      ),
    );
    await expect(
      initializePayment({
        subject: { type: 'student', firstName: 'A', lastName: 'B', email: 'a@b.com', country: 'IN' },
        destinationId: 'FLYWIRE:ANI',
        amount: 10,
      }),
    ).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('greater than') });
  });

  it('throws 503 when no API key is configured', async () => {
    env.FLYWIRE_API_KEY = undefined;
    await expect(getPayment('abc-123')).rejects.toMatchObject({ statusCode: 503 });
  });

  it('maps a 404 from Flywire to not found', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
    await expect(getPayment('missing')).rejects.toMatchObject({ statusCode: 404 });
  });
});
