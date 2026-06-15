import {
  Apple,
  Pill,
  Sparkles,
  FileText,
  ShieldCheck,
  CreditCard,
  Package,
  type LucideIcon,
} from "lucide-react";
import type { Category } from "@/types/database";

// Design-system source of truth for category identity: label, icon, and tint classes.
// Tailwind palette classes are written as full literals so they survive the JIT scan.
export const CATEGORY_META: Record<
  Category,
  { label: string; icon: LucideIcon; tint: string; dot: string }
> = {
  food: { label: "Food", icon: Apple, tint: "text-emerald-300 bg-emerald-400/10 border-emerald-400/25", dot: "bg-emerald-400" },
  medicine: { label: "Medicine", icon: Pill, tint: "text-rose-300 bg-rose-400/10 border-rose-400/25", dot: "bg-rose-400" },
  cosmetics: { label: "Cosmetics", icon: Sparkles, tint: "text-fuchsia-300 bg-fuchsia-400/10 border-fuchsia-400/25", dot: "bg-fuchsia-400" },
  documents: { label: "Documents", icon: FileText, tint: "text-sky-300 bg-sky-400/10 border-sky-400/25", dot: "bg-sky-400" },
  warranty: { label: "Warranty", icon: ShieldCheck, tint: "text-amber-300 bg-amber-400/10 border-amber-400/25", dot: "bg-amber-400" },
  subscription: { label: "Subscription", icon: CreditCard, tint: "text-violet-300 bg-violet-400/10 border-violet-400/25", dot: "bg-violet-400" },
  other: { label: "Other", icon: Package, tint: "text-slate-300 bg-slate-400/10 border-slate-400/25", dot: "bg-slate-400" },
};
