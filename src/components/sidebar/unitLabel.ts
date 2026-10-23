// "ST ALBAN 1", "GRAND MAISON 12" (noms RTE) -> "St Alban 1", "Grand Maison 12"
export function unitLabel(rteName: string): string {
  return rteName.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (match) => match.toUpperCase());
}
