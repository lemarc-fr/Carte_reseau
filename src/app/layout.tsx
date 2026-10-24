import type { Metadata, Viewport } from "next";
import "./globals.css";
import 'maplibre-gl/dist/maplibre-gl.css';

export const metadata: Metadata = {
  title: "Carte Réseau — la production d'électricité en temps réel",
  description:
    "Carte en temps réel des centrales et parcs de production d'électricité (nucléaire, hydraulique, éolien, solaire, thermique, bioénergies, stockage), d'après les données publiées par RTE.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
