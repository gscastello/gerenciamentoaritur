import { useReducedMotion } from "./useReducedMotion.js";

/**
 * Bloco de esqueleto com shimmer. Sempre no formato do conteúdo real —
 * passe width/height/rounded para casar com o que vai aparecer.
 * Com prefers-reduced-motion: fica estático (sem shimmer).
 */
export function Skeleton({ width, height = 16, rounded = 8, style, className = "" }) {
  const reduced = useReducedMotion();
  return (
    <span
      aria-hidden="true"
      className={`motion-skeleton ${className}`}
      style={{
        display: "block",
        width: width ?? "100%",
        height,
        borderRadius: rounded,
        position: "relative",
        overflow: "hidden",
        background: "var(--skeleton-base, #1c222b)",
        ...style,
      }}
    >
      {!reduced && (
        <span
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(90deg, transparent, var(--skeleton-shine, rgba(255,255,255,.06)), transparent)",
            animation: "motion-shimmer 1.4s ease-in-out infinite",
          }}
        />
      )}
    </span>
  );
}

/** Linhas de texto — a última sai mais curta, como parágrafo real. */
export function SkeletonText({ lines = 3, gap = 8, lastLineWidth = "60%" }) {
  return (
    <span style={{ display: "flex", flexDirection: "column", gap }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          // biome-ignore lint/suspicious/noArrayIndexKey: lista estática de placeholders
          key={i}
          height={12}
          width={i === lines - 1 ? lastLineWidth : "100%"}
        />
      ))}
    </span>
  );
}

/** Card de estatística (StatCard do app). */
export function SkeletonStat() {
  return (
    <div
      style={{
        border: "1px solid var(--border, #262d38)",
        borderRadius: 12,
        padding: 20,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <span style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
        <Skeleton height={10} width="50%" />
        <Skeleton height={20} width="35%" />
      </span>
      <Skeleton height={36} width={36} rounded={10} />
    </div>
  );
}
