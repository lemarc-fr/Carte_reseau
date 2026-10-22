'use client';

import { useEffect } from 'react';
import styles from './Sidebar.module.css';

export default function AboutModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="about-title" onClick={(e) => e.stopPropagation()}>
        <button type="button" className={styles.closeButton} aria-label="Fermer" onClick={onClose}>
          ×
        </button>
        <h2 id="about-title">À propos</h2>
        <p>
          Carte Réseau montre la production des 57 réacteurs nucléaires français, heure par heure, sur une carte. Son
          interface reprend celle de la{' '}
          <a href="https://renewables-map.robinhawkes.com/" target="_blank" rel="noreferrer">
            GB Renewables Map
          </a>{' '}
          de Robin Hawkes, adaptée au réseau français.
        </p>

        <h3>D&apos;où viennent les données ?</h3>
        <ul>
          <li>
            Production par réacteur : API{' '}
            <a href="https://data.rte-france.com/catalog/-/api/generation/Actual-Generation" target="_blank" rel="noreferrer">
              Actual Generation
            </a>{' '}
            de RTE (production réalisée par groupe de plus de 100 MW), interrogée toutes les 15 minutes.
          </li>
          <li>
            Centrales, capacités et dates de mise en service : registre national des installations de production
            (ODRE), Wikidata et OpenStreetMap.
          </li>
          <li>
            Lignes électriques :{' '}
            <a href="https://openinframap.org" target="_blank" rel="noreferrer">
              Open Infrastructure Map
            </a>{' '}
            (© contributeurs OpenStreetMap).
          </li>
          <li>
            Vent à 10 m : modèle AROME de Météo-France (API publique), rechargé toutes les heures avec
            l&apos;échéance de prévision la plus proche ; la date du run et de l&apos;échéance sont indiquées en bas
            à gauche de la carte. Fond de carte : Protomaps, relief : Mapterhorn.
          </li>
        </ul>

        <h3>Que représentent les cercles ?</h3>
        <p>
          L&apos;anneau extérieur correspond à la capacité installée de la centrale, le disque plein à sa production sur
          le créneau affiché. Leur surface est proportionnelle à la puissance. L&apos;option « Normaliser » donne la même
          taille à toutes les centrales pour comparer leur taux de charge.
        </p>

        <h3>Pourquoi un réacteur est-il à 0 MW ?</h3>
        <p>
          Il est à l&apos;arrêt : rechargement du combustible, maintenance, visite décennale ou modulation. RTE publie
          alors une valeur légèrement négative (consommation des auxiliaires), affichée ici comme 0.
        </p>

        <h3>Les données sont-elles en temps réel ?</h3>
        <p>
          Presque : RTE publie chaque créneau horaire une vingtaine de minutes après sa fin. L&apos;historique horaire
          est conservé 7 jours, puis résumé en moyennes journalières.
        </p>
      </div>
    </div>
  );
}
