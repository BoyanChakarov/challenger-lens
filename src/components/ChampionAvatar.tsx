import { useEffect, useState, type CSSProperties } from "react";

interface ChampionAvatarProps {
  name: string;
  size?: "small" | "medium" | "large";
  muted?: boolean;
  championId?: number;
  dataDragonVersion?: string;
  assetKey?: string;
}
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) return words.slice(0, 2).map((word) => word[0]).join("");
  return name.slice(0, 2);
}

function hueFor(name: string): number {
  return Array.from(name).reduce((sum, character) => sum + character.charCodeAt(0), 0) % 360;
}

export function ChampionAvatar({
  name,
  size = "medium",
  muted = false,
  championId,
  dataDragonVersion,
  assetKey,
}: ChampionAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const hue = hueFor(name);
  const imageUrl = dataDragonVersion && assetKey
    ? `https://ddragon.leagueoflegends.com/cdn/${dataDragonVersion}/img/champion/${assetKey}.png`
    : undefined;

  useEffect(() => setImageFailed(false), [imageUrl]);

  const style: CSSProperties = {
    background: muted
      ? `linear-gradient(145deg, hsl(${hue} 18% 25%), hsl(${hue} 14% 14%))`
      : `linear-gradient(145deg, hsl(${hue} 62% 49%), hsl(${(hue + 38) % 360} 52% 23%))`,
  };

  return (
    <span
      className={`champion-avatar champion-avatar--${size}`}
      style={style}
      aria-label={championId ? `${name} champion portrait` : undefined}
      aria-hidden={championId ? undefined : "true"}
    >
      {imageUrl && !imageFailed ? (
        <img src={imageUrl} alt="" onError={() => setImageFailed(true)} />
      ) : initials(name).toUpperCase()}
    </span>
  );
}
