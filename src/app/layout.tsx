import { ClerkProvider } from "@clerk/nextjs";
import { esES } from "@clerk/localizations/es-ES";
import { shadcn } from "@clerk/ui/themes";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ToastFromSearchParams } from "@/components/toast-from-search-params";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

export const metadata: Metadata = {
  title: "Armario Dev — tus ideas, proyectos y equipo",
  description: "Organiza ideas y construye proyectos con tu equipo.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full">
        <ClerkProvider appearance={{ theme: shadcn }} localization={esES}>
          <TooltipProvider>{children}</TooltipProvider>
          <Suspense><ToastFromSearchParams /></Suspense>
          <Toaster />
        </ClerkProvider>
      </body>
    </html>
  );
}
