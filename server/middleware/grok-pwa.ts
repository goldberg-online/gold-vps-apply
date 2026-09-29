/** Passthrough. Replaces the old file that imported virtual:grok-og-identity. */
export default function grokPwaMiddleware(_event: unknown, next: () => unknown) {
  return next();
}
