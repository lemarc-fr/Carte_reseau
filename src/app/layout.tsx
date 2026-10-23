import type { Metadata, Viewport } from "next";
import "./globals.css";
import 'maplibre-gl/dist/maplibre-gl.css';

export const metadata: Metadata = {
  title: "Carte Réseau — la production électrique française en temps réel",
  description:
    "Carte en temps réel des centrales nucléaires, hydrauliques et des parcs éoliens français, d'après les données de production publiées par RTE.",
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
