// Address verification using the app's configured AI (Ollama proxy via chatWithDeepSeek)
// + Nominatim (OpenStreetMap) geocoding. No external SDK dependency.

import { chatWithDeepSeek, isAiEnabled, type ChatMessage } from "./deepseek";
import { geocodeAddress } from "./geocode";
import { db } from "./db";

/**
 * Residential keyword patterns for Malaysian addresses.
 * These are strong signals that an address is a private home, NOT an office.
 *
 * Malay/English terms for housing types:
 *   pangsapuri, kondominium, apartment, flat, rumah pangsa, residensi,
 *   residence (as building name, not just "Jalan Residence"),
 *   condo, kondominium, townhouse, studio (when followed by "unit" or "suite")
 *
 * "Taman" = housing estate/neighbourhood in Malay — almost exclusively residential.
 *   BUT "Taman" can appear in commercial names too ("Taman Desa Business Park").
 *   Rule: if Taman appears WITHOUT "business", "industrial", "perindustrian",
 *   "komersial", "niaga" nearby → it's residential.
 *
 * Multi-word patterns that indicate an apartment/condo complex:
 *   "Blok [A-Z]" + "Pangsapuri" or "Apartment"
 *   "No. [0-9]" + "Jalan" + "[Taman ...]"  (standard Malaysian house address)
 *   "Unit" + "Pangsapuri/Kondominium/Apartment"
 */

const RESIDENTIAL_KEYWORDS = [
  "pangsapuri", "kondominium", "apartment", "apartmen",
  "flat", "rumah pangsa", "rumah flat", "rumah teres",
  "residensi", "kondominium", "townhouse", "town house",
  "studio unit", "studio apartment", "serviced apartment",
  "servis apartment", "rumah bandar",
];

const RESIDENTIAL_TAMAN_EXCLUDERS = [
  "business", "industrial", "perindustrian", "komersial",
  "niaga", "perniagaan", "perdagangan", "trade",
  "park", "centre", "center", "square", "plaza",
  "office", "kedai", "shop",
];

const COMPANY_NAME_INDICATORS = [
  "sdn bhd", "bhd", "enterprise", "trading", "trading co",
  "resources", "holdings", "group", "corporation", "corp",
  "technologies", "technology", "services", "solution",
  "global", "international", "marketing", "distribution",
  "logistics", "freight", "shipping", "forwarders",
  "construction", "engineering", "manufacturing",
  "pharmacy", "pharmaceutical", "medical centre", "hospital",
  "clinic", "dental", "optic", "optical",
  "restaurant", "cafe", "kopitiam", "kedai", "mini market",
  "hypermarket", "supermarket", "mart", "store",
  "hotel", "motel", "resort", "hostel",
  "bank", "finance", "insurance", "takaful",
  "academy", "institute", "college", "school", "sekolah",
  "university", "universiti", "uitm", "kolej",
  "consultancy", "associates", "associate",
  "laundry", "dobi", "salon", "barber",
  "workshop", "bengkel", "tyre", "tayar",
  "studio" /* photography/yoga studio, not apartment */,
].map(s => s.toLowerCase());

/**
 * Detect if the address text strongly indicates a residential building.
 * Returns true if we're confident it's residential (not an office).
 * Used as a pre-filter BEFORE the expensive AI call.
 */
function isLikelyResidential(address: string, city: string, customerName?: string): boolean {
  const lower = `${address} ${city}`.toLowerCase();

  // 1. Direct residential building type keywords
  for (const kw of RESIDENTIAL_KEYWORDS) {
    if (lower.includes(kw)) return true;
  }

  // 2. "Blok [A-Z]" pattern + residential context
  //    "Blok B" or "Block B" near apartment/condo terms
  const blockMatch = lower.match(/\bbl(?:o[ck][ck]?)?\s+([A-Za-z0-9]+)/i);
  if (blockMatch) {
    // Check if nearby words indicate apartment block
    const afterBlock = lower.substring(lower.indexOf(blockMatch[0]) + blockMatch[0].length).trim().substring(0, 80);
    if (/pangsapuri|kondominium|apartment|flat|rumah|taman/i.test(afterBlock)) return true;
  }

  // 3. "Taman" without commercial excluders
  if (/\btaman\b/i.test(lower)) {
    let isCommercial = false;
    for (const ex of RESIDENTIAL_TAMAN_EXCLUDERS) {
      if (lower.includes(ex)) { isCommercial = true; break; }
    }
    if (!isCommercial) return true;
  }

  // 4. "No.X, Jalan Y, Taman Z" — standard Malaysian house address pattern
  if (/\bno\.?\s*\d+.*jalan.*taman/i.test(lower)) return true;

  // 5. "Unit X-Y, Pangsapuri/Kondominium/Apartment" pattern
  if (/\bunit\s+[A-Za-z]?\s*-?\s*\d+.*(pangsapuri|kondominium|apartment)/i.test(lower)) return true;

  // 6. If customer name looks like a personal name (not a company), it's likely residential.
  //    Company indicators: Sdn Bhd, Enterprise, Trading, etc.
  //    Personal names: single/multiple words without company suffixes
  if (customerName && customerName.trim()) {
    const nameLower = customerName.toLowerCase();
    let looksLikeCompany = false;
    for (const ci of COMPANY_NAME_INDICATORS) {
      if (nameLower.includes(ci)) { looksLikeCompany = true; break; }
    }
    // If it's NOT a company and the address has residential markers, it's residential
    if (!looksLikeCompany) {
      // Additional check: if the name looks like a phone number (only digits/+/-), skip
      if (/^[\d\s\-\+\(\)]+$/.test(customerName.trim())) {
        // Phone number as name → ambiguous, don't use name for residential detection
      } else {
        // Personal name + no company indicators → likely residential
        return true;
      }
    }
  }

  return false;
}

export { isLikelyResidential };

export interface AddressVerificationResult {
  verified: boolean;
  confidence: "high" | "medium" | "low";
  note: string;
  normalizedAddress?: string;
  suggestedCity?: string;
  suggestedZone?: number;
  suggestedIsOffice?: boolean;
}

/**
 * Verify a Malaysian address using:
 *   1. Nominatim geocoding — if the address resolves to coordinates inside Malaysia,
 *      it's a real, locatable address (strong "verified" signal).
 *   2. The configured AI (Ollama proxy) — analyzes the address text for
 *      validity/duplicates/city/zone and suggests a normalized form.
 *
 * Falls back to AI-only if geocoding fails, and to geocode-only if AI is disabled.
 */
export async function verifyAddress(
  address: string,
  city: string,
  customerName?: string
): Promise<AddressVerificationResult> {
  // Step 1: Geocode via Google Maps (primary) / Nominatim (fallback)
  let geoOk = false;
  let geoNote = "";
  let geoTypes: string[] = [];
  let geoSource = "";
  let geoQuality = 0;
  try {
    const geo = await geocodeAddress(address, city);
    if (geo) {
      geoOk = true;
      geoSource = geo.source;
      geoQuality = geo.quality;
      geoTypes = geo.types || [];
      const typeHint = geoTypes.length > 0 ? ` [types: ${geoTypes.join(", ")}]` : "";
      geoNote = `Located via ${geoSource}: ${geo.display_name.slice(0, 160)}${typeHint}`;
    } else {
      geoNote = "Address could not be located on the map.";
    }
  } catch {
    geoNote = "Geocoding unavailable.";
  }

  // Google Maps place types that indicate commercial/office locations
  const commercialTypes = [
    "establishment", "point_of_interest", "store", "shopping_mall",
    "finance", "bank", "hospital", "doctor", "pharmacy",
    "school", "university", "local_government_office", "courthouse",
    "restaurant", "cafe", "meal_takeaway", "meal_delivery",
    "factory", "warehouse", "car_repair", "lodging", "hotel",
    "real_estate_agency", "insurance_agency", "travel_agency",
    "beauty_salon", "hair_care", "spa", "gym", "amusement_park",
    "movie_rental", "movie_theater", "art_gallery", "museum",
    "library", "city_hall", "post_office", "police", "fire_station",
    "place_of_worship", "cemetery", "parking", "gas_station",
    "car_dealer", "car_wash", "car_rental", "storage",
    "electrician", "plumber", "roofing_contractor", "general_contractor",
    "locksmith", "moving_company", "laundry", "dry_cleaning",
    "veterinary_care", "dentist", "health", "physiotherapist",
  ];
  const isCommercialFromGoogle = geoSource === "google" && geoTypes.some(t => commercialTypes.includes(t));
  const isResidentialFromGoogle = geoSource === "google" && (
    geoTypes.includes("street_address") ||
    geoTypes.includes("premise") ||
    geoTypes.includes("subpremise")
  ) && !isCommercialFromGoogle;

  // Step 2: AI analysis (validity/duplicates/city/zone normalization)
  let ai: Partial<AddressVerificationResult> = {};
  if (await isAiEnabled()) {
    try {
      ai = await analyzeWithAi(address, city, geoOk, geoNote, customerName, geoTypes, isCommercialFromGoogle, isResidentialFromGoogle);
    } catch (error) {
      console.error("[address-verify] AI analysis error:", error);
    }
  }

  // Combine: geocode is the strongest "real address" signal; AI enriches/normalizes.
  const verified = geoOk || Boolean(ai.verified);
  const confidence: "high" | "medium" | "low" =
    geoOk && ai.verified ? "high" : verified ? "medium" : "low";

  const noteParts = [geoNote, ai.note].filter(Boolean);
  return {
    verified,
    confidence,
    note: noteParts.join(" ") || "Address analysis completed.",
    normalizedAddress: ai.normalizedAddress || undefined,
    suggestedCity: ai.suggestedCity || undefined,
    suggestedZone: ai.suggestedZone || undefined,
    suggestedIsOffice: ai.suggestedIsOffice,
  };
}

async function analyzeWithAi(
  address: string,
  city: string,
  geoOk: boolean,
  geoNote: string,
  customerName: string | undefined,
  geoTypes: string[],
  isCommercialFromGoogle: boolean,
  isResidentialFromGoogle: boolean
): Promise<AddressVerificationResult> {
  // Pre-filter: if the address text clearly indicates a residential building,
  // skip the AI call for office detection entirely — saves cost and avoids misclassification.
  const definitelyResidential = isLikelyResidential(address, city, customerName);

  const messages: ChatMessage[] = [
    {
      role: "user",
      content: `Verify this Malaysian address for an e-waste pickup service (Selangor, KL, surroundings).

Address: ${address}
City: ${city}
Customer name: ${customerName || "not provided"}
Map geocoding: ${geoOk ? "FOUND — " + geoNote : "NOT found"}
Google Maps place types: ${geoTypes.length > 0 ? geoTypes.join(", ") : "none"}
Commercial signal from Google Maps: ${isCommercialFromGoogle ? "YES — Google identifies this as a commercial/business location" : isResidentialFromGoogle ? "NO — Google identifies this as a residential address" : "unclear"}

Analyze and determine:
1. Is this a valid, real address in Malaysia?
2. Are there duplicate/garbled parts (common in Encore CSV exports)?
3. Suggest a cleaned-up address, a better city, and the correct zone.
4. Is this an OFFICE or commercial/business pickup location?

OFFICE/COMMERCIAL means (suggestedIsOffice = true):
  - Named office building, corporate tower, serviced office, business centre
  - Government building (Jabatan, Pejabat, Kementerian, Mahkamah)
  - University, college, school, hospital, clinic
  - Shopping mall, retail shop, restaurant, cafe, kedai
  - Factory, warehouse, workshop, bengkel
  - Hotel, bank, insurance office
  - Any pickup at a business where you'd go during working hours
  - Customer name sounds like a company (Sdn Bhd, Enterprise, Trading, etc.)

RESIDENTIAL means (suggestedIsOffice = false):
  - Condominium / Kondominium / Condo — ALWAYS residential
  - Apartment / Apartmen / Pangsapuri — ALWAYS residential
  - Flat / Rumah Pangsa / Rumah Flat — ALWAYS residential
  - Townhouse / Rumah Bandar / Rumah Teres — ALWAYS residential
  - Serviced Apartment / Servis Apartment — ALWAYS residential (people live there)
  - Residensi / Residence — ALWAYS residential
  - Any address in a "Taman" (housing estate) — ALWAYS residential
  - Standard house: "No.X, Jalan Y, Taman Z" format — ALWAYS residential
  - "Blok [A-Z]" followed by apartment/condo name — ALWAYS residential
  - Customer name is a regular person's name (not a company) — ALMOST CERTAINLY residential

MALAYSIAN-SPECIFIC RULES:
  - "Pangsapuri" and "Kondominium" are NEVER offices — they're multi-story residential flats
  - "Taman" (unless followed by "Perindustrian", "Business Park", "Niaga") = housing estate = residential
  - Even if the customer name has "Enterprise" or "Trading", if the ADDRESS says "Pangsapuri" or "Taman" → it's STILL residential (home business, not office pickup)
  - "Serviced Apartment" / "Servis Apartment" is people's homes with hotel-like services — RESIDENTIAL
  - "Residensi" and "Residence" are apartment branding, not office buildings

Common Encore issues: duplicate parts ("No.15, Persiaran, 15 Persiaran"), missing postcode, abbreviated streets, incomplete (area only).

Respond in JSON ONLY (no markdown, no prose):
{
  "verified": boolean,
  "confidence": "high" | "medium" | "low",
  "note": "Brief explanation",
  "normalizedAddress": "Cleaned address or null",
  "suggestedCity": "Better city or null",
  "suggestedZone": zone number or null,
  "suggestedIsOffice": boolean
}

Zones: 1=KL City Centre, 2=West Selangor, 3=East Selangor, 4=Lower Selangor, 5=Others, 8=Johor, 9=Penang, 10=Perak, 11=Negeri Sembilan/Melaka, 12=Pahang/Terengganu, 13=Kelantan, 14=Sabah/Sarawak

An address is "verified" if it appears real/locatable even with minor formatting issues. Only unverified if clearly incomplete, nonsensical, or unmatched to any known area.`,
    },
  ];

  const res = await chatWithDeepSeek(messages);
  const content = res.content || "";
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      verified: false,
      confidence: "low",
      note: "AI analysis incomplete.",
      suggestedIsOffice: definitelyResidential ? false : undefined,
    };
  }
  try {
    const r = JSON.parse(jsonMatch[0]) as AddressVerificationResult;
    const zoneRaw = r.suggestedZone as unknown;
    let suggestedZone: number | undefined;
    if (typeof zoneRaw === "number") {
      suggestedZone = zoneRaw;
    } else if (typeof zoneRaw === "string" && zoneRaw.trim()) {
      const parsed = parseInt(zoneRaw, 10);
      if (!isNaN(parsed)) suggestedZone = parsed;
    }

    // Pre-filter overrides AI for residential: if our keyword check says residential,
    // NEVER trust the AI if it claims otherwise. Condos are NOT offices.
    let officeResult = r.suggestedIsOffice;
    if (definitelyResidential && officeResult === true) {
      officeResult = false;
    }
    // Google Maps commercial type override: if Google explicitly identifies the
    // place as a commercial/office establishment, trust that signal.
    if (isCommercialFromGoogle && officeResult === false && !definitelyResidential) {
      officeResult = true;
    }

    return {
      verified: Boolean(r.verified),
      confidence: r.confidence || "low",
      note: r.note || "AI analysis completed.",
      normalizedAddress: r.normalizedAddress || undefined,
      suggestedCity: r.suggestedCity || undefined,
      suggestedZone,
      suggestedIsOffice: officeResult,
    };
  } catch {
    return {
      verified: false,
      confidence: "low",
      note: "Could not parse AI result.",
      suggestedIsOffice: definitelyResidential ? false : undefined,
    };
  }
}

/**
 * Verify an order's address and update the database
 */
export async function verifyOrderAddress(
  orderId: string
): Promise<AddressVerificationResult & { updated: boolean }> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { address: true, city: true, customerName: true },
  });

  if (!order) {
    return { verified: false, confidence: "low", note: "Order not found", updated: false };
  }

  const result = await verifyAddress(order.address, order.city, order.customerName);

  const updateData: {
    addressVerified: boolean;
    addressVerificationNote: string;
    address?: string;
    city?: string;
    zone?: number;
    isOffice?: boolean;
  } = {
    addressVerified: result.verified,
    addressVerificationNote: `[${result.confidence.toUpperCase()}] ${result.note}`,
  };

  if (result.normalizedAddress && result.normalizedAddress !== order.address) {
    updateData.address = result.normalizedAddress.substring(0, 500);
  }
  if (result.suggestedCity && result.suggestedCity !== order.city) {
    updateData.city = result.suggestedCity.substring(0, 100);
  }
  if (result.suggestedZone && result.suggestedZone > 0) {
    updateData.zone = result.suggestedZone;
  }
  if (result.suggestedIsOffice !== undefined) {
    updateData.isOffice = result.suggestedIsOffice;
  }

  try {
    await db.order.update({
      where: { id: orderId },
      data: updateData,
    });
    return { ...result, updated: true };
  } catch (error) {
    console.error("[address-verify] DB update error:", error);
    return { ...result, updated: false };
  }
}

/**
 * Batch verify addresses for multiple orders with rate limiting.
 */
export async function batchVerifyOrderAddresses(
  orderIds: string[],
  options?: { onProgress?: (done: number, total: number) => void }
): Promise<{ verified: number; unverified: number; failed: number }> {
  let verified = 0;
  let unverified = 0;
  let failed = 0;

  for (let i = 0; i < orderIds.length; i++) {
    try {
      const result = await verifyOrderAddress(orderIds[i]);
      if (result.verified) verified++;
      else unverified++;
    } catch {
      failed++;
    }

    options?.onProgress?.(i + 1, orderIds.length);

    // Rate limit: respect Nominatim (~1 req/s) + AI limits
    if (i < orderIds.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }

  return { verified, unverified, failed };
}