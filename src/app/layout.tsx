import type { Metadata, Viewport } from "next";
import "./globals.css";
import 'maplibre-gl/dist/maplibre-gl.css';

export const metadata: Metadata = {
  title: "Carte Réseau — le nucléaire français en temps réel",
  description:
    "Carte en temps réel de la production des 57 réacteurs nucléaires français, d'après les données de production par groupe publiées par RTE.",
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
