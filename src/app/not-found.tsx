import Link from "next/link";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-8">
      <Brand />
      <Card className="border-0 bg-pastel-sky">
        <CardHeader>
          <CardTitle className="text-3xl">Esta página no existe</CardTitle>
          <CardDescription>No encontramos la dirección que buscas.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button render={<Link href="/" />}>Volver al inicio</Button>
        </CardContent>
      </Card>
    </main>
  );
}
