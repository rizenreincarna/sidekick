/**
 * Coordinate validation — reverse-geocode cross-check.
 *
 * After an address is geocoded, we reverse-geocode the returned lat/lng
 * and compare the result against the original address. This catches
 * cases where the geocoder returns coords in the wrong area.
 *
 * Uses Google Maps reverse geocoding (primary) + Nominatim (fallback).
 */

import { reverseGeocode } from "./geocode";

// ── known Malaysian areas ──────────────────────────────────────────

const KNOWN_AREAS = [
  "bukit jalil","mont kiara","bangsar","mid valley","klcc","kl sentral",
  "puchong","serdang","kajang","semenyih","bangi","nilai","cyberjaya",
  "putrajaya","sepang","rawang","selayang","gombak","batu caves","kepong",
  "segambut","sentul","titiwangsa","wangsa maju","setiawangsa","keramat",
  "damansara","sri hartamas","sri petaling","oug","sungai besi","salak south",
  "bukit bintang","imbi","hang tuah","pudu","chan sow lin","miharja","maluri",
  "cochrane","tun razak","ampang","cheras","setapak","subang","shah alam",
  "klang","petaling jaya","kelana jaya","kota kemuning","usj","bandar sunway",
  "telok panglima garang","balakong","seri kembangan","sungai buloh",
  "cheras perdana","bandar tasik selatan","tasik selatan","taman desa",
  "sri damansara","tropicana","glenmarie","subang jaya","ara damansara",
  "kota damansara","mutiara damansara","damansara perdana","damansara uptown",
  "bangsar south","pantai hillpark","kerinchi","lembah pantai","segambut dalam",
  "taman tun dr ismail","ttdi","desa parkcity","one utama","the curve",
  "ioi city mall","sunway pyramid","midvalley","pavilion","suria klcc",
  "bukit tunku","kenny hills","country heights","mines wellness city",
  "bandar sri damansara","taman ehsan","taman melawati","ulu kelang",
  "gombak setia","batu 9 cheras","bandar mahkota cheras","bandar baru bangi",
  "putra heights","usj heights","one south","kinrara","bandar kinrara",
  "puchong perdana","puchong jaya","puteri puchong","bandar bukit puchong",
  "ioi resort city","dengkil","banting","kuala selangor",
  "sabak bernam","hulu selangor","hulu langat","kuala langat",
  "bandar saujana putra","saujana putra","bsp",
];

// ── validation result ────────────────────────────────────────────────

export interface CoordValidation {
  valid: boolean;
  confidence: "HIGH" | "MEDIUM" | "LOW" | "UNVERIFIED";
  reason: string;
  reverseAddress: string | null;
}

// ── main validator ─────────────────────────────────────────────────

export async function validateCoordinatesForAddress(
  address: string,
  city: string,
  lat: number,
  lng: number
): Promise<CoordValidation> {
  try {
    const reverse = await reverseGeocode(lat, lng);
    if (!reverse) {
      return {
        valid: false,
        confidence: "UNVERIFIED",
        reason: "Could not verify — reverse geocoding unavailable",
        reverseAddress: null,
      };
    }

    const rFull = reverse.display_name.toLowerCase();
    const addrLower = address.toLowerCase();
    const cityLower = city.toLowerCase();

    // ── 1. City check (mandatory) ──────────────────────────────────
    const rCity = reverse.city.toLowerCase();
    const cityOk =
      rCity.includes(cityLower) ||
      cityLower.includes(rCity) ||
      rFull.includes(cityLower);

    if (!cityOk) {
      return {
        valid: false,
        confidence: "LOW",
        reason: `City mismatch: address is in "${city}" but coordinates are in "${reverse.city || "unknown area"}"`,
        reverseAddress: reverse.display_name,
      };
    }

    // ── 2. Area-level checks ───────────────────────────────────────
    let checks = 0;
    let passes = 0;
    const issues: string[] = [];

    // 2a. Known area names (highest weight)
    for (const area of KNOWN_AREAS) {
      if (addrLower.includes(area)) {
        checks += 3;
        if (rFull.includes(area)) {
          passes += 3;
        } else {
          issues.push(`area "${area}" not found at coordinates`);
        }
      }
    }

    // 2b. Building / complex name
    const bldg = addrLower.match(
      /(?:apartment|apartmen|pangsapuri|kondominium|condo(?:minium)?|flat|rumah\s*pangsa|residensi|residence|villa|court|heights|towers?|plaza|square|an[ae]x|annexe|soho)\s+([a-z0-9\s-]+?)(?:\s*,|\s+jalan|\s+no\.|\s+\d{5}|$)/i
    );
    if (bldg?.[1]) {
      const name = bldg[1].trim();
      if (name.length > 2) {
        checks += 2;
        if (rFull.includes(name)) {
          passes += 2;
        } else {
          const words = name.split(/\s+/).filter((w) => w.length > 3);
          const hit = words.some((w) => rFull.includes(w));
          if (hit) passes += 1;
          else issues.push(`building "${bldg[0].trim()}" not found at coordinates`);
        }
      }
    }

    // 2c. Taman / housing estate
    const taman = addrLower.match(
      /(?:taman|tmn)\s+([a-z0-9\s-]+?)(?:\s*,|\s+jalan|\s+no\.|\s+\d{5}|$)/i
    );
    if (taman?.[1]) {
      const name = taman[1].trim();
      if (name.length > 2) {
        checks += 2;
        if (rFull.includes("taman " + name) || rFull.includes("tmn " + name) || rFull.includes(name)) {
          passes += 2;
        } else {
          issues.push(`housing area "Taman ${taman[0].replace(/^taman\s+/i, "").trim()}" not found at coordinates`);
        }
      }
    }

    // 2d. Street name
    const street = addrLower.match(
      /(?:jalan|jln|lorong|lrg)\s+([a-z0-9\s\/-]+?)(?:\s*,|\s+no\.|\s+\d{5}|$)/i
    );
    if (street?.[1]) {
      const name = street[1].trim();
      if (name.length > 2) {
        checks++;
        if (rFull.includes(name) || rFull.includes("jalan " + name)) {
          passes++;
        } else {
          issues.push(`street "Jalan ${name}" not found at coordinates`);
        }
      }
    }

    // ── 3. No specific identifiers → city-level only ───────────────
    if (checks === 0) {
      return {
        valid: true,
        confidence: "MEDIUM",
        reason: `Coordinates confirmed in ${reverse.city || city}. No specific area to cross-reference.`,
        reverseAddress: reverse.display_name,
      };
    }

    // ── 4. Score ───────────────────────────────────────────────────
    const ratio = passes / checks;

    if (ratio >= 0.7) {
      return {
        valid: true,
        confidence: "HIGH",
        reason: "Location verified — address components match coordinates",
        reverseAddress: reverse.display_name,
      };
    }

    if (ratio >= 0.4) {
      return {
        valid: true,
        confidence: "MEDIUM",
        reason: `Partial match: ${issues.join("; ")}`,
        reverseAddress: reverse.display_name,
      };
    }

    return {
      valid: false,
      confidence: "LOW",
      reason: `Coordinates likely WRONG: ${issues.join("; ")}`,
      reverseAddress: reverse.display_name,
    };
  } catch (err) {
    return {
      valid: false,
      confidence: "UNVERIFIED",
      reason: `Validation error: ${err instanceof Error ? err.message : "unknown"}`,
      reverseAddress: null,
    };
  }
}