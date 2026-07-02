import { useState, type Key, type KeyboardEvent, type ReactNode } from "react";
import { StateFeedback, type StateFeedbackTone } from "./state-feedback";

export type DataTableColumn<Row> = {
  header: ReactNode;
  key: string;
  render: (row: Row) => ReactNode;
};

export type DataTableState = {
  description?: ReactNode;
  title: ReactNode;
  tone: StateFeedbackTone;
};

export type DataTablePagination = {
  currentPage?: number;
  displayTotalRows?: number;
  label?: string;
  nextLabel?: string;
  onPageChange?: (page: number) => void | Promise<void>;
  pageSize: number;
  previousLabel?: string;
  showPageSummary?: boolean;
  showWhenSinglePage?: boolean;
  totalRows?: number;
};

export function DataTable<Row>({
  ariaLabel,
  className = "",
  columns,
  density = "standard",
  fixedRowCount,
  getRowKey,
  getRowLabel,
  onRowSelect,
  pagination,
  rows,
  selectedRowKey,
  state
}: {
  ariaLabel: string;
  className?: string;
  columns: Array<DataTableColumn<Row>>;
  density?: "standard" | "compact";
  fixedRowCount?: number;
  getRowKey: (row: Row) => Key;
  getRowLabel?: (row: Row) => string;
  onRowSelect?: (row: Row) => void;
  pagination?: DataTablePagination;
  rows: Row[];
  selectedRowKey?: Key | null;
  state?: DataTableState;
}) {
  const compact = density === "compact";
  const classes = ["new-console-table", compact ? "new-console-table-compact" : "", className].filter(Boolean).join(" ");
  const shellClasses = ["new-console-table-shell", compact ? "new-console-table-shell-compact" : ""].filter(Boolean).join(" ");
  const selectable = onRowSelect !== undefined;
  const pageSize = Math.max(1, pagination?.pageSize ?? rows.length);
  const remotePagination = pagination?.onPageChange !== undefined;
  const totalRows = Math.max(rows.length, pagination?.totalRows ?? rows.length);
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const [page, setPage] = useState(1);
  const currentPage = Math.min(pagination?.currentPage ?? page, totalPages);
  const paginationEnabled = pagination !== undefined && state === undefined && totalRows > 0;
  const visibleRows = paginationEnabled
    ? remotePagination
      ? rows
      : rows.slice((currentPage - 1) * pageSize, currentPage * pageSize)
    : rows;
  const fixedVisibleRowCount = Math.max(0, Math.floor(fixedRowCount ?? 0));
  const placeholderRowCount = state === undefined
    ? Math.max(0, fixedVisibleRowCount - visibleRows.length)
    : 0;
  const firstVisibleRow = paginationEnabled ? (currentPage - 1) * pageSize + 1 : 0;
  const lastVisibleRow = paginationEnabled ? Math.min(firstVisibleRow + visibleRows.length - 1, totalRows) : 0;
  const showPagination = paginationEnabled && (totalPages > 1 || pagination?.showWhenSinglePage === true);
  const handlePageChange = (nextPage: number) => {
    if (pagination?.onPageChange) {
      void pagination.onPageChange(nextPage);
      return;
    }
    setPage(nextPage);
  };

  return (
    <div className={shellClasses}>
      <div className={classes} role="table" aria-label={ariaLabel} aria-busy={state?.tone === "loading" ? true : undefined}>
        <div className="new-console-row new-console-row-head" role="row">
          {columns.map((column) => (
            <span key={column.key} role="columnheader">
              {column.header}
            </span>
          ))}
        </div>
        {state ? (
          <div className={`new-console-row new-console-state-row new-console-state-${state.tone}`} role="row">
            <div className="new-console-state-cell" role="cell">
              <StateFeedback
                chrome="none"
                className="new-console-state-feedback"
                description={state.description}
                role={state.tone === "error" ? "alert" : "status"}
                title={state.title}
                tone={state.tone}
              />
            </div>
          </div>
        ) : visibleRows.map((row) => {
          const rowKey = getRowKey(row);
          const selected = selectedRowKey !== null && selectedRowKey !== undefined && rowKey === selectedRowKey;
          const rowClasses = [
            "new-console-row",
            selectable ? "new-console-row-selectable" : "",
            selected ? "new-console-row-selected" : ""
          ].filter(Boolean).join(" ");
          return (
            <div
              aria-label={getRowLabel?.(row)}
              aria-selected={selectable ? selected : undefined}
              className={rowClasses}
              key={rowKey}
              role="row"
              tabIndex={selectable ? 0 : undefined}
              onClick={selectable ? () => onRowSelect?.(row) : undefined}
              onKeyDown={selectable ? (event: KeyboardEvent<HTMLDivElement>) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onRowSelect?.(row);
                }
              } : undefined}
            >
              {columns.map((column) => (
                <span key={column.key} role="cell">
                  {column.render(row)}
                </span>
              ))}
            </div>
          );
        })}
        {Array.from({ length: placeholderRowCount }, (_slot, index) => (
          <div
            aria-hidden="true"
            className="new-console-row new-console-row-placeholder"
            key={`placeholder-${currentPage}-${index}`}
            role="presentation"
          >
            {columns.map((column) => (
              <span aria-hidden="true" key={column.key} />
            ))}
          </div>
        ))}
      </div>
      {showPagination ? (
        <DataCardPagination
          currentPage={currentPage}
          displayTotalRows={pagination?.displayTotalRows}
          firstVisibleRow={firstVisibleRow}
          label={pagination?.label ?? `${ariaLabel} pagination`}
          lastVisibleRow={lastVisibleRow}
          nextLabel={pagination?.nextLabel}
          onPageChange={handlePageChange}
          previousLabel={pagination?.previousLabel}
          showPageSummary={pagination?.showPageSummary}
          totalPages={totalPages}
          totalRows={totalRows}
        />
      ) : null}
    </div>
  );
}

export function DataCardPagination({
  currentPage,
  displayTotalRows,
  firstVisibleRow,
  label,
  lastVisibleRow,
  nextLabel = "Next",
  onPageChange,
  previousLabel = "Prev",
  showPageSummary = true,
  totalPages,
  totalRows
}: {
  currentPage: number;
  displayTotalRows?: number;
  firstVisibleRow: number;
  label: string;
  lastVisibleRow: number;
  nextLabel?: string;
  onPageChange: (page: number) => void;
  previousLabel?: string;
  showPageSummary?: boolean;
  totalPages: number;
  totalRows: number;
}) {
  const previousDisabled = currentPage <= 1;
  const nextDisabled = currentPage >= totalPages;
  const visibleTotalRows = displayTotalRows ?? totalRows;
  const formattedTotalRows = visibleTotalRows.toLocaleString("en-US");

  return (
    <nav
      aria-label={label}
      className="data-card-pagination"
      data-figma-component="DataCardPagination"
      data-ui-surface="data-card-pagination"
    >
      <span className="data-card-pagination-range">
        Showing {firstVisibleRow}-{lastVisibleRow} of {formattedTotalRows}
      </span>
      <div className="data-card-pagination-controls">
        <button
          className="data-card-pagination-button"
          disabled={previousDisabled}
          onClick={() => onPageChange(currentPage - 1)}
          type="button"
        >
          {previousLabel}
        </button>
        {showPageSummary ? (
          <span className="data-card-pagination-page" aria-live="polite">
            Page {currentPage} / {totalPages}
          </span>
        ) : null}
        <button
          className="data-card-pagination-button"
          disabled={nextDisabled}
          onClick={() => onPageChange(currentPage + 1)}
          type="button"
        >
          {nextLabel}
        </button>
      </div>
    </nav>
  );
}
