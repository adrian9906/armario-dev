import { LoaderCircleIcon } from "lucide-react"
import { cn } from "cn"

function Spinner({ className, ...props }: React.ComponentProps<typeof LoaderCircleIcon>) {
  return (
    <LoaderCircleIcon
      data-slot="spinner"
      role="status"
      aria-label="Cargando"
      className={cn("animate-spin", className)}
      {...props}
    />
  )
}

export { Spinner }
