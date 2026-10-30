import type { Metadata } from 'next';
import WindTest from './WindTest';

export const metadata: Metadata = {
  title: 'Test du vent — Carte Réseau',
  robots: { index: false },
};

// Carte fixe du vent (fond coloré des couches Europe et France, sans particules ni
// centrales) : contrôle visuel et capture du test d'intégration du vent.
export default function WindTestPage() {
  return <WindTest />;
}
