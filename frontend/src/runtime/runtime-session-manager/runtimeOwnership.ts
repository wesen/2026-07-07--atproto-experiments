// Vendored from @go-go-golems/os-scripting/@go-go-golems/os-ui-cards @ a554dc3 (2026-04-06). See src/runtime/VENDORED.md. Do not edit upstream; port fixes here.
export type RuntimeSessionOwnershipKind =
  | 'window-owned'
  | 'broker-owned'
  | 'attached-read-only'
  | 'attached-writable';

export interface RuntimeSessionOwnership {
  kind: RuntimeSessionOwnershipKind;
  writable: boolean;
}

export const WINDOW_OWNED_RUNTIME_SESSION: RuntimeSessionOwnership = {
  kind: 'window-owned',
  writable: true,
};

export const BROKER_OWNED_RUNTIME_SESSION: RuntimeSessionOwnership = {
  kind: 'broker-owned',
  writable: true,
};

export const ATTACHED_READ_ONLY_RUNTIME_SESSION: RuntimeSessionOwnership = {
  kind: 'attached-read-only',
  writable: false,
};

export const ATTACHED_WRITABLE_RUNTIME_SESSION: RuntimeSessionOwnership = {
  kind: 'attached-writable',
  writable: true,
};

export function shouldDisposeOnLastSurfaceWindowClose(
  ownership: RuntimeSessionOwnership,
): boolean {
  return ownership.kind === 'window-owned';
}
