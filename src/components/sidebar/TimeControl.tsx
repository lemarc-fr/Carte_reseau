'use client';

import { useMapStore } from '@/store/useMapStore';
import { useCurrentSlot } from '@/hooks/useCurrentSlot';
import { formatSlot, formatTime, formatUpdated, HOUR_MS, slotDuration } from '@/lib/generationUtils';
import styles from './Sidebar.module.css';

const pad = (n: number) => String(n).padStart(2, '0');

// Valeur d'un <input type="datetime-local"> (heure locale du navigateur)
function toInputValue(time: number): string {
  const d = new Date(time);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function TimeControl() {
  const setSelectedTime = useMapStore((s) => s.setSelectedTime);
  const { generation, time, index, slotStart, isLive } = useCurrentSlot();
  const shown = slotStart ?? time;

  return (
    <>
      <div className={styles.timeRow}>
        <input
          type="datetime-local"
          className={styles.input}
          aria-label="Date et heure affichées"
          step={3600}
          max={generation?.latest != null ? toInputValue(generation.latest) : undefined}
          value={toInputValue(shown)}
          onChange={(e) => {
            const t = new Date(e.target.value).getTime();
            if (!Number.isNaN(t)) setSelectedTime(Math.floor(t / HOUR_MS) * HOUR_MS);
          }}
        />
        <button
          type="button"
          className={styles.buttonLarge}
          onClick={() => setSelectedTime(null)}
          disabled={isLive}
          title="Revenir au dernier créneau publié"
        >
          Maintenant
        </button>
      </div>
      <p className={styles.timeHint}>
        {isLive && <span className={styles.liveDot} aria-hidden />}
        {generation && index >= 0 ? (
          <span>
            {isLive ? 'En direct · ' : ''}
            {formatSlot(shown)} → {formatTime(shown + slotDuration(generation, index))}
            {generation.updatedAt !== null && isLive && <> · publié {formatUpdated(generation.updatedAt)}</>}
          </span>
        ) : (
          <span>{generation ? 'Aucune donnée RTE pour cet instant' : 'Chargement des données RTE…'}</span>
        )}
      </p>
    </>
  );
}
