import type { KeywordVolume, Trade } from "./schemas";
import { TRADE_CONFIG } from "./trade-config";
import { populationFor } from "./town-populations";

export const populationScaledVolumes = (
  trade: Trade,
  town: string,
): readonly KeywordVolume[] => {
  const config = TRADE_CONFIG[trade];
  const population = populationFor(town);
  const totalVolume = Math.round(
    config.default_volume_per_100k * (population / 100_000),
  );
  const perKeyword = Math.max(1, Math.round(totalVolume / config.keyword_bundle.length));
  return config.keyword_bundle.map((kw) => ({
    keyword: `${kw} ${town.toLowerCase()}`,
    volume: perKeyword,
  }));
};

export const totalVolumeOf = (volumes: readonly KeywordVolume[]): number =>
  volumes.reduce((sum, v) => sum + v.volume, 0);
