import dotenv from "dotenv";
import { cache } from "./cache.service"; // ✅ שימוש בשירות הקיים שלך

dotenv.config();

/**
 * ⚙️ קונפיגורציה כללית
 */
const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const CACHE_TTL_SECONDS = 60 * 60 * 24; // cache ליום
const MAX_DAILY_CALLS = Number(process.env.GOOGLE_API_MAX_DAILY || 2500);
const URBAN_CORRECTION_FACTOR = Number(process.env.URBAN_DISTANCE_FACTOR || 1.0);

/**
 * 📏 חישוב מרחק בין שתי נקודות (עם cache, rate limit ו־fallback)
 */
export async function getDistanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): Promise<number> {
  const cacheKey = `dist:${a.lat},${a.lng}->${b.lat},${b.lng}`;

  // ✅ 1. בדיקה ב־Cache
  const cached = await cache.get(cacheKey);
  if (cached) {
    console.log(`📦 Redis cache hit → ${cacheKey} = ${cached} km`);
    return parseFloat(cached);
  }

  // ✅ 2. ספירת קריאות יומית
  const { callsToday } = await cache.incrDailyCounter("google_calls");

  if (callsToday > MAX_DAILY_CALLS) {
    console.warn(`🚨 Google API daily limit reached (${callsToday}/${MAX_DAILY_CALLS})`);
    const fallbackKm = applyCorrection(haversineDistance(a, b));
    await cache.setex(cacheKey, CACHE_TTL_SECONDS, fallbackKm.toFixed(2));
    return fallbackKm;
  }

  // 🟨 התראה כשמתקרבים למכסה
  if (callsToday % 100 === 0 || callsToday > MAX_DAILY_CALLS * 0.9) {
    console.log(`📊 Google API calls today: ${callsToday}/${MAX_DAILY_CALLS}`);
  }

  // ✅ 3. ניסיון מול Google API עם retry/backoff
  if (GOOGLE_API_KEY) {
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${a.lat},${a.lng}&destinations=${b.lat},${b.lng}&key=${GOOGLE_API_KEY}`;

    try {
      const data = await fetchWithRetry(url, 3, 1000);
      if (data?.status === "OK" && data.rows?.[0]?.elements?.[0]?.status === "OK") {
        const meters = data.rows[0].elements[0].distance.value;
        const km = meters / 1000;
        console.log(`🌍 Google API → ${cacheKey} = ${km.toFixed(2)} km`);
        await cache.setex(cacheKey, CACHE_TTL_SECONDS, km.toFixed(2));
        return km;
      } else {
        console.warn(`⚠️ Google API returned invalid status → ${data?.status}`);
      }
    } catch (err) {
      console.error("🚨 Error fetching from Google API:", err);
    }
  } else {
    console.warn("⚠️ GOOGLE_MAPS_API_KEY missing → using offline fallback");
  }

  // ✅ 4. Fallback (Offline Haversine)
  const fallbackKm = applyCorrection(haversineDistance(a, b));
  console.log(`🧭 Offline fallback → ${cacheKey} = ${fallbackKm.toFixed(2)} km`);
  await cache.setex(cacheKey, CACHE_TTL_SECONDS, fallbackKm.toFixed(2));
  return fallbackKm;
}

/**
 * 🌐 Fetch עם retry ו־backoff
 */
async function fetchWithRetry(url: string, retries = 3, delay = 1000): Promise<any> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch (err) {
      if (i === retries - 1) throw err;
      console.warn(`⚠️ Fetch failed (${i + 1}/${retries}), retrying in ${delay * (i + 1)}ms...`);
      await new Promise((r) => setTimeout(r, delay * (i + 1)));
    }
  }
}

/**
 * 📐 נוסחת Haversine – חישוב בקו אווירי
 */
function haversineDistance(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;

  const aH =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(aH), Math.sqrt(1 - aH));
  return R * c;
}

/**
 * 🧮 תיקון עירוני למרחקים (אם מופעל)
 */
function applyCorrection(km: number): number {
  return km * URBAN_CORRECTION_FACTOR;
}
