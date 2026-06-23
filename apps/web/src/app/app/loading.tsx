import { SkeletonCard } from "@/components/ui/skeleton";

export default function AppLoading() {
  return (
    <div className="space-y-8 animate-fade-in">
      <div className="space-y-3">
        <div className="h-4 w-32 skeleton rounded-full bg-orange/10" />
        <div className="h-12 w-3/4 skeleton rounded-ui bg-white/5" />
        <div className="h-5 w-1/2 skeleton rounded-full bg-white/5" />
      </div>
      <div className="h-16 skeleton rounded-card bg-white/5" />
      <div className="grid gap-5 lg:grid-cols-3">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}
