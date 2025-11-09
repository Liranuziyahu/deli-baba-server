import crypto from "crypto";
import { cache } from "./cache.service";
import dotenv from "dotenv";

dotenv.config();

const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 7; // קאש לשבוע
const MAX_DAILY_CALLS = Number(process.env.GOOGLE_API_MAX_DAILY || 2500);

/**
 * המרת כתובת לקואורדינטות עם Cache, Rate Limit ו־Alerts
 */
export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  if (!address || address.trim().length < 3) return null;

  const addressHash = sha1(address.toLowerCase());
  const cacheKey = `geo:${addressHash}`;

  // 1️⃣ בדוק בקאש
  const cached = await cache.get(cacheKey);
  if (cached) {
    console.log(`📦 Redis cache hit → ${address} = ${cached}`);
    return JSON.parse(cached);
  }

  // 2️⃣ ספירת קריאות יומית
  const { callsToday } = await cache.incrDailyCounter("google_geocode_calls");

  // 🚨 מגבלת שימוש יומית
  if (callsToday > MAX_DAILY_CALLS) {
    console.warn(`🚨 Google Geocoding API daily limit reached (${callsToday}/${MAX_DAILY_CALLS})`);
    return null;
  }

  // 🟨 התראה כשמתקרבים למכסה
  if (callsToday % 100 === 0 || callsToday > MAX_DAILY_CALLS * 0.9) {
    console.log(`📊 Google Geocoding API calls today: ${callsToday}/${MAX_DAILY_CALLS}`);
  }

  // 3️⃣ בדוק אם יש מפתח API
  if (!GOOGLE_API_KEY) {
    console.warn("⚠️ GOOGLE_MAPS_API_KEY missing → cannot geocode");
    return null;
  }

  // 4️⃣ קריאה ל־Google Maps Geocoding API
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_API_KEY}`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (data.status === "OK" && data.results?.length > 0) {
      const { lat, lng } = data.results[0].geometry.location;
      console.log(`📍 Google API - Geocoded "${address}" → ${lat},${lng}`);
      await cache.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify({ lat, lng }));
      return { lat, lng };
    } else {
      console.warn(`⚠️ Google - Geocoding failed for "${address}" → ${data.status}`);
      return null;
    }
  } catch (err) {
    console.error("🚨 Error fetching Google Geocode:", err);
    return null;
  }
}

export async function geocodeBatch(addresses: string[]): Promise<
  { address: string; lat: number | null; lng: number | null; status: string }[]
> {
  if (!Array.isArray(addresses) || addresses.length === 0) return [];

  const results: { address: string; lat: number | null; lng: number | null; status: string }[] = [];

  for (const address of addresses) {
    const coords = await geocodeAddress(address);
    if (coords) {
      results.push({ address, lat: coords.lat, lng: coords.lng, status: "OK" });
    } else {
      results.push({ address, lat: null, lng: null, status: "FAILED" });
    }
  }

  return results;
}

/**
 * 🧮 פונקציה ליצירת hash לכתובת (להקטנת גודל המפתח בקאש)
 */
function sha1(str: string): string {
  return crypto.createHash("sha1").update(str).digest("hex");
}
