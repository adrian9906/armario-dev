"use client"

import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { isValidElement, useEffect, useState, type ReactElement } from "react"
import { useFormStatus } from "react-dom"
import { Spinner } from "@/components/ui/spinner"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-[0.9375rem] font-semibold whitespace-nowrap transition-[background-color,border-color,box-shadow,transform] duration-200 outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-[0_3px_10px_color-mix(in_srgb,var(--primary)_18%,transparent)] hover:bg-primary/90 hover:shadow-[0_6px_18px_color-mix(in_srgb,var(--primary)_24%,transparent)]",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-11 gap-2 px-4 has-data-[icon=inline-end]:pr-3.5 has-data-[icon=inline-start]:pl-3.5",
        xs: "h-8 gap-1 rounded-[min(var(--radius-md),10px)] px-2.5 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-9 gap-1.5 rounded-[min(var(--radius-md),12px)] px-3 text-sm in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-12 gap-2 px-5 has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        icon: "size-11",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-9 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  children,
  disabled,
  nativeButton,
  onClick,
  pendingOnClick = false,
  render,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants> & { pendingOnClick?: boolean }) {
  const { pending: formPending } = useFormStatus()
  const [localPending, setLocalPending] = useState(false)
  const renderElement = isValidElement(render) ? render as ReactElement<{ download?: unknown; href?: unknown; target?: unknown }> : null
  const isNavigation = typeof renderElement?.props.href === "string"
  const isDownload = renderElement?.props.download !== undefined
  const pending = formPending || localPending

  useEffect(() => {
    if (!localPending) return
    const timeout = window.setTimeout(() => setLocalPending(false), isDownload ? 1500 : 10000)
    return () => window.clearTimeout(timeout)
  }, [isDownload, localPending])

  const handleClick: NonNullable<ButtonPrimitive.Props["onClick"]> = (event) => {
    onClick?.(event)
    if (event.defaultPrevented || disabled || pending || event.button !== 0
      || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const nativeGetForm = event.currentTarget.form?.method.toLowerCase() === "get"
    const opensAnotherTab = renderElement?.props.target === "_blank"
    if ((isNavigation && !opensAnotherTab) || nativeGetForm || pendingOnClick) setLocalPending(true)
  }

  return (
    <ButtonPrimitive
      data-slot="button"
      data-pending={pending || undefined}
      aria-busy={pending || undefined}
      className={cn(
        buttonVariants({ variant, size, className }),
        "data-[pending]:cursor-wait data-[pending]:[&>svg:not([data-slot=spinner])]:hidden"
      )}
      disabled={disabled || pending}
      nativeButton={nativeButton ?? !isNavigation}
      onClick={handleClick}
      render={render}
      {...props}
    >
      {pending && <Spinner data-icon="inline-start" />}
      {children}
    </ButtonPrimitive>
  )
}

export { Button, buttonVariants }
