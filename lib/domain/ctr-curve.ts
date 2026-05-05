export const CTR_CURVE = {
  local_pack_1: 0.32,
  local_pack_2: 0.18,
  local_pack_3: 0.10,
  organic_1: 0.12,
  organic_2: 0.06,
  organic_3: 0.04,
  organic_4: 0.025,
  organic_5: 0.025,
  organic_6_to_10: 0.015,
  position_11_to_20: 0.005,
  position_21_to_30: 0.002,
  position_over_30: 0.001,
} as const;

export const ctrAtRank = (
  localPackRank: number | null,
  organicRank: number | null,
): number => {
  if (localPackRank === 1) return CTR_CURVE.local_pack_1;
  if (localPackRank === 2) return CTR_CURVE.local_pack_2;
  if (localPackRank === 3) return CTR_CURVE.local_pack_3;
  if (organicRank === 1) return CTR_CURVE.organic_1;
  if (organicRank === 2) return CTR_CURVE.organic_2;
  if (organicRank === 3) return CTR_CURVE.organic_3;
  if (organicRank !== null && organicRank <= 5) return CTR_CURVE.organic_4;
  if (organicRank !== null && organicRank <= 10) return CTR_CURVE.organic_6_to_10;
  if (organicRank !== null && organicRank <= 20) return CTR_CURVE.position_11_to_20;
  if (organicRank !== null && organicRank <= 30) return CTR_CURVE.position_21_to_30;
  return CTR_CURVE.position_over_30;
};
