/**
 * Countries a customer or merchant can sign up from (owner 2026-10-19, diaspora sign-up): ISO 3166-1
 * alpha-2 code, English short name, and the E.164 calling code (digits, no "+"). Bikers stay on +263
 * (enforced at `POST /riders/become`). The flag is derived from the ISO code (`countryFlag`), so there is
 * no image to ship.
 *
 * Order in the picker (`COUNTRY_PICKER_ORDER`): Zimbabwe, then the ten countries with the most
 * Zimbabweans (owner 2026-10-19; UN DESA migrant-stock order, approximate), then every other country A–Z.
 */
export interface Country {
  /** ISO 3166-1 alpha-2, upper case. */
  iso: string;
  name: string;
  /** E.164 calling code, digits only ("263"). */
  dial: string;
}

// iso|name|dial, one per line, A–Z by English name (countries.test.ts holds it there, so the picker needs
// no sort at start-up). Shared calling codes (+1, +7, +44, +61, …) list every country that uses
// them; `countryForE164` resolves a pasted number to the preferred one (`PREFERRED_FOR_DIAL`).
const RAW = `AF|Afghanistan|93
AL|Albania|355
DZ|Algeria|213
AD|Andorra|376
AO|Angola|244
AG|Antigua and Barbuda|1
AR|Argentina|54
AM|Armenia|374
AW|Aruba|297
AU|Australia|61
AT|Austria|43
AZ|Azerbaijan|994
BS|Bahamas|1
BH|Bahrain|973
BD|Bangladesh|880
BB|Barbados|1
BY|Belarus|375
BE|Belgium|32
BZ|Belize|501
BJ|Benin|229
BM|Bermuda|1
BT|Bhutan|975
BO|Bolivia|591
BA|Bosnia and Herzegovina|387
BW|Botswana|267
BR|Brazil|55
BN|Brunei|673
BG|Bulgaria|359
BF|Burkina Faso|226
BI|Burundi|257
KH|Cambodia|855
CM|Cameroon|237
CA|Canada|1
CV|Cape Verde|238
KY|Cayman Islands|1
CF|Central African Republic|236
TD|Chad|235
CL|Chile|56
CN|China|86
CO|Colombia|57
KM|Comoros|269
CG|Congo|242
CD|Congo (DRC)|243
CR|Costa Rica|506
CI|Côte d’Ivoire|225
HR|Croatia|385
CU|Cuba|53
CW|Curaçao|599
CY|Cyprus|357
CZ|Czechia|420
DK|Denmark|45
DJ|Djibouti|253
DM|Dominica|1
DO|Dominican Republic|1
EC|Ecuador|593
EG|Egypt|20
SV|El Salvador|503
GQ|Equatorial Guinea|240
ER|Eritrea|291
EE|Estonia|372
SZ|Eswatini|268
ET|Ethiopia|251
FO|Faroe Islands|298
FJ|Fiji|679
FI|Finland|358
FR|France|33
GF|French Guiana|594
PF|French Polynesia|689
GA|Gabon|241
GM|Gambia|220
GE|Georgia|995
DE|Germany|49
GH|Ghana|233
GI|Gibraltar|350
GR|Greece|30
GL|Greenland|299
GD|Grenada|1
GP|Guadeloupe|590
GT|Guatemala|502
GG|Guernsey|44
GN|Guinea|224
GW|Guinea-Bissau|245
GY|Guyana|592
HT|Haiti|509
HN|Honduras|504
HK|Hong Kong|852
HU|Hungary|36
IS|Iceland|354
IN|India|91
ID|Indonesia|62
IR|Iran|98
IQ|Iraq|964
IE|Ireland|353
IM|Isle of Man|44
IL|Israel|972
IT|Italy|39
JM|Jamaica|1
JP|Japan|81
JE|Jersey|44
JO|Jordan|962
KZ|Kazakhstan|7
KE|Kenya|254
KI|Kiribati|686
XK|Kosovo|383
KW|Kuwait|965
KG|Kyrgyzstan|996
LA|Laos|856
LV|Latvia|371
LB|Lebanon|961
LS|Lesotho|266
LR|Liberia|231
LY|Libya|218
LI|Liechtenstein|423
LT|Lithuania|370
LU|Luxembourg|352
MO|Macao|853
MG|Madagascar|261
MW|Malawi|265
MY|Malaysia|60
MV|Maldives|960
ML|Mali|223
MT|Malta|356
MH|Marshall Islands|692
MQ|Martinique|596
MR|Mauritania|222
MU|Mauritius|230
YT|Mayotte|262
MX|Mexico|52
FM|Micronesia|691
MD|Moldova|373
MC|Monaco|377
MN|Mongolia|976
ME|Montenegro|382
MA|Morocco|212
MZ|Mozambique|258
MM|Myanmar|95
NA|Namibia|264
NR|Nauru|674
NP|Nepal|977
NL|Netherlands|31
NC|New Caledonia|687
NZ|New Zealand|64
NI|Nicaragua|505
NE|Niger|227
NG|Nigeria|234
KP|North Korea|850
MK|North Macedonia|389
NO|Norway|47
OM|Oman|968
PK|Pakistan|92
PW|Palau|680
PS|Palestine|970
PA|Panama|507
PG|Papua New Guinea|675
PY|Paraguay|595
PE|Peru|51
PH|Philippines|63
PL|Poland|48
PT|Portugal|351
PR|Puerto Rico|1
QA|Qatar|974
RE|Réunion|262
RO|Romania|40
RU|Russia|7
RW|Rwanda|250
KN|Saint Kitts and Nevis|1
LC|Saint Lucia|1
VC|Saint Vincent and the Grenadines|1
WS|Samoa|685
SM|San Marino|378
ST|São Tomé and Príncipe|239
SA|Saudi Arabia|966
SN|Senegal|221
RS|Serbia|381
SC|Seychelles|248
SL|Sierra Leone|232
SG|Singapore|65
SK|Slovakia|421
SI|Slovenia|386
SB|Solomon Islands|677
SO|Somalia|252
ZA|South Africa|27
KR|South Korea|82
SS|South Sudan|211
ES|Spain|34
LK|Sri Lanka|94
SD|Sudan|249
SR|Suriname|597
SE|Sweden|46
CH|Switzerland|41
SY|Syria|963
TW|Taiwan|886
TJ|Tajikistan|992
TZ|Tanzania|255
TH|Thailand|66
TL|Timor-Leste|670
TG|Togo|228
TO|Tonga|676
TT|Trinidad and Tobago|1
TN|Tunisia|216
TR|Türkiye|90
TM|Turkmenistan|993
TC|Turks and Caicos Islands|1
TV|Tuvalu|688
UG|Uganda|256
UA|Ukraine|380
AE|United Arab Emirates|971
GB|United Kingdom|44
US|United States|1
UY|Uruguay|598
UZ|Uzbekistan|998
VU|Vanuatu|678
VA|Vatican City|39
VE|Venezuela|58
VN|Vietnam|84
YE|Yemen|967
ZM|Zambia|260
ZW|Zimbabwe|263`;

export const COUNTRIES: readonly Country[] = RAW.split("\n").map((line) => {
  const [iso, name, dial] = line.split("|") as [string, string, string];
  return { iso, name, dial };
});

/** Zimbabwe: the default, and the only country a biker may sign up from. */
export const HOME_COUNTRY_ISO = "ZW";

/**
 * The ten countries with the most Zimbabweans, most first (owner 2026-10-19: "Zimbabwe at the top and
 * top 10 countries below"). An ordering choice, not a gate — edit freely.
 */
export const DIASPORA_COUNTRY_ISOS = ["ZA", "GB", "BW", "MZ", "MW", "US", "AU", "ZM", "CA", "NZ"] as const;

/** Where a calling code shared by several countries resolves when a number is pasted. */
const PREFERRED_FOR_DIAL: Readonly<Record<string, string>> = { "1": "US", "7": "RU", "39": "IT", "44": "GB", "262": "RE" };

const BY_ISO = new Map(COUNTRIES.map((c) => [c.iso, c]));

export function countryByIso(iso: string): Country | undefined {
  return BY_ISO.get(iso.toUpperCase());
}

/** The home country (Zimbabwe, +263). */
export const HOME_COUNTRY: Country = BY_ISO.get(HOME_COUNTRY_ISO) as Country;

/** The picker's list: Zimbabwe, the top-10 diaspora countries, then the rest A–Z (RAW's own order). */
export const COUNTRY_PICKER_ORDER: readonly Country[] = (() => {
  const pinned: readonly string[] = [HOME_COUNTRY_ISO, ...DIASPORA_COUNTRY_ISOS];
  const head = pinned.map((iso) => BY_ISO.get(iso) as Country);
  return [...head, ...COUNTRIES.filter((c) => !pinned.includes(c.iso))];
})();

/** How many leading rows of `COUNTRY_PICKER_ORDER` are pinned (Zimbabwe + the diaspora ten). */
export const PINNED_COUNTRY_COUNT = 1 + DIASPORA_COUNTRY_ISOS.length;

const FLAGS = new Map<string, string>();

/** "ZW" → "🇿🇼" (two regional-indicator symbols). Cached: the picker asks for each flag on every render. */
export function countryFlag(iso: string): string {
  let flag = FLAGS.get(iso);
  if (flag === undefined) {
    flag = iso
      .toUpperCase()
      .replace(/[^A-Z]/g, "")
      .slice(0, 2)
      .replace(/[A-Z]/g, (ch) => String.fromCodePoint(0x1f1e6 + ch.charCodeAt(0) - 65));
    FLAGS.set(iso, flag);
  }
  return flag;
}

/**
 * The country an E.164 number (or its digits) belongs to, by its calling code. Calling codes are
 * prefix-free, so at most one code matches; a code shared by several countries resolves to the
 * preferred one. Undefined when no listed code matches.
 */
export function countryForE164(e164OrDigits: string): Country | undefined {
  const digits = e164OrDigits.replace(/\D/g, "");
  for (let len = 1; len <= 3; len++) {
    const code = digits.slice(0, len);
    const preferred = PREFERRED_FOR_DIAL[code];
    if (preferred) return BY_ISO.get(preferred);
    const hit = COUNTRIES.find((c) => c.dial === code);
    if (hit) return hit;
  }
  return undefined;
}

/** Case- and accent-insensitive match on name, ISO code or calling code ("uk", "+44", "44", "cote"). */
export function countryMatches(c: Country, query: string): boolean {
  const q = fold(query.trim());
  if (!q) return true;
  const digits = q.replace(/^\+/, "");
  if (/^\d+$/.test(digits)) return c.dial.startsWith(digits);
  if (q === "uk" && c.iso === "GB") return true;
  return foldedName(c).includes(q) || c.iso.toLowerCase() === q;
}

const fold = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Each name folded once: the search runs over every country on each keystroke.
const FOLDED = new Map<string, string>();
const foldedName = (c: Country): string => {
  let f = FOLDED.get(c.iso);
  if (f === undefined) FOLDED.set(c.iso, (f = fold(c.name)));
  return f;
};

/**
 * Calling codes whose national numbers really begin with 0 (Italy and the Vatican, Côte d'Ivoire, Gabon,
 * Congo), so a leading 0 there is part of the number, not a trunk prefix to drop.
 */
export const TRUNK_ZERO_KEPT: ReadonlySet<string> = new Set(["39", "225", "241", "242"]);

/**
 * What the person typed in the national field → the national digits for `country`. A pasted
 * "+<code>…" / "00<code>…" drops the code; one trunk "0" is dropped ("07911…" → "7911…") except where
 * the 0 is part of the number (TRUNK_ZERO_KEPT). Capped so the whole E.164 stays ≤ 15 digits.
 */
export function nationalDigits(input: string, country: Country): string {
  const intl = /^\s*(\+|00)/.test(input);
  let d = input.replace(/\D/g, "");
  if (intl) {
    if (d.startsWith("00")) d = d.slice(2);
    if (d.startsWith(country.dial)) d = d.slice(country.dial.length);
  }
  if (d.startsWith("0") && !TRUNK_ZERO_KEPT.has(country.dial)) d = d.slice(1);
  return d.slice(0, 15 - country.dial.length);
}

/** The E.164 number for `country` + its national digits. */
export function toE164(country: Country, national: string): string {
  return `+${country.dial}${national}`;
}

/**
 * Null when `national` is a plausible number for `country`: at least 6 national digits and 8–15 in all
 * (E.164). Zimbabwe has its own stricter rule (9 digits, 71/73/77/78) in the app's ZW helpers.
 */
export function intlPhoneProblem(national: string, country: Country): "short" | null {
  const total = country.dial.length + national.length;
  if (national.length < 6 || total < 8) return "short";
  return null;
}

// The phone's time zone → its country, for the picker's starting flag (D-116 review, owner 2026-10-19). A
// South African phone typing "071 234 5678" under 🇿🇼 would pass as a Zimbabwe number, so the picker
// starts on the country the phone is set to. Only zones that name one country unambiguously; anything
// else (UTC, an unknown zone) starts on Zimbabwe as before.
const ZONE_COUNTRY: Readonly<Record<string, string>> = {
  "Africa/Harare": "ZW",
  "Africa/Johannesburg": "ZA",
  "Europe/London": "GB",
  "Europe/Belfast": "GB",
  "Africa/Gaborone": "BW",
  "Africa/Maputo": "MZ",
  "Africa/Blantyre": "MW",
  "Africa/Lusaka": "ZM",
  "Pacific/Auckland": "NZ",
  "Europe/Dublin": "IE",
  "Africa/Windhoek": "NA",
  "Africa/Maseru": "LS",
  "Africa/Mbabane": "SZ",
  "Africa/Dar_es_Salaam": "TZ",
  "Africa/Nairobi": "KE",
  "Africa/Lagos": "NG",
  "Africa/Accra": "GH",
  "Africa/Kampala": "UG",
  "Africa/Kigali": "RW",
  "Africa/Luanda": "AO",
  "Africa/Lubumbashi": "CD",
  "Africa/Kinshasa": "CD",
  "Asia/Dubai": "AE",
  "Asia/Qatar": "QA",
  "Asia/Riyadh": "SA",
  "Asia/Kuwait": "KW",
  "Asia/Kolkata": "IN",
  "Asia/Calcutta": "IN",
  "Asia/Shanghai": "CN",
  "Asia/Singapore": "SG",
  "Europe/Amsterdam": "NL",
  "Europe/Brussels": "BE",
  "Europe/Paris": "FR",
  "Europe/Berlin": "DE",
  "Europe/Madrid": "ES",
  "Europe/Lisbon": "PT",
  "Europe/Rome": "IT",
  "Europe/Stockholm": "SE",
  "Europe/Oslo": "NO",
  "Europe/Copenhagen": "DK",
  "Europe/Warsaw": "PL",
  "Europe/Zurich": "CH",
  "Europe/Vienna": "AT",
};

/** The country a time zone belongs to, for the zones listed above, plus the US, Canada and Australia. */
export function countryForTimeZone(zone: string | undefined): Country | undefined {
  if (!zone) return undefined;
  const iso =
    ZONE_COUNTRY[zone] ??
    (zone.startsWith("Australia/") ? "AU" : undefined) ??
    (/^America\/(Toronto|Vancouver|Edmonton|Winnipeg|Halifax|St_Johns|Regina|Montreal|Moncton|Whitehorse|Yellowknife|Iqaluit)$/.test(zone) ? "CA" : undefined) ??
    (/^(America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Detroit|Boise|Indiana\/.+|Kentucky\/.+)|Pacific\/Honolulu)$/.test(zone) ? "US" : undefined);
  return iso ? BY_ISO.get(iso) : undefined;
}

/** The phone's or browser's own country (by its time zone), or undefined when it can't tell. */
export function deviceCountry(): Country | undefined {
  try {
    return countryForTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    return undefined;
  }
}
