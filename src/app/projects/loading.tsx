import { Brand } from "@/components/brand";
import { Skeleton } from "@/components/ui/skeleton";

export default function ProjectsLoading() {
  return <main className="mx-auto min-h-screen max-w-7xl px-5 py-8"><Brand /><div className="mt-16 flex flex-col gap-4"><Skeleton className="h-9 w-48 rounded-full" /><Skeleton className="h-12 w-96 max-w-full" /><Skeleton className="h-5 w-72 max-w-full" /></div><div className="mt-10 grid gap-5 lg:grid-cols-3">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-60 rounded-3xl" />)}</div></main>;
}
