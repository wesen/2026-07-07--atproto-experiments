// Vendored from @go-go-golems/os-scripting/@go-go-golems/os-ui-cards @ a554dc3 (2026-04-06). See src/runtime/VENDORED.md. Do not edit upstream; port fixes here.
const __runtimePackageState =
  globalThis.__runtimePackageState && typeof globalThis.__runtimePackageState === 'object'
    ? globalThis.__runtimePackageState
    : {
        packageIds: [],
        apis: {},
      };

globalThis.__runtimePackageState = __runtimePackageState;

let __runtimeBundle = null;
let __runtimeActions = [];

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function mergeRuntimeApiValue(existingValue, incomingValue) {
  if (isPlainObject(existingValue) && isPlainObject(incomingValue)) {
    const merged = { ...existingValue };
    for (const [key, value] of Object.entries(incomingValue)) {
      merged[key] = mergeRuntimeApiValue(merged[key], value);
    }
    return merged;
  }

  return incomingValue;
}

function registerRuntimePackageApi(packageId, apiExports) {
  const normalizedPackageId = String(packageId || '').trim();
  if (!normalizedPackageId) {
    throw new Error('registerRuntimePackageApi requires a package id');
  }

  if (!__runtimePackageState.packageIds.includes(normalizedPackageId)) {
    __runtimePackageState.packageIds.push(normalizedPackageId);
  }

  if (!isPlainObject(apiExports)) {
    return;
  }

  for (const [exportName, exportValue] of Object.entries(apiExports)) {
    const mergedValue = mergeRuntimeApiValue(__runtimePackageState.apis[exportName], exportValue);
    __runtimePackageState.apis[exportName] = mergedValue;
    globalThis[exportName] = mergedValue;
  }
}

function collectRuntimePackageApis() {
  return { ...__runtimePackageState.apis };
}

function defineRuntimeBundleImpl(factory) {
  if (typeof factory !== 'function') {
    throw new Error('defineRuntimeBundle requires a factory function');
  }

  __runtimeBundle = factory(collectRuntimePackageApis());
}

function assertStackBundleReady() {
  if (!__runtimeBundle || typeof __runtimeBundle !== 'object') {
    throw new Error('Runtime bundle did not register via defineRuntimeBundle');
  }
}

function assertSurfacesMap() {
  assertStackBundleReady();
  if (!__runtimeBundle.surfaces || typeof __runtimeBundle.surfaces !== 'object') {
    __runtimeBundle.surfaces = {};
  }
  return __runtimeBundle.surfaces;
}

function normalizeRuntimeSurfacePackId(surfaceId, packId) {
  const normalizedPackId = typeof packId === 'string' ? packId.trim() : '';
  if (!normalizedPackId) {
    throw new Error('Runtime surface packId is required for surface: ' + String(surfaceId));
  }
  return normalizedPackId;
}

function normalizeRuntimeSurfaceDefinition(surfaceId, definitionOrFactory, packId) {
  const normalizedPackId = normalizeRuntimeSurfacePackId(surfaceId, packId);
  const definition =
    typeof definitionOrFactory === 'function'
      ? definitionOrFactory(collectRuntimePackageApis())
      : definitionOrFactory;

  if (!definition || typeof definition !== 'object') {
    throw new Error('Runtime surface definition must be an object for surface: ' + String(surfaceId));
  }

  if (typeof definition.render !== 'function') {
    throw new Error('Runtime surface definition render() is required for surface: ' + String(surfaceId));
  }

  if (definition.handlers !== undefined) {
    if (!definition.handlers || typeof definition.handlers !== 'object' || Array.isArray(definition.handlers)) {
      throw new Error('Runtime surface definition handlers must be an object for surface: ' + String(surfaceId));
    }
  } else {
    definition.handlers = {};
  }

  definition.packId = normalizedPackId;
  return definition;
}

function ensureRuntimeSurfaceRecord(surfaceId) {
  const surfaces = assertSurfacesMap();
  const key = String(surfaceId);
  const existing = surfaces[key];
  if (!existing || typeof existing !== 'object') {
    surfaces[key] = {
      handlers: {},
    };
  } else if (!existing.handlers || typeof existing.handlers !== 'object') {
    existing.handlers = {};
  }
  return surfaces[key];
}

function defineRuntimeSurfaceImpl(surfaceId, definitionOrFactory, packId) {
  const surfaces = assertSurfacesMap();
  const key = String(surfaceId);
  surfaces[key] = normalizeRuntimeSurfaceDefinition(key, definitionOrFactory, packId);
}

function defineRuntimeSurfaceRenderImpl(surfaceId, renderFn) {
  if (typeof renderFn !== 'function') {
    throw new Error('defineRuntimeSurfaceRender requires a render function');
  }

  const surface = ensureRuntimeSurfaceRecord(surfaceId);
  surface.render = renderFn;
}

function defineRuntimeSurfaceHandlerImpl(surfaceId, handlerName, handlerFn) {
  if (typeof handlerFn !== 'function') {
    throw new Error('defineRuntimeSurfaceHandler requires a handler function');
  }

  const surface = ensureRuntimeSurfaceRecord(surfaceId);
  surface.handlers[String(handlerName)] = handlerFn;
}

function collectRuntimeActionsFromCallback(callback) {
  __runtimeActions = [];

  const dispatch = (action) => {
    __runtimeActions.push(action);
  };

  const dispatchPluginAction = (actionType, payload) => {
    __runtimeActions.push({
      type: 'plugin/' + String(actionType),
      payload,
    });
  };

  const result = callback({ dispatch, dispatchPluginAction });
  const resultActions = result && Array.isArray(result.actions) ? result.actions : [];
  return {
    result,
    actions: __runtimeActions.concat(resultActions),
  };
}

globalThis.defineRuntimeBundle = defineRuntimeBundleImpl;
globalThis.defineRuntimeSurface = defineRuntimeSurfaceImpl;
globalThis.defineRuntimeSurfaceRender = defineRuntimeSurfaceRenderImpl;
globalThis.defineRuntimeSurfaceHandler = defineRuntimeSurfaceHandlerImpl;
globalThis.registerRuntimePackageApi = registerRuntimePackageApi;

globalThis.__runtimeBundleHost = {
  getMeta() {
    if (!__runtimeBundle || typeof __runtimeBundle !== 'object') {
      throw new Error('Runtime bundle did not register via defineRuntimeBundle');
    }

    if (!__runtimeBundle.surfaces || typeof __runtimeBundle.surfaces !== 'object') {
      throw new Error('Runtime bundle surfaces must be an object');
    }

    return {
      declaredId: typeof __runtimeBundle.id === 'string' ? __runtimeBundle.id : undefined,
      title: String(__runtimeBundle.title ?? 'Untitled Bundle'),
      description: typeof __runtimeBundle.description === 'string' ? __runtimeBundle.description : undefined,
      packageIds: Array.isArray(__runtimeBundle.packageIds)
        ? __runtimeBundle.packageIds.map((packageId) => String(packageId)).filter((packageId) => packageId.length > 0)
        : [],
      initialSessionState: __runtimeBundle.initialSessionState,
      initialSurfaceState: __runtimeBundle.initialSurfaceState,
      initialPluginState: __runtimeBundle.initialPluginState,
      surfaces: Object.keys(__runtimeBundle.surfaces),
      surfaceTypes: Object.fromEntries(
        Object.entries(__runtimeBundle.surfaces).map(([key, surface]) => [
          key,
          normalizeRuntimeSurfacePackId(key, surface?.packId),
        ]),
      ),
      hooks: {
        feedMiddleware: typeof __runtimeBundle.feed?.apply === 'function',
        incomingFeedMessage: typeof __runtimeBundle.feed?.onIncomingMessage === 'function',
      },
    };
  },

  renderRuntimeSurface(surfaceId, state) {
    const surface = __runtimeBundle?.surfaces?.[surfaceId];
    if (!surface || typeof surface.render !== 'function') {
      throw new Error('Runtime surface not found or render() is missing: ' + String(surfaceId));
    }

    return surface.render({ state });
  },

  eventRuntimeSurface(surfaceId, handlerName, args, state) {
    const surface = __runtimeBundle?.surfaces?.[surfaceId];
    if (!surface) {
      throw new Error('Runtime surface not found: ' + String(surfaceId));
    }

    const handler = surface.handlers?.[handlerName];
    if (typeof handler !== 'function') {
      throw new Error('Handler not found: ' + String(handlerName));
    }

    const { actions } = collectRuntimeActionsFromCallback(({ dispatch, dispatchPluginAction }) => {
      handler(
        {
          state,
          pluginState: state?.plugin,
          dispatch,
          dispatchPluginAction,
        },
        args
      );
      return null;
    });

    return actions;
  },

  applyFeedMiddleware(input) {
    const hook = __runtimeBundle?.feed?.apply;
    if (typeof hook !== 'function') {
      return { posts: input?.posts };
    }

    const { result, actions } = collectRuntimeActionsFromCallback(({ dispatch, dispatchPluginAction }) =>
      hook({
        posts: input?.posts,
        allPosts: input?.allPosts,
        pluginState: input?.pluginState,
        context: input?.context,
        dispatch,
        dispatchPluginAction,
      })
    );

    return { ...(result || {}), actions };
  },

  incomingFeedMessage(input) {
    const hook = __runtimeBundle?.feed?.onIncomingMessage;
    if (typeof hook !== 'function') {
      return { message: input?.message };
    }

    const { result, actions } = collectRuntimeActionsFromCallback(({ dispatch, dispatchPluginAction }) =>
      hook({
        message: input?.message,
        allPosts: input?.allPosts,
        pluginState: input?.pluginState,
        context: input?.context,
        dispatch,
        dispatchPluginAction,
      })
    );

    return { ...(result || {}), actions };
  },

  defineRuntimeSurface(surfaceId, definitionOrFactory, packId) {
    defineRuntimeSurfaceImpl(surfaceId, definitionOrFactory, packId);
    return this.getMeta();
  },

  defineRuntimeSurfaceRender(surfaceId, renderFn) {
    defineRuntimeSurfaceRenderImpl(surfaceId, renderFn);
    return this.getMeta();
  },

  defineRuntimeSurfaceHandler(surfaceId, handlerName, handlerFn) {
    defineRuntimeSurfaceHandlerImpl(surfaceId, handlerName, handlerFn);
    return this.getMeta();
  },
};
