import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth/AuthProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TapCar — Tu flota a un Tap",
  description: "Opera tu flota completa con un toque: documentos al día, quién usa cada vehículo y el estado de toda tu flota. Acerca el teléfono al chip NFC y listo.",
  // El nombre del acceso directo en la pantalla de inicio del iPhone. Sin esto,
  // iOS propone el `title` completo y lo trunca a un puñado de caracteres.
  // (El ícono lo aporta `app/apple-icon.png`; ver scripts/generar-apple-icon.mjs.)
  appleWebApp: { title: "TapCar", capable: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es-CL"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col"><AuthProvider>{children}</AuthProvider></body>
    </html>
  );
}
