// "ST ALBAN 1" (nom RTE) -> "St Alban 1"
export function reactorLabel(rteName: string): string {
  return rteName.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (match) => match.toUpperCase());
}
