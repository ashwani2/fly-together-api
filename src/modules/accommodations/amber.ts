/**
 * Amber Student partner inventory integration.
 *
 * Amber's API has two hard constraints we must respect server-side:
 *   • Rate limit: 10 requests / minute, then a 5-minute halt period.
 *   • Page size: at most 50 inventories per request.
 *
 * To stay safely under the limit for many concurrent students we (a) cache
 * responses for a short TTL so repeat searches never hit the upstream, and
 * (b) gate outbound calls behind a sliding-window limiter capped at 9/min
 * (one under their limit) that opens a self-imposed 5-min cooldown before
 * Amber's real halt can trigger.
 */
import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';

const COUNTRY = 'United Kingdom'; // UK-only search (matches the dashboard's focus).
export const MAX_LIMIT = 50; // Amber's documented per-call upper bound.

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 9; // stay one under Amber's 10/min so we never trip their halt.
const COOLDOWN_MS = 5 * 60_000;
const CACHE_TTL_MS = 10 * 60_000;

// ── Normalized shape returned to the frontend ──────────────────────────────────

export interface AmberListing {
  id: number;
  name: string;
  slug: string;
  locality: string;
  country: string;
  currency: string;
  priceMin: number | null;
  priceMax: number | null;
  duration: string | null;
  image: string | null;
  types: string[];
  tags: string[];
  bedrooms: { min: number | null; max: number | null };
  bathrooms: { min: number | null; max: number | null };
  nearestPlace: string | null;
  nearestDistance: string | null;
  availableFrom: string | null;
  lat: number | null;
  lng: number | null;
  partnerUrl: string | null;
}

export interface AmberSearchResult {
  items: AmberListing[];
  meta: { page: number; count: number; pages: number; hasNext: boolean };
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  dollar: '$',
  pound: '£',
  euro: '€',
  rupee: '₹',
};

function normalizeListing(raw: any): AmberListing {
  const meta = raw?.meta ?? {};
  const pricing = raw?.pricing ?? {};
  const location = raw?.location ?? {};
  const coords = raw?.location_coordinates ?? location?.location_coordinates ?? {};
  const distances: any[] = Array.isArray(meta.distances) ? meta.distances : [];
  // Prefer the first non-"city center" landmark (usually a university).
  const nearest = distances.find((d) => d?.place && d.place !== 'city center') ?? distances[0] ?? null;
  const currencyRaw = String(pricing.currency ?? '').toLowerCase();

  return {
    id: raw?.id,
    name: raw?.name ?? 'Untitled property',
    slug: raw?.canonical_name ?? String(raw?.id ?? ''),
    locality: location?.locality?.long_name ?? location?.secondary ?? '',
    country: location?.country?.long_name ?? COUNTRY,
    currency: CURRENCY_SYMBOLS[currencyRaw] ?? pricing.currency ?? '',
    priceMin: pricing.min_price ?? pricing.min_available_price ?? null,
    priceMax: pricing.max_price ?? pricing.max_available_price ?? null,
    duration: pricing.duration ?? null,
    image:
      raw?.image_featured_link ??
      raw?.inventory_featured_image_path ??
      meta.featured_image_path ??
      raw?.images?.[0]?.path ??
      null,
    types: Array.isArray(meta.types) ? meta.types : [],
    tags: Array.isArray(raw?.tags) ? raw.tags : [],
    bedrooms: { min: meta.min_bedroom_count ?? null, max: meta.max_bedroom_count ?? null },
    bathrooms: { min: meta.min_bathroom_count ?? null, max: meta.max_bathroom_count ?? null },
    nearestPlace: nearest?.place ?? null,
    nearestDistance: nearest?.distance ?? null,
    availableFrom: meta.available_from_formatted ?? meta.available_from ?? null,
    lat: coords?.lat ?? null,
    lng: coords?.lng ?? null,
    partnerUrl: raw?.partner_inventory_url ?? raw?.partner_link ?? null,
  };
}

// ── Sliding-window rate guard ──────────────────────────────────────────────────

const callTimes: number[] = [];
let cooldownUntil = 0;

function assertRateAvailable(): void {
  const now = Date.now();
  if (now < cooldownUntil) {
    const retryAfter = Math.ceil((cooldownUntil - now) / 1000);
    throw new AppError(429, 'RATE_LIMITED', 'Too many property searches right now. Please try again shortly.', { retryAfter });
  }
  // Drop timestamps outside the rolling 60s window.
  while (callTimes.length && now - callTimes[0] > RATE_WINDOW_MS) callTimes.shift();
  if (callTimes.length >= RATE_MAX) {
    cooldownUntil = now + COOLDOWN_MS;
    throw new AppError(429, 'RATE_LIMITED', 'Too many property searches right now. Please try again in a few minutes.', { retryAfter: Math.ceil(COOLDOWN_MS / 1000) });
  }
  callTimes.push(now);
}

// Exposed for tests to start from a clean slate.
export function _resetRateGuard(): void {
  callTimes.length = 0;
  cooldownUntil = 0;
}

// ── TTL cache ──────────────────────────────────────────────────────────────────

const cache = new Map<string, { at: number; data: AmberSearchResult }>();

// In-flight requests, keyed identically to the cache. Coalesces concurrent
// searches for the same page/query (e.g. React StrictMode's double-mount, or two
// users searching at once) into a single upstream call so we don't waste the
// rate-limit budget or trip Amber's halt.
const pending = new Map<string, Promise<AmberSearchResult>>();

export function _resetCache(): void {
  cache.clear();
  pending.clear();
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function searchInventories(opts: { page?: number; q?: string }): Promise<AmberSearchResult> {
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const q = (opts.q ?? '').trim();
  const key = `${page}|${q.toLowerCase()}`;

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;

  // Join an identical request that's already in flight instead of issuing a new one.
  const inFlight = pending.get(key);
  if (inFlight) return inFlight;

  const promise = fetchInventories(page, q, key);
  pending.set(key, promise);
  try {
    return await promise;
  } finally {
    pending.delete(key);
  }
}

async function fetchInventories(page: number, q: string, key: string): Promise<AmberSearchResult> {
  assertRateAvailable();

  // Search by place name: default to the whole UK, or the user's query when they search.
  const params = new URLSearchParams({
    location_place_name: q || COUNTRY,
    limit: String(MAX_LIMIT),
    p: String(page),
  });
  const url = `${env.AMBER_API_BASE}/${env.AMBER_PARTNER_SLUG}/inventories?${params.toString()}`;

  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' } });
  } catch {
    throw new AppError(502, 'UPSTREAM_ERROR', 'Could not reach the accommodation provider. Please try again.');
  }

  if (res.status === 429) {
    cooldownUntil = Date.now() + COOLDOWN_MS;
    throw new AppError(429, 'RATE_LIMITED', 'The accommodation provider is busy. Please try again in a few minutes.', { retryAfter: Math.ceil(COOLDOWN_MS / 1000) });
  }
  if (!res.ok) {
    throw new AppError(502, 'UPSTREAM_ERROR', 'The accommodation provider returned an error. Please try again.');
  }

  const json: any = await res.json().catch(() => null);
  const data = json?.data ?? {};
  const result: any[] = Array.isArray(data.result) ? data.result : [];
  const m = data.meta ?? {};

  const out: AmberSearchResult = {
    items: result.map(normalizeListing).filter((l) => l.id != null),
    meta: {
      page: m.current_page ?? page,
      count: m.count ?? result.length,
      pages: Array.isArray(m.pages) ? m.pages[m.pages.length - 1] ?? page : page,
      hasNext: m.next != null,
    },
  };

  cache.set(key, { at: Date.now(), data: out });
  return out;
}
