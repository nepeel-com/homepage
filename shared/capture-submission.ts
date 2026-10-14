import type { CaptureRequest } from "./types";

// One prepared, immutable request per photo. Never regenerate proof on transport retry.
export class CaptureSubmission {
  private request: CaptureRequest | null = null;
  private pending: Promise<{ id: string }> | null = null;
  get prepared() {
    return this.request !== null;
  }
  constructor(
    private prepare: () => Promise<CaptureRequest>,
    private send: (request: CaptureRequest) => Promise<{ id: string }>,
  ) {}
  submit(): Promise<{ id: string }> {
    if (this.pending) return this.pending;
    this.pending = this.run().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }
  private async run() {
    if (!this.request)
      this.request = JSON.parse(
        JSON.stringify(await this.prepare()),
      ) as CaptureRequest;
    return this.send(this.request);
  }
}
