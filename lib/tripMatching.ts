import { fetchAvailableTrips, type Trip } from './trips';

const RADIUS_MILES = 5;
const TIME_WINDOW_HOURS = 24;

function distanceMi(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export type MatchedTrip = Trip & {
  match_score: number;
  origin_distance_mi: number;
  destination_distance_mi: number;
};

export async function findMatchingTrips(params: {
  pickupLat: number;
  pickupLng: number;
  destinationLat: number;
  destinationLng: number;
  withinHours?: number;
}): Promise<MatchedTrip[]> {
  const { pickupLat, pickupLng, destinationLat, destinationLng, withinHours = TIME_WINDOW_HOURS } = params;
  const trips = await fetchAvailableTrips();

  const cutoff = new Date(Date.now() + withinHours * 3_600_000).toISOString();

  const results: MatchedTrip[] = [];

  for (const trip of trips) {
    if (trip.departure_at > cutoff) continue;

    const originDist = distanceMi(pickupLat, pickupLng, trip.origin_lat, trip.origin_lng);
    const destDist = distanceMi(destinationLat, destinationLng, trip.destination_lat, trip.destination_lng);

    if (originDist <= RADIUS_MILES && destDist <= RADIUS_MILES) {
      const score = 10 - originDist - destDist;
      results.push({ ...trip, match_score: score, origin_distance_mi: originDist, destination_distance_mi: destDist });
    }
  }

  results.sort((a, b) => b.match_score - a.match_score);
  return results;
}
