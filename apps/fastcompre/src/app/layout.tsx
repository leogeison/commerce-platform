import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
