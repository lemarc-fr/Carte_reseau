import { downsampleOldHourlyData } from '../downsample';
import { COUNTRIES } from './countries';
import { addDays, dayIn, hourIn } from './days';
import type { Country, Source } from './types';

// Synchronisation générique : pour chaque pays (countries.ts), chaque source est mise
// à jour toutes les 15 minutes et complétée depuis BACK_FILL_START au démarrage.

const REFRESH_INTERVAL_MS = 15 * 60 * 1000;
// Aligné sur RETENTION_DAYS de lib/downsample.ts : au-delà, les relevés horaires
// sont convertis en moyennes journalières.
const HOURLY_RETENTION_DAYS = 7;
// Juste après minuit, les dernières heures de la veille sont encore publiées.
const LATE_PUBLICATION_HOURS = 3;
// Pause entre deux fenêtres lors d'un rattrapage long
const BACKFILL_PAUSE_MS = 1000;
// Erreurs passagères des API (502 de passerelle...) : nouvelles tentatives après ces délais
const RETRY_DELAYS_MS = [5_000, 20_000];

/**
 * Début de l'historique à conserver, variable d'environnement BACK_FILL_START
 * (jour au format YYYY-MM-DD). Absente : seuls les 7 derniers jours sont récupérés.
 */
export function backfillStart(): string | null {
  const value = process.env.BACK_FILL_START?.trim();
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error(`BACK_FILL_START invalide : "${value}" (format attendu YYYY-MM-DD)`);
  }
  return value;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function withRetry<T>(label: string, task: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await task();
    } catch (err) {
      if (attempt >= RETRY_DELAYS_MS.length) throw err;
      console.warn(`[production] ${label} : échec (${(err as Error).message.slice(0, 120)}), nouvel essai`);
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
}

type Progress = (source: string, windowStart: string, windowEnd: string, rows: number) => void;

/** Télécharge et enregistre les jours [fromDay, toDay[ (heure locale du pays) pour les sources données. */
export async function ingestDays(
  country: Country,
  fromDay: string,
  toDay: string,
  onProgress?: Progress,
  sources: Source[] = country.sources
): Promise<number> {
  let written = 0;
  for (const source of sources) {
    for (let start = fromDay; start < toDay; start = addDays(start, source.maxDays)) {
      if (start !== fromDay) await sleep(BACKFILL_PAUSE_MS);
      const windowEnd = addDays(start, source.maxDays);
      const end = windowEnd < toDay ? windowEnd : toDay;
      const label = `${country.code} ${source.name} ${start} → ${end}`;
      const rows = await withRetry(label, () => source.ingest(start, end));
      written += rows;
      onProgress?.(source.name, start, end, rows);
    }
  }
  return written;
}

/** Premier jour absent de `present` dans [from, to[, ou null. */
function firstMissing(present: Set<string>, from: string, to: string): string | null {
  for (let day = from; day < to; day = addDays(day, 1)) if (!present.has(day)) return day;
  return null;
}

/**
 * Récupère, source par source, tous les jours manquants entre BACK_FILL_START et la
 * fenêtre récente (gérée par syncRecent), puis les résume en moyennes journalières.
 */
export async function backfillHistory(country: Country): Promise<number> {
  const configured = backfillStart();
  if (!configured) return 0;
  const today = dayIn(country.timeZone);
  const end = addDays(today, -(HOURLY_RETENTION_DAYS - 1));

  let rows = 0;
  for (const source of country.sources) {
    const oldest = source.historyDays ? addDays(today, -source.historyDays) : configured;
    const start = oldest > configured ? oldest : configured;
    const present = await source.daysWithData(start);
    // Jours manquants consécutifs regroupés en plages [from, to[
    const ranges: [string, string][] = [];
    for (let day = start; day < end; day = addDays(day, 1)) {
      if (present.has(day)) continue;
      const last = ranges[ranges.length - 1];
      if (last && last[1] === day) last[1] = addDays(day, 1);
      else ranges.push([day, addDays(day, 1)]);
    }
    for (const [from, to] of ranges) {
      console.log(`[production] rattrapage ${country.code} ${source.name} du ${from} au ${to} (BACK_FILL_START=${start})…`);
      try {
        rows += await ingestDays(
          country,
          from,
          to,
          (_, a, b, n) => console.log(`[production]   ${a} → ${b} : ${n} relevé(s)`),
          [source]
        );
      } catch (err) {
        // Les jours manquants seront repris au prochain démarrage ; on passe à la suite
        console.error(`[production] rattrapage ${source.name} interrompu :`, (err as Error).message);
      }
    }
  }
  if (rows) await downsampleOldHourlyData();
  return rows;
}

/**
 * Met à jour la fenêtre récente, source par source (dans l'ordre du pays : une source
 * plus fiable passe après et remplace), de son premier jour manquant (au plus
 * `lookbackDays` jours) à aujourd'hui inclus.
 */
export async function syncRecent(country: Country): Promise<number> {
  const today = dayIn(country.timeZone);
  const retained = addDays(today, -(HOURLY_RETENTION_DAYS - 1));
  // Aujourd'hui est toujours rechargé, la veille aussi juste après minuit
  const latest = hourIn(country.timeZone) < LATE_PUBLICATION_HOURS ? addDays(today, -1) : today;

  let rows = 0;
  let beyondRetention = false;
  for (const source of country.sources) {
    // Une source ajoutée après coup, restée en échec ou publiée en retard peut manquer des jours
    const oldest = addDays(today, -((source.lookbackDays ?? HOURLY_RETENTION_DAYS) - 1));
    const missing = firstMissing(await source.daysWithData(oldest), oldest, latest);
    const from = missing && missing < latest ? missing : latest;
    let written = 0;
    try {
      written = await ingestDays(country, from, addDays(today, 1), undefined, [source]);
    } catch (err) {
      // Les autres sources du pays continuent ; celle-ci sera reprise au prochain passage
      console.error(`[production] ${country.code} ${source.name} : synchronisation échouée :`, (err as Error).message);
    }
    rows += written;
    if (written && from < retained) beyondRetention = true;
  }
  // Relevés horaires écrits au-delà de la rétention : résumés tout de suite en moyennes journalières
  if (beyondRetention) await downsampleOldHourlyData();
  return rows;
}

let running: Promise<number> | null = null;
let intervalId: NodeJS.Timeout | null = null;

const enabledCountries = () => COUNTRIES.filter((country) => country.enabled());

function syncRecentOnce(): Promise<number> {
  running ??= (async () => {
    let rows = 0;
    for (const country of enabledCountries()) {
      // Un pays en échec n'empêche pas les suivants de se synchroniser
      try {
        rows += await syncRecent(country);
      } catch (err) {
        console.error(`[production] synchronisation ${country.code} échouée :`, (err as Error).message);
      }
    }
    return rows;
  })().finally(() => {
    running = null;
  });
  return running;
}

export function startProductionRefresh() {
  if (intervalId) return;
  const countries = enabledCountries();
  if (!countries.length) {
    console.warn('[production] aucun pays configuré (identifiants manquants) : ingestion désactivée');
    return;
  }

  const run = () =>
    syncRecentOnce()
      .then((rows) => console.log(`[production] synchronisation : ${rows} relevé(s) écrit(s)`))
      .catch((err) => console.error('[production] synchronisation échouée :', err));

  // Données récentes d'abord (affichées tout de suite), puis l'historique éventuel
  run()
    .then(async () => {
      for (const country of countries) {
        const rows = await backfillHistory(country);
        if (rows) console.log(`[production] rattrapage ${country.code} terminé : ${rows} relevé(s)`);
      }
    })
    .catch((err) => console.error('[production] rattrapage échoué :', err));
  intervalId = setInterval(run, REFRESH_INTERVAL_MS);
}
