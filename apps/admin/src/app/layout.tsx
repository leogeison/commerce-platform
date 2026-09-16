import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

// UXF-001A — carregamento real de Geist Sans. `next/font` gera sua
// própria custom property privada do app (--font-geist-sans, aplicada
// em <html>), nunca o nome do token público --font-family-sans (esse
// binding acontece em globals.css). packages/ui não tem nenhum
// conhecimento de next/font.
const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Commerce Platform Admin",
  description: "Painel administrativo do Commerce Platform.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={geistSans.variable}>
      <body>{children}</body>
    </html>
  );
}
