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
          Carte Réseau montre heure par heure la production des centrales nucléaires, des centrales hydrauliques (dont
          les stations de pompage, STEP) et des parcs éoliens français. Son interface reprend celle de la{' '}
          <a href="https://renewables-map.robinhawkes.com/" target="_blank" rel="noreferrer">
            GB Renewables Map
          </a>{' '}
          de Robin Hawkes, adaptée au réseau français.
        </p>

        <h3>D&apos;où viennent les données ?</h3>
        <ul>
          <li>
            Production par groupe (réacteurs, grands groupes hydrauliques, éoliennes en mer) et production nationale par
            filière : API{' '}
            <a href="https://data.rte-france.com/catalog/-/api/generation/Actual-Generation" target="_blank" rel="noreferrer">
              Actual Generation
            </a>{' '}
            de RTE, interrogée toutes les 15 minutes.
          </li>
          <li>
            Taux de charge régionaux de l&apos;éolien et de l&apos;hydraulique : éCO2mix régional de RTE, publié sur{' '}
            <a href="https://odre.opendatasoft.com/explore/dataset/eco2mix-regional-tr/" target="_blank" rel="noreferrer">
              ODRE
            </a>
            .
          </li>
          <li>
            Centrales, parcs, puissances et dates de mise en service : registre national des installations de production
            (ODRE), Wikidata et OpenStreetMap. Les parcs éoliens terrestres sont regroupés par commune.
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
          L&apos;anneau extérieur correspond à la puissance installée, le disque plein à la production sur le créneau
          affiché. Leur surface est proportionnelle à la puissance. L&apos;option « Normaliser » donne la même taille à
          toutes les installations pour comparer leur taux de charge.
        </p>

        <h3>Pourquoi certaines productions sont-elles estimées (≈) ?</h3>
        <p>
          RTE ne publie la production individuelle que des groupes de plus de 100 MW : réacteurs, grandes centrales
          hydrauliques, parcs éoliens en mer. Pour les autres parcs éoliens et centrales hydrauliques, la production est
          estimée en multipliant leur puissance installée par le taux de charge de leur filière dans leur région
          (éCO2mix). Ces estimations sont affichées avec « ≈ » et un disque plus pâle.
        </p>

        <h3>Que fait une STEP ?</h3>
        <p>
          Une station de transfert d&apos;énergie par pompage remonte de l&apos;eau dans un bassin supérieur quand
          l&apos;électricité est abondante (pompage, valeur négative) et la turbine quand elle manque. Sur la carte, une
          STEP qui pompe est dessinée avec un disque presque transparent ; dans les graphiques, le pompage passe sous zéro.
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
