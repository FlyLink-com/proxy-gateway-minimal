import type { CSSProperties, Key, KeyboardEvent, ReactNode } from "react";

export type DataTableColumn<Row> = {
  header: ReactNode;
  key: string;
  render: (row: Row) => ReactNode;
};

export type DataTableState = {
  description?: ReactNode;
  title: ReactNode;
  tone: "empty" | "error" | "loading";
};

export function DataTable<Row>({
  ariaLabel,
  className = "",
  columns,
  getRowKey,
  getRowLabel,
  onRowSelect,
  rows,
  selectedRowKey,
  state
}: {
  ariaLabel: string;
  className?: string;
  columns: Array<DataTableColumn<Row>>;
  getRowKey: (row: Row) => Key;
  getRowLabel?: (row: Row) => string;
  onRowSelect?: (row: Row) => void;
  rows: Row[];
  selectedRowKey?: Key | null;
  state?: DataTableState;
}) {
  const classes = ["new-console-table", className].filter(Boolean).join(" ");
  const selectable = onRowSelect !== undefined;
  const tableStyle = {
    "--admin-table-column-count": columns.length,
    "--admin-table-min-width": `${Math.max(520, columns.length * 132)}px`
  } as CSSProperties;

  return (
    <div
      aria-busy={state?.tone === "loading" ? true : undefined}
      aria-label={ariaLabel}
      className={classes}
      data-column-count={columns.length}
      role="table"
      style={tableStyle}
    >
      <div className="new-console-row new-console-row-head" role="row">
        {columns.map((column) => (
          <span key={column.key} role="columnheader">
            {column.header}
          </span>
        ))}
      </div>
      {state ? (
        <div className={`new-console-row new-console-state-row new-console-state-${state.tone}`} role="row">
          <span className="new-console-state-cell" role="cell">
            <strong>{state.title}</strong>
            {state.description ? <small>{state.description}</small> : null}
          </span>
        </div>
      ) : rows.map((row) => {
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
  );
}
