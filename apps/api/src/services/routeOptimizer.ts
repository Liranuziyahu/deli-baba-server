import { z } from "zod";
import { getDistanceKm } from "./distanceService";

/**
 * סכימת קלט - נקודות עם lat/lng + אפשרות לנקודת התחלה
 */
export const optimizeInput = z.object({
  startId: z.number().int().positive().optional(),
  points: z
    .array(
      z.object({
        id: z.number().int().positive(),
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
      })
    )
    .min(2, "At least 2 points are required"),
});

/**
 * אלגוריתם Nearest Neighbor עם Distance Matrix + fallback
 */
export async function optimizeRoute(points: { id: number; lat: number; lng: number }[], startId?: number) {
  if (points.length < 2) {
    return { optimizedOrder: points.map((p) => p.id), totalDistanceKm: 0 };
  }

  // העתק של כל הנקודות
  const remaining = [...points];
  const routeOrder: number[] = [];
  let totalDistance = 0;

  // אם יש startId – נתחיל ממנה
  let currentIndex = 0;
  if (startId) {
    const startIndex = remaining.findIndex((p) => p.id === startId);
    if (startIndex >= 0) currentIndex = startIndex;
  }

  // נבחר את נקודת ההתחלה
  let current = remaining.splice(currentIndex, 1)[0];
  routeOrder.push(current.id);

  // נחשב את כל המרחקים לפי הקרובה ביותר
  while (remaining.length > 0) {
    let nearestIdx = 0;
    let nearestDist = Infinity;

    // לולאה למציאת הנקודה הקרובה ביותר לפי Distance Matrix
    for (let i = 0; i < remaining.length; i++) {
      const dist = await getDistanceKm(current, remaining[i]); // ✅ שימוש ב־service החדש
      if (dist < nearestDist) {
        nearestIdx = i;
        nearestDist = dist;
      }
    }

    totalDistance += nearestDist;
    current = remaining.splice(nearestIdx, 1)[0];
    routeOrder.push(current.id);
  }

  return {
    optimizedOrder: routeOrder,
    totalDistanceKm: Number(totalDistance.toFixed(2)),
  };
}
