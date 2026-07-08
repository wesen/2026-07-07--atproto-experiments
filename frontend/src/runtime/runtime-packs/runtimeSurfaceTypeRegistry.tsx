// Vendored from @go-go-golems/os-scripting/@go-go-golems/os-ui-cards @ a554dc3 (2026-04-06). See src/runtime/VENDORED.md. Do not edit upstream; port fixes here.
import type { ReactNode } from 'react';

export const UI_CARD_V1_RUNTIME_SURFACE_TYPE_ID = 'ui.card.v1' as const;

export type RuntimeSurfaceTypeId = typeof UI_CARD_V1_RUNTIME_SURFACE_TYPE_ID | string;
export type RuntimeSurfaceTree = unknown;

export interface RuntimeSurfaceTypeRendererProps<TTree> {
  tree: TTree;
  onEvent: (handler: string, args?: unknown) => void;
}

export interface RuntimeSurfaceTypeDefinition<TTree> {
  packId: RuntimeSurfaceTypeId;
  validateTree: (value: unknown) => TTree;
  render: (props: RuntimeSurfaceTypeRendererProps<TTree>) => ReactNode;
}

const runtimeSurfaceTypes = new Map<string, RuntimeSurfaceTypeDefinition<unknown>>();

export function registerRuntimeSurfaceType<TTree>(definition: RuntimeSurfaceTypeDefinition<TTree>): void {
  runtimeSurfaceTypes.set(definition.packId, definition as RuntimeSurfaceTypeDefinition<unknown>);
}

export function clearRuntimeSurfaceTypes(): void {
  runtimeSurfaceTypes.clear();
}

export function normalizeRuntimeSurfaceTypeId(packId?: string | null): string {
  if (typeof packId !== 'string') {
    throw new Error('Runtime surface type id is required');
  }

  const trimmed = packId.trim();
  if (trimmed.length === 0) {
    throw new Error('Runtime surface type id is required');
  }
  return trimmed;
}

export function getRuntimeSurfaceTypeOrThrow(packId?: string | null): RuntimeSurfaceTypeDefinition<unknown> {
  const normalized = normalizeRuntimeSurfaceTypeId(packId);
  const surfaceType = runtimeSurfaceTypes.get(normalized);
  if (!surfaceType) {
    throw new Error(`Unknown runtime surface type: ${normalized}`);
  }
  return surfaceType;
}

export function listRuntimeSurfaceTypes(): string[] {
  return Array.from(runtimeSurfaceTypes.keys()).sort();
}

export function validateRuntimeSurfaceTree<TTree = RuntimeSurfaceTree>(packId: string | undefined, value: unknown): TTree {
  return getRuntimeSurfaceTypeOrThrow(packId).validateTree(value) as TTree;
}

export function renderRuntimeSurfaceTree(packId: string | undefined, value: unknown, onEvent: (handler: string, args?: unknown) => void): ReactNode {
  const surfaceType = getRuntimeSurfaceTypeOrThrow(packId);
  const tree = surfaceType.validateTree(value);
  return surfaceType.render({ tree, onEvent });
}
