/**
 * État en mémoire partagé par tout le processus serveur.
 *
 * Next compile l'instrumentation (tâches périodiques) et les routes d'API dans des bundles
 * distincts : une variable de module y existe en deux exemplaires, et un cache rempli ou
 * invalidé par l'un n'est jamais vu par l'autre. `globalThis` est, lui, commun.
 */
export function globalState<T>(key: string, init: () => T): T {
  const store = globalThis as unknown as Record<string, T | undefined>;
  return (store[`__carteReseau:${key}`] ??= init());
}
