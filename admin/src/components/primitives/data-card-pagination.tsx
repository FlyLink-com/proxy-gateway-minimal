import { ChevronLeft, ChevronRight } from "lucide-react";

export type DataCardPaginationProps = {
  ariaLabel: string;
  itemLabel?: string;
  onPageChange?: (page: number) => void;
  page?: number;
  pageSize: number;
  totalItems: number;
};

export function DataCardPagination({
  ariaLabel,
  itemLabel = "items",
  onPageChange,
  page = 1,
  pageSize,
  totalItems
}: DataCardPaginationProps) {
  const safePageSize = Math.max(1, pageSize);
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const firstItem = totalItems === 0 ? 0 : ((currentPage - 1) * safePageSize) + 1;
  const lastItem = Math.min(totalItems, currentPage * safePageSize);
  const controlSubject = ariaLabel.replace(/\s+pagination$/i, "");
  const previousPage = currentPage - 1;
  const nextPage = currentPage + 1;

  return (
    <nav
      aria-label={ariaLabel}
      className="data-card-pagination"
      data-figma-component="DataCardPagination"
      data-pagination-standard-node-id="157:2"
      data-ui-surface="data-card-pagination"
    >
      <div className="data-card-pagination-summary">
        <strong>{firstItem}-{lastItem} of {totalItems} {itemLabel}</strong>
        <span>Page {currentPage} of {totalPages}</span>
      </div>
      <div className="data-card-pagination-controls">
        <button
          aria-label={`Previous ${controlSubject} page`}
          disabled={previousPage < 1 || !onPageChange}
          onClick={() => onPageChange?.(previousPage)}
          type="button"
        >
          <ChevronLeft aria-hidden="true" />
        </button>
        <button
          aria-label={`Next ${controlSubject} page`}
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
