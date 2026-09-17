import type { Metadata } from "next";
import { Geist, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";

// UXF-001A — carregamento real de Geist Sans (interface) e Source Serif 4
// (conteúdo editorial, exclusivo do FastCompre — nunca aplicada no
// Admin). `next/font` gera suas próprias custom properties privadas do
// app (--font-geist-sans/--font-source-serif-4, aplicadas em <html>),
// nunca os nomes dos tokens públicos --font-family-sans/
// --font-family-serif (esse binding acontece em globals.css).
// packages/ui não tem nenhum conhecimento de next/font.
const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});

const sourceSerif4 = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-source-serif-4",
  display: "swap",
});

export const metadata: Metadata = {
  title: "FastCompre",
  description: "Comparativos e reviews de produtos para o público brasileiro.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${sourceSerif4.variable}`}
    >
      <body>
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
