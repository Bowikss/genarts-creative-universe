import { Link } from "@tanstack/react-router";
export function Brand({ className = "" }: { className?: string }) {
  return (
    <Link to="/" className={`flex items-center gap-2 font-display text-xl tracking-tight ${className}`}>
      <span className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground">G</span>
      Genarts
    </Link>
  );
}
