// Vendored from @go-go-golems/os-scripting/@go-go-golems/os-ui-cards @ a554dc3 (2026-04-06). See src/runtime/VENDORED.md. Do not edit upstream; port fixes here.
import {
  createQuickJsSessionVm,
  disposeQuickJsSessionVm,
  evalQuickJsCodeOrThrow,
  evalQuickJsToNative,
  type QuickJsSessionCoreOptions,
  type QuickJsSessionVm,
} from './quickJsSessionCore';
import {
  evaluateQuickJsSessionJs,
  getQuickJsSessionGlobalNames,
  installJsEvalBridge,
} from './jsEvalSupport';

export interface JsSessionServiceOptions {
  memoryLimitBytes?: number;
  stackLimitBytes?: number;
  loadTimeoutMs?: number;
  evalTimeoutMs?: number;
  inspectTimeoutMs?: number;
}

export interface CreateJsSessionRequest {
  sessionId: string;
  title?: string;
  scopeId?: string;
  preludeCode?: string;
  bootstrapSources?: Array<{
    code: string;
    filename: string;
  }>;
}

export interface JsSessionSummary {
  sessionId: string;
  title: string;
  createdAt: string;
  globalNames: string[];
}

export interface JsEvalError {
  name: string;
  message: string;
}

export interface JsEvalResult {
  value: unknown;
  valueType: string;
  logs: string[];
  error?: JsEvalError;
}

interface JsSessionRecord {
  vm: QuickJsSessionVm;
  title: string;
  createdAt: string;
  scopeId: string;
  preludeCode?: string;
  bootstrapSources: Array<{
    code: string;
    filename: string;
  }>;
}

const DEFAULT_OPTIONS: Required<JsSessionServiceOptions> = {
  memoryLimitBytes: 32 * 1024 * 1024,
  stackLimitBytes: 1024 * 1024,
  loadTimeoutMs: 1000,
  evalTimeoutMs: 100,
  inspectTimeoutMs: 50,
};

function normalizeOptions(options: JsSessionServiceOptions): Required<JsSessionServiceOptions> {
  return {
    ...DEFAULT_OPTIONS,
    ...options,
  };
}

function toCoreOptions(options: Required<JsSessionServiceOptions>): QuickJsSessionCoreOptions {
  return {
    memoryLimitBytes: options.memoryLimitBytes,
    stackLimitBytes: options.stackLimitBytes,
    loadTimeoutMs: options.loadTimeoutMs,
  };
}

export class JsSessionService {
  private readonly options: Required<JsSessionServiceOptions>;

  private readonly sessions = new Map<string, JsSessionRecord>();

  constructor(options: JsSessionServiceOptions = {}) {
    this.options = normalizeOptions(options);
  }

  private getRecordOrThrow(sessionId: string): JsSessionRecord {
    const record = this.sessions.get(sessionId);
    if (!record) {
      throw new Error(`JS session not found: ${sessionId}`);
    }
    return record;
  }

  private async createRecord(request: CreateJsSessionRequest): Promise<JsSessionRecord> {
    const bootstrapSources: Array<{ code: string; filename: string }> = [
      ...(request.bootstrapSources ?? []),
    ];
    if (request.preludeCode && request.preludeCode.trim().length > 0) {
      bootstrapSources.push({
        code: request.preludeCode,
        filename: `${request.sessionId}.prelude.js`,
      });
    }

    const vm = await createQuickJsSessionVm(
      request.scopeId?.trim() || 'js-repl',
      request.sessionId,
      toCoreOptions(this.options),
      bootstrapSources,
    );

    installJsEvalBridge(vm, 'js-repl-bootstrap.js', this.options.loadTimeoutMs);

    return {
      vm,
      title: request.title?.trim() || request.sessionId,
      createdAt: new Date().toISOString(),
      scopeId: request.scopeId?.trim() || 'js-repl',
      preludeCode: request.preludeCode,
      bootstrapSources: [...(request.bootstrapSources ?? [])],
    };
  }

  async createSession(request: CreateJsSessionRequest): Promise<JsSessionSummary> {
    if (this.sessions.has(request.sessionId)) {
      throw new Error(`JS session already exists: ${request.sessionId}`);
    }

    const record = await this.createRecord(request);
    this.sessions.set(request.sessionId, record);
    return this.getSummary(request.sessionId);
  }

  getSummary(sessionId: string): JsSessionSummary {
    const record = this.getRecordOrThrow(sessionId);
    return {
      sessionId,
      title: record.title,
      createdAt: record.createdAt,
      globalNames: this.getGlobalNames(sessionId),
    };
  }

  listSessions(): JsSessionSummary[] {
    return Array.from(this.sessions.keys())
      .sort()
      .map((sessionId) => this.getSummary(sessionId));
  }

  evaluate(sessionId: string, code: string): JsEvalResult {
    const record = this.getRecordOrThrow(sessionId);
    return evaluateQuickJsSessionJs(
      record.vm,
      code,
      `${sessionId}.eval.js`,
      this.options.evalTimeoutMs,
      this.options.inspectTimeoutMs,
    );
  }

  evaluateToNative<T>(
    sessionId: string,
    code: string,
    filename: string,
    timeoutMs: number,
  ): T {
    const record = this.getRecordOrThrow(sessionId);
    return evalQuickJsToNative<T>(record.vm, code, filename, timeoutMs);
  }

  runCode(
    sessionId: string,
    code: string,
    filename: string,
    timeoutMs: number,
  ): void {
    const record = this.getRecordOrThrow(sessionId);
    evalQuickJsCodeOrThrow(record.vm, code, filename, timeoutMs);
  }

  getGlobalNames(sessionId: string): string[] {
    const record = this.getRecordOrThrow(sessionId);
    return getQuickJsSessionGlobalNames(
      record.vm,
      `${sessionId}.globals.js`,
      this.options.inspectTimeoutMs,
    );
  }

  async resetSession(sessionId: string): Promise<JsSessionSummary> {
    const record = this.getRecordOrThrow(sessionId);
    disposeQuickJsSessionVm(record.vm);
    const nextRecord = await this.createRecord({
      sessionId,
      title: record.title,
      scopeId: record.scopeId,
      preludeCode: record.preludeCode,
      bootstrapSources: record.bootstrapSources,
    });
    this.sessions.set(sessionId, {
      ...nextRecord,
      createdAt: record.createdAt,
    });
    return this.getSummary(sessionId);
  }

  disposeSession(sessionId: string): boolean {
    const record = this.sessions.get(sessionId);
    if (!record) {
      return false;
    }
    this.sessions.delete(sessionId);
    disposeQuickJsSessionVm(record.vm);
    return true;
  }

  clear(): void {
    for (const record of this.sessions.values()) {
      disposeQuickJsSessionVm(record.vm);
    }
    this.sessions.clear();
  }

  health() {
    return {
      ready: true as const,
      sessions: Array.from(this.sessions.keys()).sort(),
    };
  }

  installPrelude(sessionId: string, code: string): void {
    const record = this.getRecordOrThrow(sessionId);
    evalQuickJsCodeOrThrow(
      record.vm,
      code,
      `${sessionId}.install-prelude.js`,
      this.options.loadTimeoutMs,
    );
  }
}
