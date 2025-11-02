import Redis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const CACHE_TTL_SECONDS = 60 * 60 * 24; // cache ליום
const MAX_DAILY_CALLS = 2500; // 🧱 הגבלת בטיחות יומית לקריאות Google API

/**
 * חישוב מרחק בין שתי נקודות בקילומטרים
 */
export async function getDistanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): Promise<number> {
  const cacheKey = `dist:${a.lat},${a.lng}->${b.lat},${b.lng}`;

  // 🔹 1. בדיקה ב־Redis Cache
  const cached = await redis.get(cacheKey);
  if (cached) {
    console.log(`📦 Redis cache hit → ${cacheKey} = ${cached} km`);
    return parseFloat(cached);
  }

  // 🔹 2. ספירת קריאות יומית
  const todayKey = `google_calls:${new Date().toISOString().slice(0, 10)}`;
  const callsToday = await redis.incr(todayKey);
  await redis.expire(todayKey, 60 * 60 * 24); // פג תוקף יומי

  if (callsToday > MAX_DAILY_CALLS) {
    console.warn(`🚨 Google API daily limit reached (${callsToday}/${MAX_DAILY_CALLS})`);
    const fallbackKm = haversineDistance(a, b);
    console.log(`🧭 Offline fallback (limit exceeded) → ${cacheKey} = ${fallbackKm.toFixed(2)} km`);
    return fallbackKm;
  }

  // התראה כשמתקרבים למכסה
  if (callsToday % 100 === 0 || callsToday > MAX_DAILY_CALLS * 0.9) {
    console.log(`📊 Google API calls today: ${callsToday}/${MAX_DAILY_CALLS}`);
  }

  // 🔹 3. ניסיון מול Google API
  if (GOOGLE_API_KEY) {
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${a.lat},${a.lng}&destinations=${b.lat},${b.lng}&key=${GOOGLE_API_KEY}`;
    try {
      const res = await fetch(url);
      const data = await res.json();

      if (data.status === "OK" && data.rows?.[0]?.elements?.[0]?.status === "OK") {
        const meters = data.rows[0].elements[0].distance.value;
        const km = meters / 1000;
        console.log(`🌍 Google API → ${cacheKey} = ${km.toFixed(2)} km`);
        await redis.setex(cacheKey, CACHE_TTL_SECONDS, km.toFixed(2));
        return km;
      } else {
        console.warn(`⚠️ Google API failed → ${data.status}`);
      }
    } catch (err) {
      console.error("🚨 Error fetching from Google API:", err);
    }
  } else {
    console.warn("⚠️ GOOGLE_MAPS_API_KEY missing → falling back to offline calculation");
  }

  // 🔹 4. Fallback Offline
  const fallbackKm = haversineDistance(a, b);
  console.log(`🧭 Offline fallback → ${cacheKey} = ${fallbackKm.toFixed(2)} km`);
  await redis.setex(cacheKey, CACHE_TTL_SECONDS, fallbackKm.toFixed(2));
  return fallbackKm;
}

/**
 * חישוב בקו אווירי (Haversine formula)
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
