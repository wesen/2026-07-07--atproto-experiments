// Vendored from @go-go-golems/os-scripting/@go-go-golems/os-ui-cards @ a554dc3 (2026-04-06). See src/runtime/VENDORED.md. Do not edit upstream; port fixes here.
const __ui = {
  text(content) {
    return { kind: 'text', text: String(content) };
  },
  button(label, props = {}) {
    return { kind: 'button', props: { label: String(label), ...props } };
  },
  input(value, props = {}) {
    return { kind: 'input', props: { value: String(value ?? ''), ...props } };
  },
  row(children = []) {
    return { kind: 'row', children: Array.isArray(children) ? children : [] };
  },
  column(children = []) {
    return { kind: 'column', children: Array.isArray(children) ? children : [] };
  },
  panel(children = []) {
    return { kind: 'panel', children: Array.isArray(children) ? children : [] };
  },
  badge(text) {
    return { kind: 'badge', text: String(text) };
  },
  table(rows = [], props = {}) {
    return {
      kind: 'table',
      props: {
        headers: Array.isArray(props?.headers) ? props.headers : [],
        rows: Array.isArray(rows) ? rows : [],
      },
    };
  },
  dropdown(options = [], props = {}) {
    const selected = Number.isFinite(Number(props?.selected)) ? Number(props.selected) : 0;
    return {
      kind: 'dropdown',
      props: {
        options: Array.isArray(options) ? options.map((option) => String(option)) : [],
        selected,
        onSelect: props?.onSelect,
        width: props?.width,
      },
    };
  },
  selectableTable(rows = [], props = {}) {
    return {
      kind: 'selectableTable',
      props: {
        headers: Array.isArray(props?.headers) ? props.headers.map((header) => String(header)) : [],
        rows: Array.isArray(rows) ? rows : [],
        selectedRowKeys: Array.isArray(props?.selectedRowKeys)
          ? props.selectedRowKeys.map((key) => String(key))
          : [],
        mode: props?.mode,
        rowKeyIndex: Number.isFinite(Number(props?.rowKeyIndex)) ? Number(props.rowKeyIndex) : 0,
        searchable: props?.searchable === true,
        searchText: typeof props?.searchText === 'string' ? props.searchText : '',
        searchPlaceholder: typeof props?.searchPlaceholder === 'string' ? props.searchPlaceholder : undefined,
        emptyMessage: typeof props?.emptyMessage === 'string' ? props.emptyMessage : undefined,
        onSelectionChange: props?.onSelectionChange,
        onSearchChange: props?.onSearchChange,
        onRowClick: props?.onRowClick,
      },
    };
  },
  gridBoard(props = {}) {
    return {
      kind: 'gridBoard',
      props: {
        rows: Number.isFinite(Number(props?.rows)) ? Number(props.rows) : 1,
        cols: Number.isFinite(Number(props?.cols)) ? Number(props.cols) : 1,
        cells: Array.isArray(props?.cells) ? props.cells : [],
        selectedIndex:
          props?.selectedIndex === null || Number.isFinite(Number(props?.selectedIndex))
            ? props.selectedIndex
            : undefined,
        cellSize: props?.cellSize,
        disabled: props?.disabled === true,
        onSelect: props?.onSelect,
      },
    };
  },
};

globalThis.registerRuntimePackageApi('ui', { ui: __ui });
