/**
 * withTimeout — race a promise against a timer and return a fallback value
 * if it doesn't settle in time.
 *
 * Used by long-running tool chains (e.g. find_grants_for_org's 9-source
 * fan-out, render_design_to_image's HTML→PNG pipeline) so a single slow
 * upstream cannot hang the whole call past Vercel's 60-second function ceiling.
 *
 * NOTE: this does NOT cancel the underlying work — the losing promise keeps
 * running in the background until the Node event loop tears down at request
 * end. For fetches that need real cancellation, pass `AbortController.abort()`
 * via the optional `onTimeout` callback so the upstream HTTP call terminates
 * cleanly. Source helpers in this codebase don't currently accept signals;
 * once they do, plumb the signal through and the leak goes away.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  fallback: T,
  onTimeout?: () => void,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<T>((resolve) => {
    timer = setTimeout(() => {
      try {
        onTimeout?.();
      } catch {
        /* swallow — onTimeout is best-effort cleanup */
      }
      resolve(fallback);
    }, ms);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
