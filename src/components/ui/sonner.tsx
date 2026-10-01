"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="top-right"
      closeButton
      richColors
      toastOptions={{
        classNames: {
          toast: "group toast rounded-2xl border-0 text-foreground shadow-2xl",
          title: "font-semibold",
          description: "text-foreground/75",
          actionButton: "bg-primary text-primary-foreground",
          cancelButton: "bg-muted text-muted-foreground",
          success: "!bg-pastel-mint !text-foreground",
          error: "!bg-destructive !text-white",
          info: "!bg-pastel-sky !text-foreground",
          warning: "!bg-pastel-peach !text-foreground",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
