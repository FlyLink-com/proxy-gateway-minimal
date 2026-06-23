import { useEffect, useMemo, useState, type Key, type KeyboardEvent, type ReactNode } from "react";
import { DataCardPagination } from "./data-card-pagination";
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
  ariaLabel?: string;
  itemLabel?: string;
  label?: string;
  pageSize: number;
};

export function DataTable<Row>({
  ariaLabel,
  className = "",
  columns,
  density,
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
  density?: "compact" | "normal";
  getRowKey: (row: Row) => Key;
  getRowLabel?: (row: Row) => string;
  onRowSelect?: (row: Row) => void;
  pagination?: DataTablePagination;
  rows: Row[];
  selectedRowKey?: Key | null;
  state?: DataTableState;
}) {
  const shellClass = [
    "new-console-table-frame",
    density === "compact" ? "new-console-table-shell-compact" : ""
  ].filter(Boolean).join(" ");
  const classes = [
    "new-console-table",
    density === "compact" ? "new-console-table-compact" : "",
    className
  ].filter(Boolean).join(" ");
  const selectable = onRowSelect !== undefined;
  const [page, setPage] = useState(1);
  const pageSize = pagination ? Math.max(1, pagination.pageSize) : rows.length || 1;
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedRows = useMemo(() => {
    if (!pagination) return rows;
    const start = (currentPage - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [currentPage, pageSize, pagination, rows]);

  useEffect(() => {
    if (page !== currentPage) {
      setPage(currentPage);
    }
  }, [currentPage, page]);

  return (
    <div className={shellClass}>
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
        ) : paginatedRows.map((row) => {
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
      </div>
      {pagination && !state ? (
        <DataCardPagination
          ariaLabel={pagination.ariaLabel}
          itemLabel={pagination.itemLabel}
          label={pagination.label}
          onPageChange={setPage}
          page={currentPage}
          pageSize={pageSize}
          summaryFormat={pagination.label && !pagination.ariaLabel ? "showing" : "range"}
          controlLabels={pagination.label && !pagination.ariaLabel ? "short" : "subject"}
          totalItems={rows.length}
        />
      ) : null}
    </div>
  );
}
