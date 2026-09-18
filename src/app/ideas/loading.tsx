import { Brand } from "@/components/brand";
import { Skeleton } from "@/components/ui/skeleton";

export default function IdeasLoading() {
  return <main className="mx-auto min-h-screen max-w-4xl px-5 py-8"><Brand /><div className="mt-16 space-y-4"><Skeleton className="h-8 w-32 rounded-full" /><Skeleton className="h-12 w-96 max-w-full" /><Skeleton className="h-5 w-64 max-w-full" /></div><Skeleton className="mt-8 h-96 rounded-3xl" /></main>;
}
