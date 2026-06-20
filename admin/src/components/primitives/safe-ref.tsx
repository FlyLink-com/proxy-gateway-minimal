export function SafeRef({
  value,
  fallback = "Not recorded",
  className = ""
}: {
  value: number | string | null | undefined;
  fallback?: string;
  className?: string;
}) {
  const displayValue = value === null || value === undefined || value === "" ? fallback : value;
  const classes = ["mono-ref", className].filter(Boolean).join(" ");
  return <span className={classes}>{displayValue}</span>;
}
