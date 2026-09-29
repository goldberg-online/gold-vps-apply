/** Passthrough so an old PWA middleware cannot block the build. */
export default function grokPwaMiddleware(_event: unknown, next: () => unknown) {
  return next();
}

