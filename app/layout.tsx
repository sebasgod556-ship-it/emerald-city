import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { LegalFooter } from "../components/LegalFooter";
import "./globals.css";

export const metadata: Metadata = {
  title: "Emerald City",
  description: "Juego de adivinar el Pokémon secreto para la comunidad Emerald City.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#050a07",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body className="flex min-h-dvh flex-col antialiased">
        <div className="flex flex-1 flex-col">{children}</div>
        <LegalFooter />
      </body>
    </html>
  );
}
