"use client";

import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-8">
      <Brand />
      <Card className="border-0 bg-pastel-peach">
        <CardHeader>
          <CardTitle className="text-3xl">Ocurrió un problema</CardTitle>
          <CardDescription>No pudimos cargar esta página. Puedes intentarlo otra vez.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={reset}>Volver a intentar</Button>
        </CardContent>
      </Card>
    </main>
  );
}
