// Vendored from @go-go-golems/os-ui-cards @ a554dc3 (2026-04-06). See src/runtime/VENDORED.md. Do not edit upstream; port fixes here.
import type { UIEventRef, UINode } from './uiTypes';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function assertEventRef(value: unknown, path: string): asserts value is UIEventRef {
  if (!isRecord(value)) {
    throw new Error(`${path} must be an object`);
  }

  if (typeof value.handler !== 'string' || value.handler.length === 0) {
    throw new Error(`${path}.handler must be a non-empty string`);
  }
}

export function assertUINode(value: unknown, path = 'root'): asserts value is UINode {
  if (!isRecord(value)) {
    throw new Error(`${path} must be an object`);
  }

  const kind = value.kind;
  if (typeof kind !== 'string') {
    throw new Error(`${path}.kind must be a string`);
  }

  if (kind === 'panel' || kind === 'row' || kind === 'column') {
    if (value.children !== undefined) {
      if (!Array.isArray(value.children)) {
        throw new Error(`${path}.children must be an array`);
      }
      value.children.forEach((child, index) => assertUINode(child, `${path}.children[${index}]`));
    }
    return;
  }

  if (kind === 'text' || kind === 'badge') {
    if (typeof value.text !== 'string') {
      throw new Error(`${path}.text must be a string`);
    }
    return;
  }

  if (kind === 'button') {
    if (!isRecord(value.props) || typeof value.props.label !== 'string') {
      throw new Error(`${path}.props.label must be a string`);
    }
    if (value.props.onClick !== undefined) {
      assertEventRef(value.props.onClick, `${path}.props.onClick`);
    }
    return;
  }

  if (kind === 'input') {
    if (!isRecord(value.props) || typeof value.props.value !== 'string') {
      throw new Error(`${path}.props.value must be a string`);
    }
    if (value.props.onChange !== undefined) {
      assertEventRef(value.props.onChange, `${path}.props.onChange`);
    }
    return;
  }

  if (kind === 'table') {
    if (!isRecord(value.props)) {
      throw new Error(`${path}.props must be an object`);
    }

    if (!Array.isArray(value.props.headers) || value.props.headers.some((header) => typeof header !== 'string')) {
      throw new Error(`${path}.props.headers must be a string[]`);
    }

    if (!Array.isArray(value.props.rows) || value.props.rows.some((row) => !Array.isArray(row))) {
      throw new Error(`${path}.props.rows must be an array of rows`);
    }

    return;
  }

  if (kind === 'dropdown') {
    if (!isRecord(value.props)) {
      throw new Error(`${path}.props must be an object`);
    }

    if (!Array.isArray(value.props.options) || value.props.options.some((option) => typeof option !== 'string')) {
      throw new Error(`${path}.props.options must be a string[]`);
    }

    const selected = value.props.selected;
    if (!isFiniteNumber(selected)) {
      throw new Error(`${path}.props.selected must be a finite number`);
    }

    if (value.props.width !== undefined && typeof value.props.width !== 'number' && typeof value.props.width !== 'string') {
      throw new Error(`${path}.props.width must be a number|string`);
    }

    if (value.props.onSelect !== undefined) {
      assertEventRef(value.props.onSelect, `${path}.props.onSelect`);
    }

    return;
  }

  if (kind === 'selectableTable') {
    if (!isRecord(value.props)) {
      throw new Error(`${path}.props must be an object`);
    }

    if (!Array.isArray(value.props.headers) || value.props.headers.some((header) => typeof header !== 'string')) {
      throw new Error(`${path}.props.headers must be a string[]`);
    }

    if (!Array.isArray(value.props.rows) || value.props.rows.some((row) => !Array.isArray(row))) {
      throw new Error(`${path}.props.rows must be an array of rows`);
    }

    if (value.props.selectedRowKeys !== undefined) {
      if (!Array.isArray(value.props.selectedRowKeys) || value.props.selectedRowKeys.some((key) => typeof key !== 'string')) {
        throw new Error(`${path}.props.selectedRowKeys must be a string[]`);
      }
    }

    if (value.props.mode !== undefined && value.props.mode !== 'single' && value.props.mode !== 'multiple') {
      throw new Error(`${path}.props.mode must be single|multiple`);
    }

    const rowKeyIndex = value.props.rowKeyIndex;
    if (rowKeyIndex !== undefined && (!isFiniteNumber(rowKeyIndex) || rowKeyIndex < 0)) {
      throw new Error(`${path}.props.rowKeyIndex must be a non-negative number`);
    }

    if (value.props.searchable !== undefined && typeof value.props.searchable !== 'boolean') {
      throw new Error(`${path}.props.searchable must be a boolean`);
    }

    if (value.props.searchText !== undefined && typeof value.props.searchText !== 'string') {
      throw new Error(`${path}.props.searchText must be a string`);
    }

    if (value.props.searchPlaceholder !== undefined && typeof value.props.searchPlaceholder !== 'string') {
      throw new Error(`${path}.props.searchPlaceholder must be a string`);
    }

    if (value.props.emptyMessage !== undefined && typeof value.props.emptyMessage !== 'string') {
      throw new Error(`${path}.props.emptyMessage must be a string`);
    }

    if (value.props.onSelectionChange !== undefined) {
      assertEventRef(value.props.onSelectionChange, `${path}.props.onSelectionChange`);
    }

    if (value.props.onSearchChange !== undefined) {
      assertEventRef(value.props.onSearchChange, `${path}.props.onSearchChange`);
    }

    if (value.props.onRowClick !== undefined) {
      assertEventRef(value.props.onRowClick, `${path}.props.onRowClick`);
    }

    return;
  }

  if (kind === 'gridBoard') {
    if (!isRecord(value.props)) {
      throw new Error(`${path}.props must be an object`);
    }

    const rows = value.props.rows;
    if (!isFiniteNumber(rows) || rows < 1) {
      throw new Error(`${path}.props.rows must be a positive number`);
    }

    const cols = value.props.cols;
    if (!isFiniteNumber(cols) || cols < 1) {
      throw new Error(`${path}.props.cols must be a positive number`);
    }

    const selectedIndex = value.props.selectedIndex;
    if (selectedIndex !== undefined && selectedIndex !== null && !isFiniteNumber(selectedIndex)) {
      throw new Error(`${path}.props.selectedIndex must be a number|null`);
    }

    if (value.props.cellSize !== undefined && value.props.cellSize !== 'small' && value.props.cellSize !== 'medium' && value.props.cellSize !== 'large') {
      throw new Error(`${path}.props.cellSize must be small|medium|large`);
    }

    if (value.props.disabled !== undefined && typeof value.props.disabled !== 'boolean') {
      throw new Error(`${path}.props.disabled must be a boolean`);
    }

    if (value.props.cells !== undefined) {
      if (!Array.isArray(value.props.cells)) {
        throw new Error(`${path}.props.cells must be an array`);
      }
      value.props.cells.forEach((cell, index) => {
        if (!isRecord(cell)) {
          throw new Error(`${path}.props.cells[${index}] must be an object`);
        }
        if (cell.value !== undefined && typeof cell.value !== 'string') {
          throw new Error(`${path}.props.cells[${index}].value must be a string`);
        }
        if (cell.label !== undefined && typeof cell.label !== 'string') {
          throw new Error(`${path}.props.cells[${index}].label must be a string`);
        }
        if (cell.color !== undefined && typeof cell.color !== 'string') {
          throw new Error(`${path}.props.cells[${index}].color must be a string`);
        }
        if (cell.disabled !== undefined && typeof cell.disabled !== 'boolean') {
          throw new Error(`${path}.props.cells[${index}].disabled must be a boolean`);
        }
        if (cell.style !== undefined && typeof cell.style !== 'string') {
          throw new Error(`${path}.props.cells[${index}].style must be a string`);
        }
      });
    }

    if (value.props.onSelect !== undefined) {
      assertEventRef(value.props.onSelect, `${path}.props.onSelect`);
    }

    return;
  }

  throw new Error(`${path}.kind '${kind}' is not supported`);
}

export function validateUINode(value: unknown): UINode {
  assertUINode(value);
  return value;
}
