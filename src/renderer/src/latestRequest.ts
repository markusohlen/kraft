/** Tells which of several overlapping requests is the newest, so an older one that answers late is ignored. */
export class LatestRequest {
  private latest = 0

  /** Starts a request; the function it returns says whether its answer is still wanted. */
  begin(): () => boolean {
    const request = ++this.latest
    return () => request === this.latest
  }

  /** Makes the answers of all requests so far unwanted. */
  invalidate(): void {
    this.latest++
  }
}
