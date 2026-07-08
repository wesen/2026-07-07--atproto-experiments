// Self-contained replacement for os-ui-cards UIRuntimeRenderer.
// Renders UINode trees with plain HTML instead of @go-go-golems/os-core widgets,
// so this page has no desktop-shell dependency. Tree shapes are identical.
import type { ReactNode } from 'react';
import type { UIEventRef, UINode } from './uiTypes';

export interface UIRuntimeRendererProps {
  tree: UINode;
  onEvent: (handler: string, args?: unknown) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergeArgs(eventArgs: unknown, payload: Record<string, unknown>): unknown {
  if (!isRecord(eventArgs)) {
    return payload;
  }
  return { ...eventArgs, ...payload };
}

function eventHandler(ref: UIEventRef | undefined, onEvent: UIRuntimeRendererProps['onEvent'], payload?: unknown) {
  if (!ref) {
    return;
  }
  if (payload && isRecord(payload)) {
    onEvent(ref.handler, mergeArgs(ref.args, payload));
    return;
  }
  onEvent(ref.handler, ref.args);
}

const BTN_VARIANT_STYLE: Record<string, React.CSSProperties> = {
  default: { padding: '4px 12px', cursor: 'pointer' },
  primary: { padding: '4px 12px', cursor: 'pointer', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 4 },
  danger: { padding: '4px 12px', cursor: 'pointer', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4 },
};

export function UIRuntimeRenderer({ tree, onEvent }: UIRuntimeRendererProps) {
  function toSelectableTableRows(node: Extract<UINode, { kind: 'selectableTable' }>) {
    const rowKeyIndex = node.props.rowKeyIndex ?? Number.NaN;
    const keyIndex = Number.isFinite(rowKeyIndex) ? Math.max(0, Math.floor(rowKeyIndex)) : 0;
    return node.props.rows.map((row, rowIndex) => {
      const rowValues = Array.isArray(row) ? row : [];
      const entry: Record<string, unknown> = {
        id: String(rowValues[keyIndex] ?? rowIndex),
        __rowIndex: rowIndex,
        __rowValues: rowValues,
      };
      node.props.headers.forEach((_, index) => {
        entry[`c${index}`] = String(rowValues[index] ?? '');
      });
      return entry;
    });
  }

  function renderNode(node: UINode, keyHint: string): ReactNode {
    if (node.kind === 'panel') {
      return (
        <div key={keyHint} style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12 }}>
          {(node.children ?? []).map((child, index) => renderNode(child, `${keyHint}:panel:${index}`))}
        </div>
      );
    }

    if (node.kind === 'column') {
      return (
        <div key={keyHint} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(node.children ?? []).map((child, index) => renderNode(child, `${keyHint}:column:${index}`))}
        </div>
      );
    }

    if (node.kind === 'row') {
      return (
        <div key={keyHint} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {(node.children ?? []).map((child, index) => renderNode(child, `${keyHint}:row:${index}`))}
        </div>
      );
    }

    if (node.kind === 'text') {
      return <span key={keyHint}>{node.text}</span>;
    }

    if (node.kind === 'badge') {
      return (
        <span
          key={keyHint}
          style={{
            display: 'inline-flex',
            padding: '2px 8px',
            borderRadius: 999,
            background: 'var(--hc-accent, #d0e7ff)',
            color: '#0f172a',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {node.text}
        </span>
      );
    }

    if (node.kind === 'button') {
      const variant = (node.props.variant as keyof typeof BTN_VARIANT_STYLE | undefined) ?? 'default';
      return (
        <button
          key={keyHint}
          type="button"
          style={BTN_VARIANT_STYLE[variant] ?? BTN_VARIANT_STYLE.default}
          onClick={() => eventHandler(node.props.onClick, onEvent)}
        >
          {node.props.label}
        </button>
      );
    }

    if (node.kind === 'input') {
      return (
        <input
          key={keyHint}
          value={node.props.value}
          placeholder={node.props.placeholder}
          onChange={(event) => eventHandler(node.props.onChange, onEvent, { value: event.target.value })}
        />
      );
    }

    if (node.kind === 'table') {
      return (
        <table key={keyHint} style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {node.props.headers.map((header: string, index: number) => (
                <th key={`${keyHint}:h:${index}`} style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '4px 8px' }}>
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {node.props.rows.map((row: unknown[], rowIndex: number) => (
              <tr key={`${keyHint}:r:${rowIndex}`}>
                {row.map((value: unknown, colIndex: number) => (
                  <td key={`${keyHint}:r:${rowIndex}:c:${colIndex}`} style={{ padding: '4px 8px', borderBottom: '1px solid #eee' }}>
                    {String(value ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    if (node.kind === 'dropdown') {
      const selected = Number.isFinite(node.props.selected) ? Math.max(0, Math.floor(node.props.selected)) : 0;
      return (
        <select
          key={keyHint}
          value={selected}
          style={node.props.width ? { width: typeof node.props.width === 'number' ? `${node.props.width}px` : node.props.width } : undefined}
          onChange={(event) =>
            eventHandler(node.props.onSelect, onEvent, {
              index: event.target.selectedIndex,
              value: String(node.props.options[event.target.selectedIndex] ?? ''),
            })
          }
        >
          {node.props.options.map((option: string, index: number) => (
            <option key={`${keyHint}:o:${index}`} value={index}>
              {option}
            </option>
          ))}
        </select>
      );
    }

    if (node.kind === 'selectableTable') {
      const items = toSelectableTableRows(node);
      const selectedKeys = new Set(node.props.selectedRowKeys ?? []);
      return (
        <div key={keyHint} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {node.props.searchable && (
            <input
              placeholder={node.props.searchPlaceholder ?? 'Search…'}
              value={node.props.searchText ?? ''}
              onChange={(event) => eventHandler(node.props.onSearchChange, onEvent, { value: event.target.value })}
            />
          )}
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {node.props.headers.map((header: string, index: number) => (
                  <th key={`${keyHint}:h:${index}`} style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '4px 8px' }}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={node.props.headers.length} style={{ padding: '8px', color: '#888' }}>
                    {node.props.emptyMessage ?? 'No rows'}
                  </td>
                </tr>
              )}
              {items.map((row) => {
                const rowKey = String(row.id);
                const rowValues = Array.isArray(row.__rowValues) ? (row.__rowValues as unknown[]) : [];
                return (
                  <tr
                    key={`${keyHint}:r:${rowKey}`}
                    style={{
                      cursor: node.props.onRowClick ? 'pointer' : 'default',
                      background: selectedKeys.has(rowKey) ? '#dbeafe' : 'transparent',
                    }}
                    onClick={() =>
                      eventHandler(node.props.onRowClick, onEvent, {
                        rowIndex: Number(row.__rowIndex ?? -1),
                        rowKey,
                        rowValues,
                      })
                    }
                  >
                    {rowValues.map((value: unknown, colIndex: number) => (
                      <td key={`${keyHint}:r:${rowKey}:c:${colIndex}`} style={{ padding: '4px 8px', borderBottom: '1px solid #eee' }}>
                        {String(value ?? '')}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
    }

    if (node.kind === 'gridBoard') {
      const cellSize = node.props.cellSize === 'large' ? 56 : node.props.cellSize === 'small' ? 28 : 40;
      const total = node.props.rows * node.props.cols;
      const cells = node.props.cells ?? [];
      return (
        <div
          key={keyHint}
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${node.props.cols}, ${cellSize}px)`,
            gridTemplateRows: `repeat(${node.props.rows}, ${cellSize}px)`,
            gap: 2,
          }}
        >
          {Array.from({ length: total }, (_, index) => {
            const cell = cells[index];
            const selected = node.props.selectedIndex === index;
            return (
              <button
                key={`${keyHint}:c:${index}`}
                type="button"
                disabled={node.props.disabled || cell?.disabled}
                style={{
                  width: cellSize,
                  height: cellSize,
                  cursor: 'pointer',
                  background: selected ? '#3b82f6' : cell?.color ?? '#f3f4f6',
                  color: selected ? '#fff' : '#111',
                  border: selected ? '1px solid #1d4ed8' : '1px solid #d1d5db',
                  borderRadius: 4,
                  fontSize: cellSize > 36 ? 12 : 10,
                }}
                onClick={() => eventHandler(node.props.onSelect, onEvent, { row: Math.floor(index / node.props.cols), col: index % node.props.cols, index })}
              >
                {cell?.label ?? cell?.value ?? ''}
              </button>
            );
          })}
        </div>
      );
    }

    return null;
  }

  return <>{renderNode(tree, 'plugin-root')}</>;
}
