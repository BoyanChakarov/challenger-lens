import { ArrowUpDown, SearchX } from "lucide-react";
import { useMemo, useState } from "react";
import {
  formatPercent,
  type ChampionRollup,
} from "../lib/analytics";
import { ChampionAvatar } from "./ChampionAvatar";

type SortKey =
  | "games"
  | "winRate"
  | "avgKda"
  | "avgCsPerMinute"
  | "avgGoldPerMinute"
  | "avgDamagePerMinute";

interface ChampionTableProps {
  rows: ChampionRollup[];
}

const roleLabels: Record<ChampionRollup["role"], string> = {
  TOP: "Top",
  JUNGLE: "Jungle",
  MID: "Mid",
  ADC: "Bot / ADC",
  SUPPORT: "Support",
};

export function ChampionTable({ rows }: ChampionTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("games");
  const sortedRows = useMemo(
    () => [...rows].sort((left, right) => right[sortKey] - left[sortKey]),
    [rows, sortKey],
  );

  const heading = (label: string, key: SortKey, className = "") => (
    <th
      className={className}
      scope="col"
      aria-sort={sortKey === key ? "descending" : "none"}
    >
      <button
        className={sortKey === key ? "table-sort table-sort--active" : "table-sort"}
        type="button"
        onClick={() => setSortKey(key)}
        aria-label={`Sort by ${label}`}
      >
        {label}
        <ArrowUpDown size={13} aria-hidden="true" />
      </button>
    </th>
  );

  if (sortedRows.length === 0) {
    return (
      <div className="empty-state">
        <SearchX size={24} aria-hidden="true" />
        <strong>No champion rows match this scope</strong>
        <span>Try a broader region, role, patch, or search.</span>
      </div>
    );
  }

  return (
    <div className="table-shell">
      <table className="champion-table">
        <thead>
          <tr>
            <th scope="col">Champion</th>
            {heading("Games", "games")}
            {heading("Win rate", "winRate")}
            {heading("KDA", "avgKda", "optional-column optional-column--tablet")}
            {heading("CS / min", "avgCsPerMinute", "optional-column optional-column--desktop")}
            {heading("Gold / min", "avgGoldPerMinute", "optional-column optional-column--desktop")}
            {heading("Damage / min", "avgDamagePerMinute", "optional-column optional-column--tablet")}
          </tr>
        </thead>
        <tbody>
          {sortedRows.slice(0, 12).map((row) => (
            <tr key={row.id}>
              <td>
                <div className="table-champion">
                  <ChampionAvatar name={row.championName} size="small" />
                  <div>
                    <strong>{row.championName}</strong>
                    <span>{roleLabels[row.role]} · {row.uniquePlayers} players</span>
                  </div>
                </div>
              </td>
              <td className="numeric-cell">{row.games.toLocaleString()}</td>
              <td>
                <div className="win-rate-cell">
                  <strong>{formatPercent(row.winRate)}</strong>
                  <span className="mini-bar" aria-hidden="true">
                    <span style={{ width: `${Math.min(row.winRate * 100, 100)}%` }} />
                  </span>
                </div>
              </td>
              <td className="numeric-cell optional-column optional-column--tablet">
                {row.avgKda.toFixed(2)}
              </td>
              <td className="numeric-cell optional-column optional-column--desktop">
                {row.avgCsPerMinute.toFixed(1)}
              </td>
              <td className="numeric-cell optional-column optional-column--desktop">
                {Math.round(row.avgGoldPerMinute)}
              </td>
              <td className="numeric-cell optional-column optional-column--tablet">
                {Math.round(row.avgDamagePerMinute).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
