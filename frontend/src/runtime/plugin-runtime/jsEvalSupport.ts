// Vendored from @go-go-golems/os-scripting/@go-go-golems/os-ui-cards @ a554dc3 (2026-04-06). See src/runtime/VENDORED.md. Do not edit upstream; port fixes here.
import {
  evalQuickJsCodeOrThrow,
  evalQuickJsToNative,
  type QuickJsSessionVm,
} from './quickJsSessionCore';
import type { JsEvalError, JsEvalResult } from './jsSessionService';

const JS_EVAL_BRIDGE_BOOTSTRAP_SOURCE = `
  if (!globalThis.__jsEvalHost) {
    globalThis.__jsEvalHost = {
      logs: [],
      pushLog(text) {
        this.logs.push(String(text));
      },
      consumeLogs() {
        const copy = this.logs.slice();
        this.logs.length = 0;
        return copy;
      }
    };

    const __existingConsole = globalThis.console && typeof globalThis.console === 'object'
      ? globalThis.console
      : {};
    const __baseLog = typeof __existingConsole.log === 'function'
      ? __existingConsole.log.bind(__existingConsole)
      : null;

    globalThis.console = {
      ...__existingConsole,
      log(...args) {
        globalThis.__jsEvalHost.pushLog(args.map((arg) => String(arg)).join(' '));
        if (__baseLog) {
          return __baseLog(...args);
        }
      }
    };
  }
`;

function valueTypeOf(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  return typeof value;
}

function asError(error: unknown): JsEvalError {
  if (error instanceof Error) {
    const [name, ...rest] = error.message.split(':');
    if (rest.length > 0 && name.trim().length > 0) {
      return {
        name: name.trim(),
        message: rest.join(':').trim(),
      };
    }
    return {
      name: 'Error',
      message: error.message,
    };
  }
  return {
    name: 'Error',
    message: String(error),
  };
}

export function installJsEvalBridge(
  vm: QuickJsSessionVm,
  filename: string,
  timeoutMs: number,
): void {
  evalQuickJsCodeOrThrow(vm, JS_EVAL_BRIDGE_BOOTSTRAP_SOURCE, filename, timeoutMs);
}

export function consumeJsEvalLogs(
  vm: QuickJsSessionVm,
  filename: string,
  timeoutMs: number,
): string[] {
  try {
    return evalQuickJsToNative<string[]>(
      vm,
      'globalThis.__jsEvalHost.consumeLogs()',
      filename,
      timeoutMs,
    );
  } catch {
    return [];
  }
}

export function evaluateQuickJsSessionJs(
  vm: QuickJsSessionVm,
  code: string,
  filename: string,
  evalTimeoutMs: number,
  inspectTimeoutMs: number,
): JsEvalResult {
  try {
    const value = evalQuickJsToNative<unknown>(
      vm,
      code,
      filename,
      evalTimeoutMs,
    );
    return {
      value,
      valueType: valueTypeOf(value),
      logs: consumeJsEvalLogs(vm, `${filename}.consume-logs.js`, inspectTimeoutMs),
    };
  } catch (error) {
    return {
      value: undefined,
      valueType: 'error',
      logs: consumeJsEvalLogs(vm, `${filename}.consume-logs.js`, inspectTimeoutMs),
      error: asError(error),
    };
  }
}

export function getQuickJsSessionGlobalNames(
  vm: QuickJsSessionVm,
  filename: string,
  timeoutMs: number,
): string[] {
  return evalQuickJsToNative<string[]>(
    vm,
    'Object.getOwnPropertyNames(globalThis).sort()',
    filename,
    timeoutMs,
  );
}
