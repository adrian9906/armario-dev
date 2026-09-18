import { Brand } from "@/components/brand";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return <main className="mx-auto min-h-screen max-w-6xl px-5 py-8"><Brand /><div className="mt-14 space-y-4"><Skeleton className="h-8 w-44 rounded-full" /><Skeleton className="h-11 w-80 max-w-full" /><Skeleton className="h-5 w-96 max-w-full" /></div><div className="mt-9 grid gap-5 sm:grid-cols-3">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-44 rounded-3xl" />)}</div></main>;
}
