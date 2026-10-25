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
          Carte Réseau montre heure par heure la production d&apos;électricité de la France, site par site : nucléaire,
          hydraulique et stations de pompage (STEP), éolien, solaire, gaz, charbon, fioul, bioénergies et batteries. Son
          interface reprend celle de la{' '}
          <a href="https://renewables-map.robinhawkes.com/" target="_blank" rel="noreferrer">
            GB Renewables Map
          </a>{' '}
          de Robin Hawkes, adaptée au réseau français.
        </p>

        <h3>D&apos;où viennent les données ?</h3>
        <ul>
          <li>
            Production des groupes de plus de 100 MW (réacteurs, grande hydraulique, centrales thermiques, éolien en mer,
            grandes batteries) et production nationale par filière : API{' '}
            <a href="https://data.rte-france.com/catalog/-/api/generation/Actual-Generation" target="_blank" rel="noreferrer">
              Actual Generation
            </a>{' '}
            de RTE, interrogée toutes les 15 minutes.
          </li>
          <li>
            Taux de charge régionaux par filière et charge des batteries : éCO2mix régional de RTE, publié sur{' '}
            <a href="https://odre.opendatasoft.com/explore/dataset/eco2mix-regional-tr/" target="_blank" rel="noreferrer">
              ODRE
            </a>
            .
          </li>
          <li>
            Centrales, parcs, puissances et dates de mise en service : registre national des installations de production
            (ODRE), Wikidata et OpenStreetMap. Les petites installations sont regroupées par commune et par filière ;
            les communes de moins de 1 MW ne sont pas représentées (surtout du petit solaire), leur production reste
            comptée dans les totaux nationaux.
          </li>
          <li>
            Grande-Bretagne : centrales de 100 MW et plus et leurs unités du mécanisme d&apos;ajustement (BMU), placées
            grâce à powerplantmatching et OpenStreetMap. Production de chaque unité d&apos;après{' '}
            <a href="https://bmrs.elexon.co.uk" target="_blank" rel="noreferrer">
              BMRS
            </a>{' '}
            d&apos;Elexon : programme déclaré (PN) pour les derniers jours, remplacé par la production mesurée (B1610)
            dès sa publication, une semaine environ après. Contient des données BMRS © Elexon Limited.
          </li>
          <li>
            Reste de l&apos;Europe : centrales de 100 MW et plus de{' '}
            <a href="https://github.com/PyPSA/powerplantmatching" target="_blank" rel="noreferrer">
              powerplantmatching
            </a>{' '}
            (PyPSA), production par filière et par groupe de la{' '}
            <a href="https://transparency.entsoe.eu" target="_blank" rel="noreferrer">
              plateforme de transparence ENTSO-E
            </a>
            .
          </li>
          <li>
            Lignes électriques et, à partir du zoom 10, emprise des centrales, éoliennes, panneaux solaires et postes
            électriques :{' '}
            <a href="https://openinframap.org" target="_blank" rel="noreferrer">
              Open Infrastructure Map
            </a>{' '}
            (© contributeurs OpenStreetMap).
          </li>
          <li>
            Vent à 10 m : AROME HD de Météo-France sur la France (maille d&apos;environ 1 km) et GFS de la NOAA sur le
            reste de l&apos;Europe (0,25°, via le serveur THREDDS de l&apos;UCAR), rechargés toutes les heures avec
            l&apos;échéance la plus proche ; modèles, runs et échéances sont indiqués en bas à gauche de la carte. Fond
            de carte : Protomaps, relief : Mapterhorn.
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
          RTE ne publie la production individuelle que des groupes de plus de 100 MW. Pour tous les autres sites
          (parcs éoliens terrestres, solaire, petite hydraulique, cogénérations, bioénergies, batteries…), la production
          est estimée en multipliant leur puissance installée par le taux de charge de leur filière dans leur région
          (éCO2mix). Ces estimations sont affichées avec « ≈ » et un disque plus pâle.
        </p>

        <h3>Que font les STEP et les batteries ?</h3>
        <p>
          Une station de transfert d&apos;énergie par pompage remonte de l&apos;eau dans un bassin supérieur quand
          l&apos;électricité est abondante (pompage, valeur négative) et la turbine quand elle manque. Les batteries font
          de même (recharge, valeur négative). Sur la carte, un stockage qui se recharge est dessiné avec un disque
          presque transparent ; dans les graphiques, la recharge passe sous zéro.
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
