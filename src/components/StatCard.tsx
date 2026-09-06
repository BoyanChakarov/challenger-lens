import type { ReactNode } from "react";

interface StatCardProps {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  accent?: "mint" | "blue" | "violet" | "amber";
}
export function StatCard({ icon, label, value, detail, accent = "mint" }: StatCardProps) {
  return (
    <article className={`stat-card stat-card--${accent}`}>
      <div className="stat-card__top">
        <span className="stat-card__label">{label}</span>
        <span className="icon-shell" aria-hidden="true">
          {icon}
        </span>
      </div>
      <strong className="stat-card__value">{value}</strong>
      <span className="stat-card__detail">{detail}</span>
    </article>
  );
}
