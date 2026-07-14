// Zone mapping for Malaysian pickup areas
// Hierarchical: State/Region > Mini Zones
// Zones 1-5: Selangor & KL (default enabled)
// Zones 8-14: Other States (default disabled)
// Zones 100+: User-created custom zones

export interface ZoneDefinition {
  name: string;
  color: string;
  bgColor: string;
  borderColor: string;
  areas: string[];
  isDefaultEnabled: boolean;
  region: string;
}

export const ZONES: Record<number, ZoneDefinition> = {
  // ====== SELANGOR & KL (zones 1-5, default enabled) ======
  1: {
    name: "KL City Centre",
    color: "text-pink-700",
    bgColor: "bg-pink-500/15",
    borderColor: "border-pink-500/30",
    isDefaultEnabled: true,
    region: "Selangor & KL",
    areas: [
      // User-specified core areas
      "klcc", "jalan ampang", "ampang", "setiawangsa", "gombak",
      // KL city core
      "kuala lumpur", "kl", "kl sentral", "bukit bintang", "tun razak",
      "jalan sultan", "chow kit", "masjid jamek", "twin towers",
      "jalan razak", "sentul",
      // KL neighborhoods
      "bangsar", "mid valley", "brickfields", "setapak", "wangsa maju",
      "melawati", "hulu kelang", "keramat", "pandan indah",
      "taman desa", "kuchai lama",
    ]
  },
  2: {
    name: "West Selangor",
    color: "text-cyan-700",
    bgColor: "bg-cyan-500/15",
    borderColor: "border-cyan-500/30",
    isDefaultEnabled: true,
    region: "Selangor & KL",
    areas: [
      // User-specified core areas
      "damansara", "ss1", "ss2", "ttdi", "kepong", "mont kiara",
      "puncak alam", "elmina",
      // Damansara/PJ area
      "petaling jaya", "pj", "subang", "subang jaya", "usj",
      "kelana jaya", "ara damansara", "bandar sunway", "sungai way",
      "ss3", "ss4", "ss7", "tropicana", "kota damansara",
      "mutiara damansara", "bandar utama", "1 utama", "dataran sunway",
      "mentari", "usj heights", "putra heights", "alam budiman",
      // Mont Kiara / Hartamas / TTDI
      "hartamas", "bukit segambut", "taman tun", "bandar manjalara",
      // Kepong / NW
      "jinjang", "bukit jalil",
      // Shah Alam west / Glenmarie
      "bukit jelutong", "glenmarie", "glenmarie shah alam",
      "ttek", "tad",
      // Sungai Buloh / Elmina area
      "sungai buloh", "sg buloh",
    ]
  },
  3: {
    name: "East Selangor",
    color: "text-orange-700",
    bgColor: "bg-orange-500/15",
    borderColor: "border-orange-500/30",
    isDefaultEnabled: true,
    region: "Selangor & KL",
    areas: [
      // User-specified core areas
      "cheras", "kajang", "semenyih", "cyberjaya", "putrajaya",
      "alam damai", "dengkil",
      // Cheras / South-East
      "sg besi", "sungai besi", "seri kembangan", "equine park",
      "taman putra prima", "saujana putra", "bandar bukit puchong",
      // Kajang / Bangi
      "bangi", "bandar baru bangi", "ukm", "serdang",
      "balakong", "sg long", "sungai long", "broga",
      "beranang", "hulu langat",
      // Cyberjaya / Putrajaya surroundings
      "presint", "sg merab", "bangi south",
    ]
  },
  4: {
    name: "Lower Selangor",
    color: "text-rose-700",
    bgColor: "bg-rose-500/15",
    borderColor: "border-rose-500/30",
    isDefaultEnabled: true,
    region: "Selangor & KL",
    areas: [
      // User-specified core areas
      "sepang", "banting", "teluk panglima garang", "kota kemuning",
      "shah alam", "puchong", "klang", "port klang",
      // Shah Alam / Klang corridor
      "setia alam", "meru", "kapar", "pelabuhan klang",
      "pandamaran", "bandar botanic", "bukit tinggi klang",
      "telok gong", "batu tiga", "alam suria",
      "ijok", "bandar puncak alam", "shah alam seksyen",
      "sect 7", "section 7", "sect", "hicom", "uitm shah alam",
      // Puchong / Kinrara
      "kinrara",
      // Sepang / South
      "sepang f1", "labu", "bandar enstek", "klia", "klia2",
      "bbst", "nilai", "mantin",
    ]
  },
  5: {
    name: "Others",
    color: "text-slate-700",
    bgColor: "bg-slate-500/15",
    borderColor: "border-slate-500/30",
    isDefaultEnabled: true,
    region: "Selangor & KL",
    areas: [
      // Far from Cyberjaya - user-specified
      "rawang", "salak tinggi",
      // North Selangor outskirts
      "kuang", "batu arang", "templer park", "kundang", "serendah",
      "batu caves",
      // East Selangor / rural
      "kuala selangor", "jeram", "tanjung karang", "sabak bernam",
      "batang berjuntai", "bestari jaya", "puncak alam north",
      "serta", "hulu yam",
      // Far south
      "bandar baru salak tinggi",
      // Pahang border
      "genting sempah", "bentong", "karak", "raub",
    ]
  },

  // ====== OTHER STATES (default disabled) ======
  8: {
    name: "Johor",
    color: "text-teal-700",
    bgColor: "bg-teal-500/15",
    borderColor: "border-teal-500/30",
    isDefaultEnabled: false,
    region: "Johor",
    areas: [
      "johor bahru", "jb", "iskandar puteri", "nusajaya", "gelang patah",
      "skudai", "tampoi", "ulu tiram", "masai", "pasir gudang",
      "kota tinggi", "kluang", "batu pahat", "muar", "segamat",
      "pontian", "kulai", "senai", "pengerang", "desaru",
      "mersing", "yong peng", "parit raja", "benut", "riang"
    ]
  },
  9: {
    name: "Penang",
    color: "text-sky-700",
    bgColor: "bg-sky-500/15",
    borderColor: "border-sky-500/30",
    isDefaultEnabled: false,
    region: "Penang",
    areas: [
      "georgetown", "penang", "bayan lepas", "bukit mertajam", "butterworth",
      "seberang jaya", "perai", "pulau tikus", "tanjong bungah", "batu ferringhi",
      "air itam", "gelugor", "minden", "relau", "sungai ara",
      "jelutong", "green lane", "usm", "balik pulau", "simpang ampat",
      "nibong tebal", "kulim"
    ]
  },
  10: {
    name: "Perak",
    color: "text-lime-700",
    bgColor: "bg-lime-500/15",
    borderColor: "border-lime-500/30",
    isDefaultEnabled: false,
    region: "Perak",
    areas: [
      "ipoh", "taiping", "teluk intan", "lumut", "sg petani",
      "kuala kangsar", "batu gajah", "kampar", "tapah", "slim river",
      "tanjung malim", "gopeng", "chemor", "tambun", "beruas",
      "parit buntar", "bagan serai", "selama", "lenggong", "gerik"
    ]
  },
  11: {
    name: "Negeri Sembilan & Melaka",
    color: "text-indigo-700",
    bgColor: "bg-indigo-500/15",
    borderColor: "border-indigo-500/30",
    isDefaultEnabled: false,
    region: "Negeri Sembilan & Melaka",
    areas: [
      "seremban", "port dickson", "nilai", "rembau", "tampin",
      "bahau", "kuala pilah", "juasseh", "linggi",
      "melaka", "malacca", "ayer keroh", "bukit beruang", "batu berendam",
      "tangkak", "merlimau", "alor gajah", "masjid tanah", "negeri sembilan"
    ]
  },
  12: {
    name: "Pahang & Terengganu",
    color: "text-fuchsia-700",
    bgColor: "bg-fuchsia-500/15",
    borderColor: "border-fuchsia-500/30",
    isDefaultEnabled: false,
    region: "Pahang & Terengganu",
    areas: [
      "kuantan", "genting", "bentong", "raub", "temerloh",
      "jerantut", "pekan", "rompin", "maran", "mengkuang",
      "kuala terengganu", "kt", "kerteh", "kemaman", "dungun",
      "marang", "setiu", "besut", "hulu terengganu", "cherating"
    ]
  },
  13: {
    name: "Kelantan",
    color: "text-yellow-700",
    bgColor: "bg-yellow-500/15",
    borderColor: "border-yellow-500/30",
    isDefaultEnabled: false,
    region: "Kelantan",
    areas: [
      "kota bharu", "kb", "kubang kerian", "pengkalan chepa", "wakaf bharu",
      "pasir mas", "tumpat", "tanah merah", "machang", "kuala krai",
      "gua musang", "jeli", "bachok", "ketereh", "tok bali"
    ]
  },
  14: {
    name: "Sabah & Sarawak",
    color: "text-emerald-700",
    bgColor: "bg-emerald-500/15",
    borderColor: "border-emerald-500/30",
    isDefaultEnabled: false,
    region: "Sabah & Sarawak",
    areas: [
      "kota kinabalu", "kk", "sandakan", "tawau", "lahad datu",
      "kudat", "penampang", "putatan", "papar",
      "kuching", "miri", "sibu", "bintulu", "sri aman",
      "mukah", "kapit", "limbang", "lawas"
    ]
  }
};

// Starting ID for user-created custom zones
export const CUSTOM_ZONE_START = 100;

// Color palette for custom zones (cycling through)
export const ZONE_COLORS = [
  { color: "text-emerald-700", bgColor: "bg-emerald-500/15", borderColor: "border-emerald-500/30" },
  { color: "text-cyan-700", bgColor: "bg-cyan-500/15", borderColor: "border-cyan-500/30" },
  { color: "text-rose-700", bgColor: "bg-rose-500/15", borderColor: "border-rose-500/30" },
  { color: "text-orange-700", bgColor: "bg-orange-500/15", borderColor: "border-orange-500/30" },
  { color: "text-violet-700", bgColor: "bg-violet-500/15", borderColor: "border-violet-500/30" },
  { color: "text-amber-700", bgColor: "bg-amber-500/15", borderColor: "border-amber-500/30" },
  { color: "text-pink-700", bgColor: "bg-pink-500/15", borderColor: "border-pink-500/30" },
  { color: "text-teal-700", bgColor: "bg-teal-500/15", borderColor: "border-teal-500/30" },
  { color: "text-sky-700", bgColor: "bg-sky-500/15", borderColor: "border-sky-500/30" },
  { color: "text-lime-700", bgColor: "bg-lime-500/15", borderColor: "border-lime-500/30" },
];

export function getZoneColor(index: number) {
  return ZONE_COLORS[index % ZONE_COLORS.length];
}

// Smart zone matching: prevents overly loose matches like "kl" matching "klcc"
function zoneMatch(city: string, area: string): boolean {
  const normalizedCity = city.toLowerCase().trim();
  const normalizedArea = area.toLowerCase().trim();

  // Exact match always wins
  if (normalizedCity === normalizedArea) return true;

  // For short areas (<= 3 chars like "kl", "pj", "jb", "kt"), require word-boundary match
  // This prevents "kl" from matching "klcc" or "pj" from matching "pj utama" incorrectly
  if (normalizedArea.length <= 3) {
    const words = normalizedCity.split(/[\s,\-_/]+/);
    return words.some(w => w === normalizedArea);
  }

  // For longer areas, use contains check — city contains area OR area contains city
  // But require the containing string to have at least 4 chars to avoid tiny matches
  if (normalizedCity.includes(normalizedArea)) return true;
  if (normalizedArea.length >= 4 && normalizedArea.includes(normalizedCity)) return true;

  return false;
}

export function detectZone(city: string, disabledZones: number[] = []): number {
  const normalizedCity = city.toLowerCase().trim();

  for (const [zoneNum, zoneData] of Object.entries(ZONES)) {
    const zoneNumber = parseInt(zoneNum);
    if (disabledZones.includes(zoneNumber)) continue;
    for (const area of zoneData.areas) {
      if (zoneMatch(normalizedCity, area)) {
        return zoneNumber;
      }
    }
  }

  return 5; // Default to "Others" (catch-all for unmatched areas)
}

export async function detectZoneWithCustom(city: string, userId: string): Promise<number> {
  const normalizedCity = city.toLowerCase().trim();

  try {
    const { db } = await import("./db");
    const customAreas = await db.zoneConfig.findMany({ where: { userId } });

    // Get disabled zones from settings
    const disabledZonesSetting = await db.setting.findUnique({
      where: { userId_key: { userId, key: "disabledZones" } },
    });
    const disabledZones: number[] = disabledZonesSetting?.value
      ? JSON.parse(disabledZonesSetting.value)
      : [];

    // Get user zone overrides (for custom zones)
    const userZones = await db.userZone.findMany({ where: { userId } });

    // Check custom (non-excluded) areas first (includes both built-in zone additions and custom zone areas)
    for (const config of customAreas) {
      if (!config.isExcluded && zoneMatch(normalizedCity, config.area)) {
        if (!disabledZones.includes(config.zone)) {
          return config.zone;
        }
      }
    }

    // Check user-created custom zone areas (stored in UserZone with areas JSON)
    for (const uz of userZones) {
      if (uz.isCustom && !disabledZones.includes(uz.zoneId) && uz.areas) {
        for (const area of uz.areas) {
          if (zoneMatch(normalizedCity, area)) {
            return uz.zoneId;
          }
        }
      }
    }

    // Check built-in areas, but skip excluded ones and disabled zones
    const excludedAreas = new Set(
      customAreas.filter(c => c.isExcluded).map(c => c.area)
    );

    for (const [zoneNum, zoneData] of Object.entries(ZONES)) {
      const zoneNumber = parseInt(zoneNum);
      if (disabledZones.includes(zoneNumber)) continue;
      for (const area of zoneData.areas) {
        if (excludedAreas.has(area)) continue;
        if (zoneMatch(normalizedCity, area)) {
          return zoneNumber;
        }
      }
    }
  } catch {
    // Fallback to built-in if db fails
  }

  return detectZone(city);
}

export function getZoneName(zone: number, userZones?: { zoneId: number; name: string }[]): string {
  // Check user overrides first
  if (userZones) {
    const override = userZones.find(uz => uz.zoneId === zone);
    if (override) return override.name;
  }
  return ZONES[zone]?.name || "Unknown";
}

export function getSizePoints(size: string): number {
  switch (size.toUpperCase()) {
    case "S": return 1;
    case "M": return 2;
    case "L": return 3;
    case "XL": return 4;
    case "XXL": return 15;
    default: return 2;
  }
}

export const MAX_DAILY_POINTS = 20;

export const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; borderColor: string; icon: string }> = {
  PENDING:    { label: "Pending",    color: "text-yellow-300", bgColor: "bg-yellow-500/15", borderColor: "border-yellow-500/30", icon: "clock" },
  SCHEDULED:  { label: "Scheduled",  color: "text-cyan-300",   bgColor: "bg-cyan-500/15",   borderColor: "border-cyan-500/30",   icon: "calendar" },
  CONFIRMED:  { label: "Contacted",  color: "text-emerald-300",bgColor: "bg-emerald-500/15", borderColor: "border-emerald-500/30", icon: "check-circle" },
  BOOKED:     { label: "Booked",     color: "text-violet-300", bgColor: "bg-violet-500/15", borderColor: "border-violet-500/30", icon: "bookmark" },
  COMPLETED:  { label: "Completed",  color: "text-slate-400",  bgColor: "bg-slate-500/15",  borderColor: "border-slate-500/30",  icon: "check-check" },
};

export const SIZE_CONFIG: Record<string, { label: string; points: number; color: string }> = {
  S:   { label: "Small",    points: 1,  color: "text-emerald-400" },
  M:   { label: "Medium",   points: 2,  color: "text-amber-400" },
  L:   { label: "Large",    points: 3,  color: "text-rose-400" },
  XL:  { label: "X-Large",  points: 4,  color: "text-purple-400" },
  XXL: { label: "XX-Large", points: 15, color: "text-red-400" },
};
