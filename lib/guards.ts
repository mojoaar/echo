export interface DnsResponse {
  name: string;
  records: {
    a: string[];
    aaaa: string[];
    mx: string[];
    ns: string[];
    txt: string[];
    soa: string[];
  };
}
export interface RdapInfoResponse {
  handle: string | null;
  name: string | null;
  startAddress: string | null;
  endAddress: string | null;
  country: string | null;
  cidr: string | null;
  organization: string | null;
  registrant: string | null;
  abuse: { email: string | null; phone: string | null } | null;
}
export interface RdapAsnResponse {
  handle: string | null;
  name: string | null;
  startAutnum: number | null;
  endAutnum: number | null;
  country: string | null;
  organization: string | null;
  abuse: { email: string | null; phone: string | null } | null;
}
export interface RdapResponse {
  ip: RdapInfoResponse | null;
  asn: RdapAsnResponse | null;
}

export interface StatsResponse {
  total: number;
  last24h: number;
  topCountries: Array<{ iso: string; count: number }>;
  topIps: Array<{ ip: string; count: number }>;
  daily: Array<{ day: string; count: number }>;
}

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

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isCountedString(value: unknown): value is { iso: string; count: number } {
  return (
    isRecord(value) &&
    typeof value.iso === 'string' &&
    isCount(value.count)
  );
}

function isAbuse(value: unknown): value is { email: string | null; phone: string | null } | null {
  return (
    value === null ||
    (isRecord(value) && isNullableString(value.email) && isNullableString(value.phone))
  );
}

export function isDnsResponse(value: unknown): value is DnsResponse {
  if (!isRecord(value) || typeof value.name !== 'string' || !isRecord(value.records)) return false;
  const records = value.records;
  return ['a', 'aaaa', 'mx', 'ns', 'txt', 'soa'].every((key) => isStringArray(records[key]));
}
function isRdapInfoResponse(value: unknown): value is RdapInfoResponse {
  if (!isRecord(value)) return false;
  return (
    isNullableString(value.handle) &&
    isNullableString(value.name) &&
    isNullableString(value.startAddress) &&
    isNullableString(value.endAddress) &&
    isNullableString(value.country) &&
    isNullableString(value.cidr) &&
    isNullableString(value.organization) &&
    isNullableString(value.registrant) &&
    isAbuse(value.abuse)
  );
}

function isRdapAsnResponse(value: unknown): value is RdapAsnResponse {
  if (!isRecord(value)) return false;
  return (
    isNullableString(value.handle) &&
    isNullableString(value.name) &&
    isNullableNumber(value.startAutnum) &&
    isNullableNumber(value.endAutnum) &&
    isNullableString(value.country) &&
    isNullableString(value.organization) &&
    isAbuse(value.abuse)
  );
}

export function isRdapResponse(value: unknown): value is RdapResponse {
  return isRecord(value) &&
    (value.ip === null || isRdapInfoResponse(value.ip)) &&
    (value.asn === null || isRdapAsnResponse(value.asn));
}

export function isStatsResponse(value: unknown): value is StatsResponse {
  if (!isRecord(value) || !isCount(value.total) || !isCount(value.last24h)) return false;
  if (!Array.isArray(value.topCountries) || !value.topCountries.every(isCountedString)) return false;
  if (
    !Array.isArray(value.topIps) ||
    !value.topIps.every(
      (item) => isRecord(item) && typeof item.ip === 'string' && isCount(item.count),
    )
  ) {
    return false;
  }
  return (
    Array.isArray(value.daily) &&
    value.daily.every(
      (item) => isRecord(item) && typeof item.day === 'string' && isCount(item.count),
    )
  );
}

export function isIpInfo(value: unknown): value is IpInfo {
  if (!isRecord(value)) return false;
  return (
    typeof value.ip === 'string' &&
    isNullableString(value.city) &&
    isNullableString(value.region) &&
    isNullableString(value.country) &&
    isNullableString(value.countryCode) &&
    isNullableString(value.countryName) &&
    isNullableString(value.flag) &&
    isNullableString(value.org) &&
    isNullableString(value.asn) &&
    isNullableString(value.timezone) &&
    isNullableString(value.utcOffset) &&
    isNullableNumber(value.latitude) &&
    isNullableNumber(value.longitude) &&
    isNullableString(value.hostname) &&
    typeof value.isPrivate === 'boolean'
  );
}
