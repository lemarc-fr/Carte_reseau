'use client';

import { useId, useMemo, useState } from 'react';
import { useMapStore } from '@/store/useMapStore';
import { reactorLabel } from './labels';
import styles from './Sidebar.module.css';

interface Option {
  key: string;
  plantId: string;
  label: string;
  detail: string;
}

const MAX_OPTIONS = 50;

const normalize = (value: string) =>
  value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Liste déroulante filtrable : centrales (nom, commune, région) et réacteurs. */
export default function AssetSearch() {
  const plants = useMapStore((s) => s.plants);
  const selectedPlantId = useMapStore((s) => s.selectedPlantId);
  const selectPlant = useMapStore((s) => s.selectPlant);
  const listId = useId();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const selected = plants.find((p) => p.id === selectedPlantId) ?? null;

  const options = useMemo<Option[]>(() => {
    const q = normalize(query.trim());
    const result: Option[] = [];
    for (const plant of [...plants].sort((a, b) => a.name.localeCompare(b.name, 'fr'))) {
      const haystack = normalize([plant.name, plant.full_name, plant.commune, plant.departement, plant.region].join(' '));
      if (!q || haystack.includes(q)) {
        result.push({
          key: plant.id,
          plantId: plant.id,
          label: plant.name,
          detail: [plant.commune, plant.departement].filter(Boolean).join(' · '),
        });
      }
    }
    if (q) {
      for (const plant of plants) {
        for (const reactor of plant.reactors) {
          if (normalize(reactor.name).includes(q) || reactor.eic_code.toLowerCase().includes(q)) {
            result.push({
              key: reactor.eic_code,
              plantId: plant.id,
              label: reactorLabel(reactor.name),
              detail: `Réacteur · ${plant.name}`,
            });
          }
        }
      }
    }
    return result.slice(0, MAX_OPTIONS);
  }, [plants, query]);

  const choose = (option: Option | undefined) => {
    if (!option) return;
    selectPlant(option.plantId);
    setQuery('');
    setOpen(false);
  };

  return (
    <div className={styles.search}>
      <input
        className={styles.searchInput}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        placeholder="Sélectionner une centrale ou un réacteur"
        value={open ? query : (selected?.name ?? '')}
        onFocus={() => {
          setOpen(true);
          setActive(0);
        }}
        onBlur={() => setOpen(false)}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setActive((i) => Math.min(i + 1, options.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            choose(options[active]);
            e.currentTarget.blur();
          } else if (e.key === 'Escape') {
            setOpen(false);
            e.currentTarget.blur();
          }
        }}
      />
      <div className={styles.searchActions}>
        {selected && (
          <button
            type="button"
            className={styles.searchIcon}
            aria-label="Effacer la sélection"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => selectPlant(null)}
          >
            ✕
          </button>
        )}
        <span className={styles.searchDivider} />
        <span className={styles.searchIcon} aria-hidden>
          <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
            <path d="M4.516 7.548c.436-.446 1.043-.481 1.576 0L10 11.295l3.908-3.747c.533-.481 1.141-.446 1.574 0 .436.445.408 1.197 0 1.615-.406.418-4.695 4.502-4.695 4.502a1.095 1.095 0 0 1-1.576 0S4.924 9.581 4.516 9.163c-.409-.418-.436-1.17 0-1.615z" />
          </svg>
        </span>
      </div>

      {open && (
        <ul id={listId} role="listbox" className={styles.options}>
          {options.length === 0 && <li className={styles.noOption}>Aucun résultat</li>}
          {options.map((option, i) => (
            <li
              key={option.key}
              role="option"
              aria-selected={i === active}
              className={i === active ? styles.optionActive : styles.option}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(option);
                (document.activeElement as HTMLElement | null)?.blur();
              }}
            >
              <span>{option.label}</span>
              <span className={styles.optionDetail}>{option.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
