import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { searchInventories, _resetCache, _resetRateGuard } from './amber.js';

const rawListing = {
  id: 220794,
  name: 'The Holly, Lubbock',
  canonical_name: 'the-holly-in-lubbock-texas-2206174444079',
  pricing: { currency: 'pound', duration: 'monthly', max_price: 579, min_price: 409 },
  meta: {
    types: ['private_room', 'private_bathroom'],
    distances: [
      { place: 'city center', distance: '3.1 mi' },
      { place: 'Texas Tech University', distance: '1.9 mi' },
    ],
    min_bedroom_count: 2,
    max_bedroom_count: 4,
    min_bathroom_count: 2,
    max_bathroom_count: 4,
    available_from_formatted: '15 Aug, 2026',
    featured_image_path: 'https://assets.example.com/a.jpg',
  },
  tags: ['gym', 'swimming_pool'],
  location: {
    locality: { long_name: 'London' },
    country: { long_name: 'United Kingdom' },
    location_coordinates: { lat: 51.5, lng: -0.12 },
  },
  image_featured_link: 'https://assets.example.com/featured.jpg',
  location_coordinates: { lat: 51.5, lng: -0.12 },
  partner_inventory_url: 'https://amberstudent.com/places/the-holly?partner_source=x',
};

function mockResponse() {
  return {
    message: 'success',
    data: {
      meta: { prev: null, next: 2, count: 4067, limit: 50, pages: [1, 2, 3, 4067], current_page: 1 },
      result: [rawListing],
    },
  };
}

function stubFetch(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

describe('amber integration', () => {
  beforeEach(() => {
    _resetCache();
    _resetRateGuard();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults location_place_name to United Kingdom, and uses the query when searching', async () => {
    const fetchMock = stubFetch(mockResponse());
    vi.stubGlobal('fetch', fetchMock);

    await searchInventories({ page: 1 });
    expect(String(fetchMock.mock.calls[0][0])).toContain('location_place_name=United+Kingdom');

    await searchInventories({ page: 1, q: 'Manchester' });
    const searched = String(fetchMock.mock.calls[1][0]);
    expect(searched).toContain('location_place_name=Manchester');
    expect(searched).not.toContain('United+Kingdom');
  });

  it('normalizes the nested Amber payload', async () => {
    vi.stubGlobal('fetch', stubFetch(mockResponse()));
    const { items, meta } = await searchInventories({ page: 1 });

    expect(items).toHaveLength(1);
    const l = items[0];
    expect(l.id).toBe(220794);
    expect(l.name).toBe('The Holly, Lubbock');
    expect(l.locality).toBe('London');
    expect(l.currency).toBe('£');
    expect(l.priceMin).toBe(409);
    expect(l.priceMax).toBe(579);
    expect(l.bedrooms).toEqual({ min: 2, max: 4 });
    // First non-"city center" landmark is preferred.
    expect(l.nearestPlace).toBe('Texas Tech University');
    expect(l.partnerUrl).toContain('amberstudent.com');
    expect(meta.hasNext).toBe(true);
    expect(meta.page).toBe(1);
  });

  it('serves repeat searches from cache without a second fetch', async () => {
    const fetchMock = stubFetch(mockResponse());
    vi.stubGlobal('fetch', fetchMock);

    await searchInventories({ page: 1, q: 'london' });
    await searchInventories({ page: 1, q: 'london' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrent identical searches into one upstream call', async () => {
    const fetchMock = stubFetch(mockResponse());
    vi.stubGlobal('fetch', fetchMock);

    // Fire both before awaiting — mirrors StrictMode's double-mount / two users at once.
    const [a, b] = await Promise.all([
      searchInventories({ page: 1, q: 'london' }),
      searchInventories({ page: 1, q: 'london' }),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a.items[0].id).toBe(b.items[0].id);
  });

  it('opens a cooldown (429) once the per-minute cap is exceeded', async () => {
    vi.stubGlobal('fetch', stubFetch(mockResponse()));

    // 9 distinct pages are allowed within the window...
    for (let p = 1; p <= 9; p++) {
      await searchInventories({ page: p });
    }
    // ...the 10th must be rejected before reaching Amber.
    await expect(searchInventories({ page: 10 })).rejects.toMatchObject({ statusCode: 429 });
  });
});
