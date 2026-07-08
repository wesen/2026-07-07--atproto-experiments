// Vendored from @go-go-golems/os-scripting/@go-go-golems/os-ui-cards @ a554dc3 (2026-04-06). See src/runtime/VENDORED.md. Do not edit upstream; port fixes here.
export type CapabilitySet = 'all' | string[];

export interface CapabilityPolicy {
  domain: CapabilitySet;
  system: CapabilitySet;
}

export interface CapabilityDecision {
  allowed: boolean;
  reason: string | null;
}

const DEFAULT_POLICY: CapabilityPolicy = {
  domain: 'all',
  system: 'all',
};

function normalizeCapabilitySet(value: unknown, fallback: CapabilitySet): CapabilitySet {
  if (value === 'all') {
    return 'all';
  }

  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
  }

  return fallback;
}

export function resolveCapabilityPolicy(input?: Partial<CapabilityPolicy>): CapabilityPolicy {
  return {
    domain: normalizeCapabilitySet(input?.domain, DEFAULT_POLICY.domain),
    system: normalizeCapabilitySet(input?.system, DEFAULT_POLICY.system),
  };
}

function includesCapability(set: CapabilitySet, value: string): boolean {
  return set === 'all' || set.includes(value);
}

export function authorizeDomainIntent(policy: CapabilityPolicy, domain: string): CapabilityDecision {
  const allowed = includesCapability(policy.domain, domain);
  return {
    allowed,
    reason: allowed ? null : `domain_not_allowed:${domain}`,
  };
}

export function authorizeSystemIntent(policy: CapabilityPolicy, command: string): CapabilityDecision {
  const allowed = includesCapability(policy.system, command);
  return {
    allowed,
    reason: allowed ? null : `system_command_not_allowed:${command}`,
  };
}
