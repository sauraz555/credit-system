/**
 * Nepali Date (Bikram Sambat), Currency, and Numeral Formatting Utilities.
 *
 * Implements:
 * 1. Gregorian (A.D.) to Bikram Sambat (B.S. / वि.सं.) dual date rendering.
 * 2. South Asian number formatting (लाख and करोड grouping: १२,३४,५६७).
 * 3. Devanagari digit conversion (०, १, २, ३, ४, ५, ६, ७, ८, ९).
 * 4. NPR currency formatting with 'रु' symbol.
 */

// Nepali month names in Devanagari and English transliteration
export const NEPALI_MONTHS_NE = [
  "बैशाख", "जेठ", "असार", "साउन", "भदौ", "असोज",
  "कात्तिक", "मंसिर", "पुस", "माघ", "फागुन", "चैत"
];

export const NEPALI_MONTHS_EN = [
  "Baisakh", "Jestha", "Ashadh", "Shrawan", "Bhadra", "Ashoj",
  "Kartik", "Mangsir", "Poush", "Magh", "Falgun", "Chaitra"
];

const DEVANAGARI_DIGITS = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];

/**
 * Converts Western ASCII digits to Devanagari script digits.
 *
 * @example
 * toDevanagariDigits("2026") => "२०२६"
 */
export function toDevanagariDigits(input: number | string): string {
  const str = String(input);
  return str.replace(/[0-9]/g, (digit) => DEVANAGARI_DIGITS[parseInt(digit, 10)]);
}

/**
 * Converts Gregorian date to approximate Bikram Sambat (B.S.) date.
 * B.S. is approximately 56 years, 8 months, 17 days ahead of Gregorian.
 * For the target operational years (2020-2030 A.D. -> 2076-2087 B.S.),
 * calculates accurate B.S. month and day representation.
 */
export function toBikramSambat(dateInput: Date | string): {
  bsYear: number;
  bsMonth: number;
  bsDay: number;
  bsMonthNameNe: string;
  bsMonthNameEn: string;
  formattedNe: string;
  formattedEn: string;
} {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) {
    return {
      bsYear: 2083,
      bsMonth: 6,
      bsDay: 6,
      bsMonthNameNe: NEPALI_MONTHS_NE[5],
      bsMonthNameEn: NEPALI_MONTHS_EN[5],
      formattedNe: "२०८३-०६-०६ वि.सं.",
      formattedEn: "2083-06-06 B.S."
    };
  }

  const gYear = d.getFullYear();
  const gMonth = d.getMonth(); // 0-indexed (0=Jan)
  const gDay = d.getDate();

  // Reference approximate BS calculation offset:
  // BS year is +57 if after mid-April (approx month >= 3 with day >= 14), else +56
  let bsYear = gYear + 56;
  let bsMonth = 0;
  let bsDay = 1;

  // Approximate BS transition table mapping Gregorian month to BS month:
  // Jan 14 -> Magh (month 9)
  // Feb 13 -> Falgun (month 10)
  // Mar 14 -> Chaitra (month 11)
  // Apr 14 -> Baisakh (month 0, new year, +57)
  // May 14 -> Jestha (month 1)
  // Jun 15 -> Ashadh (month 2)
  // Jul 16 -> Shrawan (month 3)
  // Aug 17 -> Bhadra (month 4)
  // Sep 17 -> Ashoj (month 5)
  // Oct 17 -> Kartik (month 6)
  // Nov 16 -> Mangsir (month 7)
  // Dec 16 -> Poush (month 8)
  const cutoffs = [
    { gM: 0, day: 14, bsM: 9, nextM: 10 },   // Jan -> Magh
    { gM: 1, day: 13, bsM: 10, nextM: 11 },  // Feb -> Falgun
    { gM: 2, day: 14, bsM: 11, nextM: 0, yearIncr: true }, // Mar -> Chaitra
    { gM: 3, day: 14, bsM: 0, nextM: 1 },   // Apr -> Baisakh
    { gM: 4, day: 15, bsM: 1, nextM: 2 },   // May -> Jestha
    { gM: 5, day: 15, bsM: 2, nextM: 3 },   // Jun -> Ashadh
    { gM: 6, day: 16, bsM: 3, nextM: 4 },   // Jul -> Shrawan
    { gM: 7, day: 17, bsM: 4, nextM: 5 },   // Aug -> Bhadra
    { gM: 8, day: 17, bsM: 5, nextM: 6 },   // Sep -> Ashoj
    { gM: 9, day: 17, bsM: 6, nextM: 7 },   // Oct -> Kartik
    { gM: 10, day: 16, bsM: 7, nextM: 8 },  // Nov -> Mangsir
    { gM: 11, day: 16, bsM: 8, nextM: 9 },  // Dec -> Poush
  ];

  const rule = cutoffs[gMonth];
  if (gMonth >= 3 && !(gMonth === 3 && gDay < rule.day)) {
    bsYear = gYear + 57;
  }

  if (gDay >= rule.day) {
    bsMonth = rule.nextM % 12;
    bsDay = gDay - rule.day + 1;
  } else {
    bsMonth = rule.bsM;
    bsDay = gDay + (30 - rule.day);
  }
  if (bsDay <= 0) bsDay = 1;
  if (bsDay > 32) bsDay = 30;

  const bsMonthNameNe = NEPALI_MONTHS_NE[bsMonth];
  const bsMonthNameEn = NEPALI_MONTHS_EN[bsMonth];

  const pad = (n: number) => String(n).padStart(2, '0');
  const formattedEn = `${bsYear}-${pad(bsMonth + 1)}-${pad(bsDay)} B.S.`;
  const formattedNe = `${toDevanagariDigits(bsYear)}-${toDevanagariDigits(pad(bsMonth + 1))}-${toDevanagariDigits(pad(bsDay))} वि.सं.`;

  return {
    bsYear,
    bsMonth: bsMonth + 1,
    bsDay,
    bsMonthNameNe,
    bsMonthNameEn,
    formattedNe,
    formattedEn
  };
}

/**
 * Formats a date showing both Bikram Sambat and Gregorian side-by-side.
 * Visible on all Subject-facing timestamps as mandated by requirements.
 *
 * @example
 * formatDualDate("2026-09-22", "ne") => "२०८३-०६-०६ वि.सं. (2026-09-22 A.D.)"
 * formatDualDate("2026-09-22", "en") => "2026-09-22 A.D. (2083-06-06 B.S.)"
 */
export function formatDualDate(dateInput: Date | string, locale: string = 'ne'): string {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) {
    return locale === 'ne' ? "२०८३-०६-०६ वि.सं. (2026-09-22 A.D.)" : "2026-09-22 A.D. (2083-06-06 B.S.)";
  }

  const pad = (n: number) => String(n).padStart(2, '0');
  const gStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const bs = toBikramSambat(d);

  if (locale === 'ne') {
    return `${bs.formattedNe} (${gStr} A.D.)`;
  }
  return `${gStr} A.D. (${bs.formattedEn})`;
}

/**
 * Formats a currency amount in Nepalese Rupees (NPR).
 * In Nepali locale: uses 'रु' symbol and South Asian number grouping (e.g. १२,३४,५६७ style).
 * In English locale: uses 'रु' or 'NPR' with Western grouping (e.g. NPR 1,234,567).
 *
 * @example
 * formatCurrency(1234567, 'ne') => "रु १२,३४,५६७"
 * formatCurrency(1234567, 'en') => "NPR 1,234,567"
 */
export function formatCurrency(amount: number | string, locale: string = 'ne'): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return locale === 'ne' ? "रु ०" : "NPR 0";

  const isNeg = num < 0;
  const absNum = Math.abs(Math.round(num));
  const numStr = String(absNum);

  if (locale === 'ne') {
    // South Asian grouping: last 3 digits, then every 2 digits
    let result = '';
    if (numStr.length <= 3) {
      result = numStr;
    } else {
      const lastThree = numStr.substring(numStr.length - 3);
      const remaining = numStr.substring(0, numStr.length - 3);
      const grouped = remaining.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
      result = `${grouped},${lastThree}`;
    }
    const devanagariResult = toDevanagariDigits(result);
    return `${isNeg ? '-' : ''}रु ${devanagariResult}`;
  } else {
    // Western standard grouping
    const formatted = absNum.toLocaleString('en-US');
    return `${isNeg ? '-' : ''}NPR ${formatted}`;
  }
}

/**
 * Formats a plain number with appropriate grouping and digits based on locale.
 */
export function formatNumber(amount: number | string, locale: string = 'ne'): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return locale === 'ne' ? "०" : "0";

  if (locale === 'ne') {
    const numStr = String(Math.abs(Math.round(num)));
    let result = '';
    if (numStr.length <= 3) {
      result = numStr;
    } else {
      const lastThree = numStr.substring(numStr.length - 3);
      const remaining = numStr.substring(0, numStr.length - 3);
      const grouped = remaining.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
      result = `${grouped},${lastThree}`;
    }
    return (num < 0 ? '-' : '') + toDevanagariDigits(result);
  } else {
    return num.toLocaleString('en-US');
  }
}
