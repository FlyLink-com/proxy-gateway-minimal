export function QuotaMeter({
  value,
  ariaLabel
}: {
  value: number;
  ariaLabel: string;
}) {
  const visibleValue = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  const meterValue = Math.min(100, visibleValue);

  return (
    <span
      aria-label={ariaLabel}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={meterValue}
      className="quota-cell"
      role="meter"
    >
      <span>{visibleValue}%</span>
      <span className="quota-track" aria-hidden="true">
        <span style={{ width: `${meterValue}%` }} />
      </span>
    </span>
  );
}
