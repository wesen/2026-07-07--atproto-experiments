// Registers the `ui.card.v1` surface type (packId -> { validate, render })
// using the vendored UINode schema and our self-contained React renderer.
import type { RuntimeSurfaceTypeDefinition } from '../runtime/runtime-packs';
import { UIRuntimeRenderer } from './UIRuntimeRenderer';
import type { UINode } from './uiTypes';
import { validateUINode } from './uiSchema';

export const UI_CARD_V1_RUNTIME_SURFACE_TYPE: RuntimeSurfaceTypeDefinition<UINode> = {
  packId: 'ui.card.v1',
  validateTree: validateUINode,
  render: ({ tree, onEvent }) => <UIRuntimeRenderer tree={tree} onEvent={onEvent} />,
};
