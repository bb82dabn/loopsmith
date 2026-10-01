export interface TerminableWorker {
  terminate(): void
}

type ActiveJob = {
  jobId: string
  worker: TerminableWorker | null
}

export class WorkerJobLifecycle {
  private sequence = 0
  private active: ActiveJob | null = null

  start(worker: TerminableWorker | null = null): string {
    this.cancel()
    const jobId = `${++this.sequence}`
    this.active = { jobId, worker }
    return jobId
  }

  attach(jobId: string, worker: TerminableWorker): boolean {
    if (!this.isCurrent(jobId) || !this.active || this.active.worker) {
      worker.terminate()
      return false
    }
    this.active.worker = worker
    return true
  }

  isCurrent(jobId: string): boolean {
    return this.active?.jobId === jobId
  }

  complete(jobId: string): boolean {
    if (!this.isCurrent(jobId)) return false
    this.active?.worker?.terminate()
    this.active = null
    return true
  }

  cancel(): boolean {
    if (!this.active) return false
    this.active.worker?.terminate()
    this.active = null
    return true
  }

  dispose(): void {
    this.cancel()
  }
}
