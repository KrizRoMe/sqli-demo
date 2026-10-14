import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SQL Injection — Demo Educativa",
  description:
    "Demostración interactiva de SQL Injection y consultas parametrizadas, para la clase de Seguridad e Integridad en Aplicaciones Web.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}