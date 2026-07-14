/**
 * Geocoding utility — Google Maps Geocoding API (primary) + Nominatim (fallback).
 *
 * Google Maps Geocoding API provides ROOFTOP-level accuracy and address
 * components for both forward and reverse geocoding. Falls back to
 * Nominatim if the API key is missing or the request fails.
 */

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || "";

interface GeocodeResult {
  latitude: number;
  longitude: number;
  display_name: string;
  quality: number; // 0-1 confidence
  source: "google" | "nominatim";
  placeId?: string;
  formattedAddress?: string;
  types?: string[];
}

// ── Cache ───────────────────────────────────────────────────────────

interface CacheEntry { result: GeocodeResult | null; ts: number }
const geocodeCache = new Map<string, CacheEntry>();
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
const MAX_CACHE_SIZE = 1000;

function getCached(key: string): GeocodeResult | null | undefined {
  const entry = geocodeCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.ts > CACHE_TTL) { geocodeCache.delete(key); return undefined; }
  return entry.result;
}

function setCache(key: string, result: GeocodeResult | null) {
  if (geocodeCache.size >= MAX_CACHE_SIZE) {
    const keys = Array.from(geocodeCache.keys());
    for (let i = 0; i < Math.ceil(MAX_CACHE_SIZE * 0.2); i++) geocodeCache.delete(keys[i]);
  }
  geocodeCache.set(key, { result, ts: Date.now() });
}

// ── Google Maps Geocoding API (forward) ──────────────────────────────

async function googleGeocode(
  address: string,
  city: string,
  country: string = "Malaysia"
): Promise<GeocodeResult | null> {
  if (!GOOGLE_MAPS_API_KEY) return null;

  const fullAddress = [address, city, country].filter(Boolean).join(", ");

  try {
    const params = new URLSearchParams({
      address: fullAddress,
      key: GOOGLE_MAPS_API_KEY,
      region: "my",
      components: "country:MY",
    });

    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?${params}`,
      { signal: AbortSignal.timeout(8000) }
    );

    if (!res.ok) return null;

    const data = await res.json();

    if (data.status !== "OK" || !data.results?.length) return null;

    // Pick the best result — prefer ROOFTOP > RANGE_INTERPOLATED > GEOMETRIC_CENTER > APPROXIMATE
    let best = data.results[0];
    let bestScore = -1;
    for (const r of data.results) {
      let score = 0;
      switch (r.geometry.location_type) {
        case "ROOFTOP": score = 4; break;
        case "RANGE_INTERPOLATED": score = 3; break;
        case "GEOMETRIC_CENTER": score = 2; break;
        case "APPROXIMATE": score = 1; break;
      }
      if (r.partial_match === false) score += 1; // exact match bonus
      if (r.types?.includes("street_address")) score += 1;
      if (r.types?.includes("premise")) score += 1;
      if (score > bestScore) { best = r; bestScore = score; }
    }

    const loc = best.geometry.location;

    // Quality from location_type
    let quality = 0.5;
    switch (best.geometry.location_type) {
      case "ROOFTOP": quality = 1.0; break;
      case "RANGE_INTERPOLATED": quality = 0.85; break;
      case "GEOMETRIC_CENTER": quality = 0.6; break;
      case "APPROXIMATE": quality = 0.4; break;
    }
    if (best.partial_match === false) quality = Math.min(quality + 0.1, 1.0);

    return {
      latitude: loc.lat,
      longitude: loc.lng,
      display_name: best.formatted_address,
      quality,
      source: "google",
      placeId: best.place_id,
      formattedAddress: best.formatted_address,
      types: best.types,
    };
  } catch {
    return null;
  }
}

// ── Google Maps Reverse Geocoding ────────────────────────────────────

export interface GoogleReverseResult {
  formattedAddress: string;
  sublocality: string;
  neighborhood: string;
  route: string;
  city: string;
  postalCode: string;
  types: string[];
}

export async function googleReverseGeocode(
  lat: number,
  lng: number
): Promise<GoogleReverseResult | null> {
  if (!GOOGLE_MAPS_API_KEY) return null;

  try {
    const params = new URLSearchParams({
      latlng: `${lat},${lng}`,
      key: GOOGLE_MAPS_API_KEY,
    });

    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?${params}`,
      { signal: AbortSignal.timeout(8000) }
    );

    if (!res.ok) return null;

    const data = await res.json();
    if (data.status !== "OK" || !data.results?.length) return null;

    const r = data.results[0];
    const components = r.address_components || [];

    const getComponent = (type: string) =>
      components.find((c: any) => c.types.includes(type))?.long_name || "";

    return {
      formattedAddress: r.formatted_address,
      sublocality: getComponent("sublocality") || getComponent("sublocality_level_1") || getComponent("sublocality_level_2"),
      neighborhood: getComponent("neighborhood"),
      route: getComponent("route"),
      city: getComponent("locality") || getComponent("administrative_area_level_2") || getComponent("administrative_area_level_1"),
      postalCode: getComponent("postal_code"),
      types: r.types || [],
    };
  } catch {
    return null;
  }
}

// ── Nominatim Geocoding (fallback) ──────────────────────────────────

async function nominatimGeocode(
  address: string,
  city: string,
  country: string = "Malaysia"
): Promise<GeocodeResult | null> {
  const query = [address, city, country].filter(Boolean).join(", ");

  try {
    const params = new URLSearchParams({
      q: query, format: "json", limit: "1", countrycodes: "my", addressdetails: "1",
    });
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { "User-Agent": "ERTH-Pickup-App/1.0", Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const results = await res.json();
    if (!Array.isArray(results) || results.length === 0) return null;
    const r = results[0];
    return {
      latitude: parseFloat(r.lat), longitude: parseFloat(r.lon),
      display_name: r.display_name, quality: parseFloat(r.importance || "0.5"),
      source: "nominatim",
    };
  } catch { return null; }
}

// ── Reverse Geocoding (Google primary, Nominatim fallback) ───────────

export interface ReverseGeocodeResult {
  display_name: string;
  area: string;
  road: string;
  city: string;
  postcode: string;
}

const reverseCache = new Map<string, { result: ReverseGeocodeResult | null; ts: number }>();
const REV_CACHE_TTL = 24 * 60 * 60 * 1000;

export async function reverseGeocode(
  lat: number,
  lng: number
): Promise<ReverseGeocodeResult | null> {
  const key = `${lat.toFixed(6)},${lng.toFixed(6)}`;
  const hit = reverseCache.get(key);
  if (hit && Date.now() - hit.ts < REV_CACHE_TTL) return hit.result;

  // Try Google Maps reverse geocoding first
  if (GOOGLE_MAPS_API_KEY) {
    const gr = await googleReverseGeocode(lat, lng);
    if (gr) {
      const result: ReverseGeocodeResult = {
        display_name: gr.formattedAddress,
        area: gr.sublocality || gr.neighborhood,
        road: gr.route,
        city: gr.city,
        postcode: gr.postalCode,
      };
      reverseCache.set(key, { result, ts: Date.now() });
      return result;
    }
  }

  // Fallback to Nominatim
  try {
    const params = new URLSearchParams({
      lat: String(lat), lon: String(lng), format: "json", addressdetails: "1", zoom: "18",
    });
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`, {
      headers: { "User-Agent": "ERTH-Pickup-App/1.0", Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) { reverseCache.set(key, { result: null, ts: Date.now() }); return null; }
    const data = await res.json();
    if (!data || data.error) { reverseCache.set(key, { result: null, ts: Date.now() }); return null; }
    const a = data.address || {};
    const result: ReverseGeocodeResult = {
      display_name: data.display_name || "",
      area: a.suburb || a.neighbourhood || a.quarter || a.residential || a.hamlet || "",
      road: a.road || a.pedestrian || a.path || "",
      city: a.city || a.town || a.village || a.municipality || a.county || "",
      postcode: a.postcode || "",
    };
    reverseCache.set(key, { result, ts: Date.now() });
    return result;
  } catch {
    reverseCache.set(key, { result: null, ts: Date.now() });
    return null;
  }
}

// ── Main geocode function ───────────────────────────────────────────

export async function geocodeAddress(
  address: string,
  city: string,
  country: string = "Malaysia"
): Promise<GeocodeResult | null> {
  const query = [address, city, country].filter(Boolean).join(", ");
  const cacheKey = query.toLowerCase().trim();
  const cached = getCached(cacheKey);
  if (cached !== undefined) return cached;

  if (!address || address.toLowerCase() === "n/a" || address.trim().length < 5) {
    setCache(cacheKey, null);
    return null;
  }

  // Try Google Maps Geocoding API first (ROOFTOP accuracy)
  let result = await googleGeocode(address, city, country);

  // Fallback to Nominatim
  if (!result) result = await nominatimGeocode(address, city, country);

  if (result) {
    // Validate coordinates within Malaysia bounds
    if (result.latitude < 0.5 || result.latitude > 8 || result.longitude < 98 || result.longitude > 120) {
      console.warn(`[geocode] Coordinates outside Malaysia: ${result.latitude}, ${result.longitude}`);
      setCache(cacheKey, null);
      return null;
    }
  }

  setCache(cacheKey, result);
  return result;
}

export async function batchGeocode(
  items: Array<{ address: string; city: string }>,
  onProgress?: (done: number, total: number) => void
): Promise<Map<string, GeocodeResult | null>> {
  const results = new Map<string, GeocodeResult | null>();
  const total = items.length;
  for (let i = 0; i < items.length; i++) {
    const { address, city } = items[i];
    const key = `${address}, ${city}`.toLowerCase().trim();
    if (results.has(key)) continue;
    const result = await geocodeAddress(address, city);
    results.set(key, result);
    onProgress?.(i + 1, total);
    // Rate limit only for Nominatim fallback (Google has higher limits)
    if (!result || result.source === "nominatim") {
      if (i < items.length - 1) await new Promise(r => setTimeout(r, 1100));
    }
  }
  return results;
}

export async function quickGeocode(
  address: string,
  city: string
): Promise<[number, number] | null> {
  const result = await geocodeAddress(address, city);
  if (!result) return null;
  return [result.latitude, result.longitude];
}