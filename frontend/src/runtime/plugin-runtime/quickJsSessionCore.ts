// Vendored from @go-go-golems/os-scripting/@go-go-golems/os-ui-cards @ a554dc3 (2026-04-06). See src/runtime/VENDORED.md. Do not edit upstream; port fixes here.
import SINGLEFILE_RELEASE_SYNC from '@jitl/quickjs-singlefile-mjs-release-sync';
import { newQuickJSWASMModule } from 'quickjs-emscripten';
import type { QuickJSContext, QuickJSRuntime, QuickJSWASMModule } from 'quickjs-emscripten-core';

export interface QuickJsSessionCoreOptions {
  memoryLimitBytes: number;
  stackLimitBytes: number;
  loadTimeoutMs: number;
}

export interface QuickJsSessionVm {
  scopeId: string;
  sessionId: string;
  runtime: QuickJSRuntime;
  context: QuickJSContext;
  deadlineMs: number;
}

let quickJsModulePromise: Promise<QuickJSWASMModule> | null = null;

export function getSharedQuickJsModule() {
  if (!quickJsModulePromise) {
    quickJsModulePromise = newQuickJSWASMModule(SINGLEFILE_RELEASE_SYNC);
  }
  return quickJsModulePromise;
}

export function toJsLiteral(value: unknown): string {
  const encoded = JSON.stringify(value);
  return encoded === undefined ? 'undefined' : encoded;
}

export function formatQuickJSError(errorDump: unknown): string {
  if (typeof errorDump === 'string') {
    return errorDump;
  }

  if (errorDump && typeof errorDump === 'object') {
    const details = errorDump as { name?: string; message?: string };
    if (details.name && details.message) {
      return `${details.name}: ${details.message}`;
    }
    if (details.message) {
      return details.message;
    }
  }

  return 'Unknown QuickJS runtime error';
}

export function withDeadline<T>(vm: QuickJsSessionVm, timeoutMs: number, fn: () => T): T {
  vm.deadlineMs = Date.now() + timeoutMs;
  try {
    return fn();
  } finally {
    vm.deadlineMs = Number.POSITIVE_INFINITY;
  }
}

export function evalQuickJsToNative<T>(
  vm: QuickJsSessionVm,
  code: string,
  filename: string,
  timeoutMs: number,
): T {
  const context = vm.context;
  const result = withDeadline(vm, timeoutMs, () => context.evalCode(code, filename));
  if (result.error) {
    const dumped = context.dump(result.error);
    result.error.dispose();
    throw new Error(formatQuickJSError(dumped));
  }

  try {
    return context.dump(result.value) as T;
  } finally {
    result.value.dispose();
  }
}

export function evalQuickJsCodeOrThrow(
  vm: QuickJsSessionVm,
  code: string,
  filename: string,
  timeoutMs: number,
): void {
  const context = vm.context;
  const result = withDeadline(vm, timeoutMs, () => context.evalCode(code, filename));
  if (result.error) {
    const dumped = context.dump(result.error);
    result.error.dispose();
    throw new Error(formatQuickJSError(dumped));
  }

  result.value.dispose();
}

export async function createQuickJsSessionVm(
  scopeId: string,
  sessionId: string,
  options: QuickJsSessionCoreOptions,
  bootstrapSources: Array<{ code: string; filename: string }> = [],
): Promise<QuickJsSessionVm> {
  const QuickJS = await getSharedQuickJsModule();
  const runtime = QuickJS.newRuntime();
  const context = runtime.newContext();

  const vm: QuickJsSessionVm = {
    scopeId,
    sessionId,
    runtime,
    context,
    deadlineMs: Number.POSITIVE_INFINITY,
  };

  runtime.setMemoryLimit(options.memoryLimitBytes);
  runtime.setMaxStackSize(options.stackLimitBytes);
  runtime.setInterruptHandler(() => Date.now() > vm.deadlineMs);

  try {
    for (const source of bootstrapSources) {
      evalQuickJsCodeOrThrow(vm, source.code, source.filename, options.loadTimeoutMs);
    }
    return vm;
  } catch (error) {
    context.dispose();
    runtime.dispose();
    throw error;
  }
}

export function disposeQuickJsSessionVm(vm: QuickJsSessionVm): void {
  vm.context.dispose();
  vm.runtime.dispose();
}
