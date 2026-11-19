/** SN ONU GPON: 4 huruf vendor + 8 karakter hex, contoh GPON1A2B3C4D / ZTEGC1234567 */
export const SN_REGEX = /^[A-Z]{4}[0-9A-F]{8}$/

export function normalizeSn(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase()
}

export function isValidSn(sn: string): boolean {
  return SN_REGEX.test(sn)
}
