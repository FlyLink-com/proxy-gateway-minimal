import { ChevronLeft, ChevronRight } from "lucide-react";

export type DataCardPaginationProps = {
  ariaLabel?: string;
  itemLabel?: string;
  label?: string;
  onPageChange?: (page: number) => void;
  page?: number;
  pageSize: number;
  summaryFormat?: "range" | "showing";
  controlLabels?: "subject" | "short";
  totalItems: number;
};

export function DataCardPagination({
  ariaLabel,
  label,
  itemLabel = "items",
  onPageChange,
  page = 1,
  pageSize,
  summaryFormat = "range",
  controlLabels = "subject",
  totalItems
}: DataCardPaginationProps) {
  const resolvedAriaLabel = ariaLabel ?? label ?? "Data pagination";
  const safePageSize = Math.max(1, pageSize);
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const firstItem = totalItems === 0 ? 0 : ((currentPage - 1) * safePageSize) + 1;
  const lastItem = Math.min(totalItems, currentPage * safePageSize);
  const controlSubject = resolvedAriaLabel.replace(/\s+pagination$/i, "");
  const previousPage = currentPage - 1;
  const nextPage = currentPage + 1;
  const rangeSummary = summaryFormat === "showing"
    ? `Showing ${firstItem}-${lastItem} of ${totalItems}`
    : `${firstItem}-${lastItem} of ${totalItems} ${itemLabel}`;
  const pageSummary = summaryFormat === "showing"
    ? `Page ${currentPage} / ${totalPages}`
    : `Page ${currentPage} of ${totalPages}`;
  const previousLabel = controlLabels === "short" ? "Previous" : `Previous ${controlSubject} page`;
  const nextLabel = controlLabels === "short" ? "Next" : `Next ${controlSubject} page`;

  return (
    <nav
      aria-label={resolvedAriaLabel}
      className="data-card-pagination"
      data-figma-component="DataCardPagination"
      data-pagination-standard-node-id="157:2"
      data-ui-surface="data-card-pagination"
    >
      <div className="data-card-pagination-summary">
        <strong>{rangeSummary}</strong>
        <span className="data-card-pagination-page">{pageSummary}</span>
      </div>
      <div className="data-card-pagination-controls">
        <button
          aria-label={previousLabel}
          className="data-card-pagination-button"
          disabled={previousPage < 1 || !onPageChange}
          onClick={() => onPageChange?.(previousPage)}
          type="button"
        >
          <ChevronLeft aria-hidden="true" />
        </button>
        <button
          aria-label={nextLabel}
          className="data-card-pagination-button"
          disabled={nextPage > totalPages || !onPageChange}
          onClick={() => onPageChange?.(nextPage)}
          type="button"
        >
          <ChevronRight aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
