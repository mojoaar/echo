export interface IpInfo {
  ip: string;
  city: string | null;
  region: string | null;
  country: string | null;
  countryCode: string | null;
  countryName: string | null;
  flag: string | null;
  org: string | null;
  asn: string | null;
  timezone: string | null;
  utcOffset: string | null;
  latitude: number | null;
  longitude: number | null;
  hostname: string | null;
  isPrivate: boolean;
}

export interface CityRecord {
  country?: { iso_code?: string; names?: Record<string, string> };
  subdivisions?: Array<{ names?: Record<string, string> }>;
  city?: { names?: Record<string, string> };
  location?: { latitude?: number; longitude?: number; time_zone?: string };
}

export interface AsnRecord {
  autonomous_system_number?: number;
  autonomous_system_organization?: string;
}

export interface CountryCount {
  iso: string;
  count: number;
}

export interface FeedStats {
  total: number;
  last24h: number;
  topCountries: CountryCount[];
}