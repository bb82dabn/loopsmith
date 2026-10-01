import { describe, expect, it, vi } from 'vitest'
import { WorkerJobLifecycle, type TerminableWorker } from '../src/ui/workerJobs'

function fakeWorker() {
  return { terminate: vi.fn() } satisfies TerminableWorker
}

describe('WorkerJobLifecycle', () => {
  it('terminates a superseded worker and rejects its callbacks', () => {
    const jobs = new WorkerJobLifecycle()
    const firstWorker = fakeWorker()
    const first = jobs.start(firstWorker)
    const secondWorker = fakeWorker()
    const second = jobs.start(secondWorker)

    expect(firstWorker.terminate).toHaveBeenCalledOnce()
    expect(jobs.isCurrent(first)).toBe(false)
    expect(jobs.complete(first)).toBe(false)
    expect(jobs.isCurrent(second)).toBe(true)
  })

  it('cancels idempotently', () => {
    const jobs = new WorkerJobLifecycle()
    const worker = fakeWorker()
    jobs.start(worker)

    expect(jobs.cancel()).toBe(true)
    expect(jobs.cancel()).toBe(false)
    expect(worker.terminate).toHaveBeenCalledOnce()
  })

  it('completes a job at most once', () => {
    const jobs = new WorkerJobLifecycle()
    const worker = fakeWorker()
    const jobId = jobs.start(worker)

    expect(jobs.complete(jobId)).toBe(true)
    expect(jobs.complete(jobId)).toBe(false)
    expect(worker.terminate).toHaveBeenCalledOnce()
  })

  it('terminates active jobs when repeatedly disposed', () => {
    const jobs = new WorkerJobLifecycle()
    const worker = fakeWorker()
    jobs.start(worker)

    jobs.dispose()
    jobs.dispose()

    expect(worker.terminate).toHaveBeenCalledOnce()
  })

  it('terminates workers attached to stale jobs', () => {
    const jobs = new WorkerJobLifecycle()
    const first = jobs.start()
    jobs.start()
    const staleWorker = fakeWorker()

    expect(jobs.attach(first, staleWorker)).toBe(false)
    expect(staleWorker.terminate).toHaveBeenCalledOnce()
  })
})
