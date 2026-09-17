import type { Metadata } from "next";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

export const metadata: Metadata = {
  title: "Semilla — de idea a proyecto",
  description: "Organiza ideas y construye proyectos con tu equipo.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full"><TooltipProvider>{children}</TooltipProvider></body>
    </html>
  );
}
