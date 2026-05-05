import type { Result } from "true-myth";
import type { Maybe } from "true-myth";
import type {
  GeoResult,
  KeywordVolume,
  PreviewResponse,
  Trade,
} from "@/lib/domain/schemas";
import type { IntegrationError } from "@/lib/domain/errors";

export interface CachePort {
  readonly getPreview: (
    businessName: string,
    postcode: string,
  ) => Promise<Maybe<PreviewResponse>>;
  readonly setPreview: (
    businessName: string,
    postcode: string,
    payload: PreviewResponse,
  ) => Promise<void>;
  readonly getVolume: (
    trade: Trade,
    town: string,
  ) => Promise<Maybe<readonly KeywordVolume[]>>;
  readonly setVolume: (
    trade: Trade,
    town: string,
    payload: readonly KeywordVolume[],
  ) => Promise<void>;
  readonly getGeo: (postcode: string) => Promise<Maybe<GeoResult>>;
  readonly setGeo: (postcode: string, payload: GeoResult) => Promise<void>;
}

export interface GeoPort {
  readonly lookup: (postcode: string) => Promise<Result<GeoResult, IntegrationError>>;
}

export interface PlacesBusiness {
  readonly place_id: string;
  readonly name: string;
  readonly rating: number | null;
  readonly review_count: number | null;
  readonly photos: readonly string[];
  readonly formatted_address: string | null;
  readonly formatted_phone: string | null;
  readonly website: string | null;
  readonly business_types: readonly string[];
  readonly lat: number;
  readonly lng: number;
}

export interface PlacesCompetitor {
  readonly name: string;
  readonly rating: number | null;
  readonly review_count: number | null;
}

export interface PlacesLookupResult {
  readonly business: PlacesBusiness;
  readonly competitors: readonly PlacesCompetitor[];
  readonly current_rank: number | ">20";
}

export interface PlacesPort {
  readonly lookupBusinessAndCompetitors: (input: {
    readonly business_name: string;
    readonly phone: string;
    readonly trade: Trade;
    readonly geo: GeoResult;
  }) => Promise<Result<PlacesLookupResult, IntegrationError>>;
}

export interface KeywordVolumePort {
  readonly fetchVolumes: (input: {
    readonly trade: Trade;
    readonly town: string;
  }) => Promise<Result<readonly KeywordVolume[], IntegrationError>>;
}

export interface Clock {
  readonly now: () => Date;
}

export interface IdGen {
  readonly newId: () => string;
}

export interface TemplateStorePort {
  readonly put: (slug: string, html: string) => Promise<void>;
  readonly get: (slug: string) => Promise<Maybe<string>>;
}
