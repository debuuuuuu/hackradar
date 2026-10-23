/** Generic SWR fetcher — passes through the existing typed fetch helpers unchanged. */
export function fetcher<T>(fn: () => Promise<T>): Promise<T> {
  return fn();
}
