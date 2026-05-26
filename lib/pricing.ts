// lib/pricing.ts
// Smart fare recommendations and competitive pricing estimates.
// All figures are in the same currency as the app (CAD/USD depending on market).

const KM_PER_MI = 1.60934;

// ── Competitor rate cards (approximate North American averages, including fees) ──
// Sources: publicly listed base rates + typical booking/service fees
const UBER = { base: 2.00, perKm: 1.40, perMin: 0.25, fees: 2.50, min: 9.00 };
const LYFT = { base: 1.80, perKm: 1.30, perMin: 0.22, fees: 2.00, min: 8.50 };

export type PriceRecommendation = {
  suggested: number;     // pre-filled default
  min: number;           // floor of the "sweet spot" range
  max: number;           // ceiling of the "sweet spot" range
  uberEstimate: number;  // Uber approximate fare
  lyftEstimate: number;  // Lyft approximate fare
  saveVsUber: number;    // $ saved vs Uber at suggested price
  saveVsLyft: number;    // $ saved vs Lyft at suggested price
  distanceKm: number;
};

export function calculatePriceRecommendation(
  distanceMi: number,
  etaMin: number,
): PriceRecommendation {
  const distanceKm = +(distanceMi * KM_PER_MI).toFixed(1);

  // ── ATEE pricing bands ────────────────────────────────────────
  // We price ~30-45% below Uber/Lyft — drivers still earn more
  // since they keep 100% (no commission deducted).
  let min: number;
  let max: number;
  let suggested: number;

  if (distanceKm < 5) {
    // Short urban hop (< 5 km)
    min = 5;
    max = 8;
    suggested = Math.min(max, Math.max(min, Math.round(3.5 + distanceKm * 0.7 + etaMin * 0.15)));
  } else if (distanceKm < 15) {
    // Medium trip (5–15 km)
    min = 10;
    const raw = 5 + distanceKm * 1.10 + etaMin * 0.18;
    suggested = Math.round(raw);
    max = Math.round(suggested * 1.40);
  } else if (distanceKm < 35) {
    // Suburban / longer urban (15–35 km)
    min = 20;
    const raw = 10 + distanceKm * 1.05 + etaMin * 0.20;
    suggested = Math.round(raw);
    max = Math.round(suggested * 1.35);
  } else {
    // Highway / inter-city (35+ km)
    min = 35;
    const raw = 15 + distanceKm * 0.95 + etaMin * 0.22;
    suggested = Math.round(raw);
    max = Math.round(suggested * 1.30);
  }

  // Clamp to slider range
  suggested = Math.max(min, suggested);

  // ── Competitor estimates ──────────────────────────────────────
  const uberRaw = UBER.base + distanceKm * UBER.perKm + etaMin * UBER.perMin + UBER.fees;
  const uberEstimate = Math.round(Math.max(UBER.min, uberRaw));

  const lyftRaw = LYFT.base + distanceKm * LYFT.perKm + etaMin * LYFT.perMin + LYFT.fees;
  const lyftEstimate = Math.round(Math.max(LYFT.min, lyftRaw));

  return {
    suggested,
    min,
    max,
    uberEstimate,
    lyftEstimate,
    saveVsUber: Math.max(0, uberEstimate - suggested),
    saveVsLyft: Math.max(0, lyftEstimate - suggested),
    distanceKm,
  };
}

// Human-readable price label relative to the ATEE recommended range
export function getPriceLabel(price: number, rec: PriceRecommendation | null): string {
  if (!rec) return 'Higher bid = faster match';
  if (price >= rec.min && price <= rec.max) return 'Great offer — drivers will accept ✓';
  if (price > rec.max) return 'Above range — very fast match ⚡';
  if (price >= Math.round(rec.min * 0.85)) return 'Slightly low — might take longer';
  return 'Below range — few drivers may accept';
}

export function getPriceColor(
  price: number,
  rec: PriceRecommendation | null,
  GREEN: string,
  AMBER: string,
  RED: string,
): string {
  if (!rec) return price >= 15 ? GREEN : price >= 10 ? AMBER : RED;
  if (price >= rec.min) return GREEN;
  if (price >= Math.round(rec.min * 0.85)) return AMBER;
  return RED;
}
