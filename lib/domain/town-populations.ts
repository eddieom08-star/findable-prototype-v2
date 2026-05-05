export const TOWN_POPULATIONS: Readonly<Record<string, number>> = {
  Wigan: 100_000,
  Manchester: 550_000,
  Reading: 175_000,
  Leeds: 800_000,
  Bristol: 470_000,
  Birmingham: 1_150_000,
  London: 9_000_000,
  Liverpool: 500_000,
  Sheffield: 580_000,
  "Newcastle upon Tyne": 300_000,
  Nottingham: 330_000,
  Leicester: 360_000,
  Wakefield: 100_000,
  Bolton: 195_000,
  Stockport: 295_000,
  Salford: 270_000,
  Oldham: 230_000,
  Rochdale: 220_000,
  Bury: 190_000,
  Tameside: 220_000,
  Trafford: 235_000,
  "City of London": 10_000,
};

const DEFAULT_TOWN_POPULATION = 80_000;

export const populationFor = (town: string): number =>
  TOWN_POPULATIONS[town] ?? DEFAULT_TOWN_POPULATION;
