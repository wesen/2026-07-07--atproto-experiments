// Vendored from @go-go-golems/os-ui-cards @ a554dc3 (2026-04-06). See src/runtime/VENDORED.md. Do not edit upstream; port fixes here.
export type UIEventRef = { handler: string; args?: unknown };

export type UINode =
  | {
      kind: 'panel' | 'row' | 'column';
      props?: Record<string, unknown>;
      children?: UINode[];
    }
  | {
      kind: 'text' | 'badge';
      props?: Record<string, unknown>;
      text: string;
    }
  | {
      kind: 'button';
      props: {
        label: string;
        onClick?: UIEventRef;
        variant?: string;
      };
    }
  | {
      kind: 'input';
      props: {
        value: string;
        placeholder?: string;
        onChange?: UIEventRef;
      };
    }
  | {
      kind: 'table';
      props: {
        headers: string[];
        rows: unknown[][];
      };
    }
  | {
      kind: 'dropdown';
      props: {
        options: string[];
        selected: number;
        onSelect?: UIEventRef;
        width?: number | string;
      };
    }
  | {
      kind: 'selectableTable';
      props: {
        headers: string[];
        rows: unknown[][];
        selectedRowKeys?: string[];
        mode?: 'single' | 'multiple';
        rowKeyIndex?: number;
        searchable?: boolean;
        searchText?: string;
        searchPlaceholder?: string;
        emptyMessage?: string;
        onSelectionChange?: UIEventRef;
        onSearchChange?: UIEventRef;
        onRowClick?: UIEventRef;
      };
    }
  | {
      kind: 'gridBoard';
      props: {
        rows: number;
        cols: number;
        cells?: Array<{
          value?: string;
          label?: string;
          color?: string;
          disabled?: boolean;
          style?: string;
        }>;
        selectedIndex?: number | null;
        cellSize?: 'small' | 'medium' | 'large';
        disabled?: boolean;
        onSelect?: UIEventRef;
      };
    };
