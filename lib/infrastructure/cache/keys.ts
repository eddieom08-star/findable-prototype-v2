export const TTL_PREVIEW_SECONDS = 14 * 24 * 60 * 60;
export const TTL_VOLUME_SECONDS = 30 * 24 * 60 * 60;
export const TTL_GEO_SECONDS = 365 * 24 * 60 * 60;

export const slugify = (value: string): string =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const normalisePostcode = (postcode: string): string => {
  const cleaned = postcode.toUpperCase().replace(/\s+/g, "");
  return cleaned.length >= 5
    ? `${cleaned.slice(0, -3)} ${cleaned.slice(-3)}`
    : cleaned;
};

export const normaliseTown = (town: string): string =>
  town.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export const cacheKey = {
  preview: (businessName: string, postcode: string): string =>
    `preview:${slugify(businessName)}:${normalisePostcode(postcode)}`,
  volume: (trade: string, town: string): string =>
    `volume:${trade.toLowerCase()}:${normaliseTown(town)}`,
  geo: (postcode: string): string => `geo:${normalisePostcode(postcode)}`,
};
