"use client";

import { useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarDays } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

function localDate(value: string | null | undefined) {
  return value ? new Date(`${value}T12:00:00`) : undefined;
}

export function TaskDateRange({ startDate, dueDate }: { startDate?: string | null; dueDate?: string | null }) {
  const initialStart = localDate(startDate ?? dueDate);
  const initialEnd = localDate(dueDate);
  const [range, setRange] = useState<DateRange | undefined>(initialStart ? { from: initialStart, to: initialEnd } : undefined);
  const label = range?.from
    ? range.to
      ? `${format(range.from, "d MMM yyyy", { locale: es })} – ${format(range.to, "d MMM yyyy", { locale: es })}`
      : `${format(range.from, "d MMM yyyy", { locale: es })} · elige el fin`
    : "Seleccionar rango de fechas";

  return <Field>
    <FieldLabel htmlFor="task-date-range">Fechas de la tarea</FieldLabel>
    <FieldDescription>Selecciona el inicio y el fin del trabajo.</FieldDescription>
    <input type="hidden" name="start_date" value={range?.from ? format(range.from, "yyyy-MM-dd") : ""} />
    <input type="hidden" name="due_date" value={range?.to ? format(range.to, "yyyy-MM-dd") : ""} />
    <Popover>
      <PopoverTrigger render={<Button id="task-date-range" type="button" variant="outline" className="w-full justify-start font-normal" />}>
        <CalendarDays aria-hidden /> {label}
      </PopoverTrigger>
      <PopoverContent align="start" className="max-w-[calc(100vw-2rem)] w-auto overflow-auto p-0">
        <Calendar mode="range" selected={range} onSelect={setRange} defaultMonth={range?.from} numberOfMonths={2} locale={es} />
        <div className="flex justify-end border-t border-border p-2"><Button type="button" variant="ghost" size="sm" onClick={() => setRange(undefined)}>Limpiar fechas</Button></div>
      </PopoverContent>
    </Popover>
  </Field>;
}
