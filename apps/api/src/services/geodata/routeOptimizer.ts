import { z } from "zod";
import { getDistanceKm } from "./distance.service";

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
 * כעת כולל גם חישוב ETA כולל (בדקות)
 */
export async function optimizeRoute(
  points: { id: number; lat: number; lng: number }[],
  startId?: number
) {
  if (points.length < 2) {
    return { optimizedOrder: points.map((p) => p.id), totalDistanceKm: 0, totalDurationMin: 0 };
  }

  // העתק של כל הנקודות
  const remaining = [...points];
  const routeOrder: number[] = [];
  let totalDistance = 0;
  let totalDuration = 0; // ✅ נוסף – סה״כ זמן כולל (בדקות)

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

    for (let i = 0; i < remaining.length; i++) {
      const dist = await getDistanceKm(current, remaining[i]); // ✅ שימוש ב־service הקיים
      if (dist < nearestDist) {
        nearestIdx = i;
        nearestDist = dist;
      }
    }

    totalDistance += nearestDist;

    // ✅ נוסיף גם הערכה לזמן (ETA) לפי מהירות ממוצעת – למשל 40 קמ״ש
    const avgSpeedKmH = 40;
    const legDurationMin = (nearestDist / avgSpeedKmH) * 60;
    totalDuration += legDurationMin;

    current = remaining.splice(nearestIdx, 1)[0];
    routeOrder.push(current.id);
  }

  // ✅ נוספה החזרה גם של זמן כולל (ETA כולל)
  return {
    optimizedOrder: routeOrder,
    totalDistanceKm: Number(totalDistance.toFixed(2)),
    totalDurationMin: Number(totalDuration.toFixed(0)), // זמן כולל משוער
  };
}
