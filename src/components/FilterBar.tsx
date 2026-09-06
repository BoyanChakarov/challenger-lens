import { Search, SlidersHorizontal } from "lucide-react";
import type { DashboardFilters, RegionFilter, RoleFilter } from "../types";

interface FilterBarProps {
  filters: DashboardFilters;
  patches: string[];
  onChange: (filters: DashboardFilters) => void;
}
const regions: Array<{ value: RegionFilter; label: string }> = [
  { value: "ALL", label: "EUW + EUNE" },
  { value: "EUW", label: "EUW" },
  { value: "EUNE", label: "EUNE" },
];

const roles: Array<{ value: RoleFilter; label: string }> = [
  { value: "ALL", label: "All roles" },
  { value: "TOP", label: "Top" },
  { value: "JUNGLE", label: "Jungle" },
  { value: "MID", label: "Mid" },
  { value: "ADC", label: "Bot / ADC" },
  { value: "SUPPORT", label: "Support" },
];

export function FilterBar({ filters, patches, onChange }: FilterBarProps) {
  const update = <Key extends keyof DashboardFilters>(
    key: Key,
    value: DashboardFilters[Key],
  ) => onChange({ ...filters, [key]: value });

  return (
    <section className="filter-bar" aria-label="Dashboard filters">
      <div className="filter-bar__heading">
        <span className="icon-shell icon-shell--small" aria-hidden="true">
          <SlidersHorizontal size={16} />
        </span>
        <div>
          <strong>Scope the evidence</strong>
          <span>Every panel responds to these filters</span>
        </div>
      </div>

      <div className="filter-control filter-control--search">
        <label htmlFor="champion-search">Champion or matchup</label>
        <div className="search-field">
          <Search size={16} aria-hidden="true" />
          <input
            id="champion-search"
            type="search"
            value={filters.query}
            placeholder="Try Kassadin or Syndra"
            onChange={(event) => update("query", event.target.value)}
          />
        </div>
      </div>

      <div className="filter-control">
        <label htmlFor="patch-filter">Patch</label>
        <select
          id="patch-filter"
          value={filters.patch}
          onChange={(event) => update("patch", event.target.value)}
        >
          {patches.map((patch, index) => (
            <option key={patch} value={patch}>
              {patch} {index === 0 ? "· latest" : ""}
            </option>
          ))}
        </select>
      </div>

      <div className="filter-control">
        <label htmlFor="region-filter">Region</label>
        <select
          id="region-filter"
          value={filters.region}
          onChange={(event) => update("region", event.target.value as RegionFilter)}
        >
          {regions.map((region) => (
            <option key={region.value} value={region.value}>
              {region.label}
            </option>
          ))}
        </select>
      </div>

      <div className="filter-control">
        <label htmlFor="role-filter">Role</label>
        <select
          id="role-filter"
          value={filters.role}
          onChange={(event) => update("role", event.target.value as RoleFilter)}
        >
          {roles.map((role) => (
            <option key={role.value} value={role.value}>
              {role.label}
            </option>
          ))}
        </select>
      </div>

      <div className="filter-control">
        <label htmlFor="sample-filter">Minimum sample</label>
        <select
          id="sample-filter"
          value={filters.minGames}
          onChange={(event) => update("minGames", Number(event.target.value))}
        >
          <option value={10}>10 games</option>
          <option value={25}>25 games</option>
          <option value={50}>50 games</option>
          <option value={100}>100 games</option>
        </select>
      </div>
    </section>
  );
}
