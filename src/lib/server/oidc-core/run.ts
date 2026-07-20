/**
 * Runner-agnostic conformance execution. The app supplies a Registrar
 * mapping onto its own test framework; oidc-core depends on none.
 */

import type { PolicyAdapter, ResolveOutcome, UserRecord } from "./port.js";
import {
  conformanceCases,
  type ConformanceCase,
  type ExpectedOutcome,
} from "./cases.js";

export interface Registrar {
  /** Register one named test executing `fn` (framework decides when). */
  test(name: string, fn: () => Promise<void>): void;
  /**
   * Report one named test as skipped, with the reason visible in test
   * output. Silently omitting gated cases is non-conformant — a suite that
   * quietly drops cases reads as "covered everything" when it didn't.
   */
  skip(name: string, reason: string): void;
}

/**
 * Register every conformance case against `registrar`. Each case resets the
 * store, seeds its fixtures, resolves once through the app's production
 * logic, and asserts the outcome plus post-state.
 */
export function runConformance(
  adapter: PolicyAdapter,
  registrar: Registrar,
): void {
  for (const c of conformanceCases(adapter.capabilities)) {
    if (c.requires !== undefined && !adapter.capabilities[c.requires]) {
      registrar.skip(
        c.id,
        `gated by capability ${c.requires} = ${JSON.stringify(
          adapter.capabilities[c.requires],
        )}`,
      );
      continue;
    }
    registrar.test(c.id, () => executeCase(adapter, c));
  }
}

async function executeCase(
  adapter: PolicyAdapter,
  c: ConformanceCase,
): Promise<void> {
  await adapter.reset();
  for (const seed of c.seed) {
    await adapter.seedUser(seed);
  }

  const outcome = await adapter.resolve(c.claims);

  const allowed = Array.isArray(c.expect) ? c.expect : [c.expect];
  if (!allowed.some((e) => outcomeMatches(outcome, e))) {
    fail(
      c,
      `outcome ${show(outcome)} does not match expected ${allowed
        .map(show)
        .join(" or ")}`,
    );
  }

  for (const p of c.post ?? []) {
    const [label, actual] =
      "byUsername" in p
        ? [
            `getUserByUsername(${JSON.stringify(p.byUsername)})`,
            await adapter.getUserByUsername(p.byUsername),
          ]
        : [
            `getUserBySub(${JSON.stringify(p.bySub)})`,
            await adapter.getUserBySub(p.bySub),
          ];
    if (!recordMatches(actual, p.is)) {
      fail(c, `post-state ${label} is ${show(actual)}, expected ${show(p.is)}`);
    }
  }
}

function outcomeMatches(
  actual: ResolveOutcome,
  expected: ExpectedOutcome,
): boolean {
  if (expected.kind === "refused") return actual.kind === "refused";
  return (
    actual.kind === expected.kind &&
    actual.username === expected.username &&
    actual.sub === expected.sub
  );
}

function recordMatches(
  actual: UserRecord | null,
  expected: UserRecord | null,
): boolean {
  if (expected === null || actual === null) return actual === expected;
  return actual.username === expected.username && actual.sub === expected.sub;
}

function fail(c: ConformanceCase, message: string): never {
  throw new Error(
    `[oidc-core ${c.id}] ${message}\n  policy scenario: ${c.scenario}`,
  );
}

function show(value: unknown): string {
  return JSON.stringify(value);
}
