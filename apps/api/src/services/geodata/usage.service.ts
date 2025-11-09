import { cache } from "./cache.service";

const MAX_DAILY_CALLS_GLOBAL = Number(process.env.GOOGLE_API_MAX_DAILY_GLOBAL || 5000);

/**
 * 🧮 ספירה וניטור כלליים של קריאות Google API (Geocode + Distance)
 */
export async function trackGoogleApiUsage(serviceName: "geocode" | "distance") {
  // ספירה לפי שירות
  const { callsToday: serviceCalls } = await cache.incrDailyCounter(`google_${serviceName}_calls`);

  // ספירה כוללת
  const { callsToday: totalCalls } = await cache.incrDailyCounter("google_api_total_calls");

  // 🚨 בדיקה אם עברנו מגבלה כוללת
  if (totalCalls > MAX_DAILY_CALLS_GLOBAL) {
    console.warn(`🚨 Global Google API limit reached (${totalCalls}/${MAX_DAILY_CALLS_GLOBAL})`);
    return { exceeded: true, serviceCalls, totalCalls };
  }

  // 🟨 התראה כשמתקרבים למכסה הכוללת
  if (totalCalls % 100 === 0 || totalCalls > MAX_DAILY_CALLS_GLOBAL * 0.9) {
    console.log(`📊 Global Google API usage: ${totalCalls}/${MAX_DAILY_CALLS_GLOBAL}`);
  }

  return { exceeded: false, serviceCalls, totalCalls };
}
