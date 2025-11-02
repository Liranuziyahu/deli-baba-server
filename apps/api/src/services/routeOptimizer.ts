// apps/api/src/services/routeOptimizer.ts
import { z } from "zod";

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
 * חישוב מרחק בקו אווירי (Haversine formula)
 */
function haversineDistance(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371; // רדיוס כדור הארץ בק"מ
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;

  const aH =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(aH), Math.sqrt(1 - aH));
  return R * c;
}

/**
 * אלגוריתם Nearest Neighbor
 * עם תמיכה בנקודת התחלה (startId)
 */
export function optimizeRoute(points: { id: number; lat: number; lng: number }[], startId?: number) {
  if (points.length < 2) return { optimizedOrder: points.map((p) => p.id), totalDistanceKm: 0 };

  // העתק של כל הנקודות
  const remaining = [...points];
  const routeOrder: number[] = [];
  let totalDistance = 0;

  // אם יש startId - נתחיל ממנה, אחרת מהראשונה
  let currentIndex = 0;
  if (startId) {
    const startIndex = remaining.findIndex((p) => p.id === startId);
    if (startIndex >= 0) {
      currentIndex = startIndex;
    }
  }

  let current = remaining.splice(currentIndex, 1)[0];
  routeOrder.push(current.id);

  while (remaining.length > 0) {
    // מוצאים את הנקודה הקרובה ביותר
    let nearestIdx = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const dist = haversineDistance(current, remaining[i]);
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
