import { entsoeCountry, type EntsoeArea } from './country';

// Pays synchronisés par ENTSO-E (la France l'est par RTE, plus détaillé). Centrales :
// dataset/<pays>/final/PLANTS.json (dataset/eu/scripts/powerplantmatching.py) ; celles
// d'Ukraine, de Moldavie et du Kosovo restent sans production. La Grande-Bretagne, hors
// ENTSO-E depuis 2021, est synchronisée par Elexon (../gb).
// Codes EIC des zones : https://transparency.entsoe.eu (Area codes).
const AREAS: EntsoeArea[] = [
  { code: 'AL', name: 'Albanie', timeZone: 'Europe/Tirane', domain: '10YAL-KESH-----5' },
  { code: 'AT', name: 'Autriche', timeZone: 'Europe/Vienna', domain: '10YAT-APG------L' },
  { code: 'BA', name: 'Bosnie-Herzégovine', timeZone: 'Europe/Sarajevo', domain: '10YBA-JPCC-----D' },
  { code: 'BE', name: 'Belgique', timeZone: 'Europe/Brussels', domain: '10YBE----------2' },
  { code: 'BG', name: 'Bulgarie', timeZone: 'Europe/Sofia', domain: '10YCA-BULGARIA-R' },
  { code: 'CH', name: 'Suisse', timeZone: 'Europe/Zurich', domain: '10YCH-SWISSGRIDZ' },
  { code: 'CZ', name: 'Tchéquie', timeZone: 'Europe/Prague', domain: '10YCZ-CEPS-----N' },
  {
    code: 'DE',
    name: 'Allemagne',
    timeZone: 'Europe/Berlin',
    domain: '10Y1001A1001A83F',
    // Quatre gestionnaires : 50Hertz, Amprion, TenneT, TransnetBW
    unitDomains: ['10YDE-VE-------2', '10YDE-RWENET---I', '10YDE-EON------1', '10YDE-ENBW-----N'],
  },
  { code: 'DK', name: 'Danemark', timeZone: 'Europe/Copenhagen', domain: '10Y1001A1001A65H', unitDomains: ['10Y1001A1001A796'] },
  { code: 'EE', name: 'Estonie', timeZone: 'Europe/Tallinn', domain: '10Y1001A1001A39I' },
  { code: 'ES', name: 'Espagne', timeZone: 'Europe/Madrid', domain: '10YES-REE------0' },
  { code: 'FI', name: 'Finlande', timeZone: 'Europe/Helsinki', domain: '10YFI-1--------U' },
  { code: 'GR', name: 'Grèce', timeZone: 'Europe/Athens', domain: '10YGR-HTSO-----Y' },
  { code: 'HR', name: 'Croatie', timeZone: 'Europe/Zagreb', domain: '10YHR-HEP------M' },
  { code: 'HU', name: 'Hongrie', timeZone: 'Europe/Budapest', domain: '10YHU-MAVIR----U' },
  { code: 'IE', name: 'Irlande', timeZone: 'Europe/Dublin', domain: '10YIE-1001A00010' },
  { code: 'IT', name: 'Italie', timeZone: 'Europe/Rome', domain: '10YIT-GRTN-----B' },
  { code: 'LT', name: 'Lituanie', timeZone: 'Europe/Vilnius', domain: '10YLT-1001A0008Q' },
  { code: 'LU', name: 'Luxembourg', timeZone: 'Europe/Luxembourg', domain: '10YLU-CEGEDEL-NQ' },
  { code: 'LV', name: 'Lettonie', timeZone: 'Europe/Riga', domain: '10YLV-1001A00074' },
  { code: 'ME', name: 'Monténégro', timeZone: 'Europe/Podgorica', domain: '10YCS-CG-TSO---S' },
  { code: 'MK', name: 'Macédoine du Nord', timeZone: 'Europe/Skopje', domain: '10YMK-MEPSO----8' },
  { code: 'NL', name: 'Pays-Bas', timeZone: 'Europe/Amsterdam', domain: '10YNL----------L' },
  { code: 'NO', name: 'Norvège', timeZone: 'Europe/Oslo', domain: '10YNO-0--------C' },
  { code: 'PL', name: 'Pologne', timeZone: 'Europe/Warsaw', domain: '10YPL-AREA-----S' },
  { code: 'PT', name: 'Portugal', timeZone: 'Europe/Lisbon', domain: '10YPT-REN------W' },
  { code: 'RO', name: 'Roumanie', timeZone: 'Europe/Bucharest', domain: '10YRO-TEL------P' },
  { code: 'RS', name: 'Serbie', timeZone: 'Europe/Belgrade', domain: '10YCS-SERBIATSOV' },
  { code: 'SE', name: 'Suède', timeZone: 'Europe/Stockholm', domain: '10YSE-1--------K' },
  { code: 'SI', name: 'Slovénie', timeZone: 'Europe/Ljubljana', domain: '10YSI-ELES-----O' },
  { code: 'SK', name: 'Slovaquie', timeZone: 'Europe/Bratislava', domain: '10YSK-SEPS-----K' },
];

export const ENTSOE_COUNTRIES = AREAS.map(entsoeCountry);
