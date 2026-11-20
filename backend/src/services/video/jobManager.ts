export interface VideoJobProgress {
  jobId: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  percent: number;
  message: string;
  videoPath?: string;
  thumbnailPath?: string;
  durationSeconds?: number;
  error?: string;
  createdAt: Date;
}

class VideoJobManager {
  private jobs = new Map<string, VideoJobProgress>();

  createJob(jobId: string): VideoJobProgress {
    const job: VideoJobProgress = {
      jobId,
      status: 'PENDING',
      percent: 0,
      message: 'Job initialized',
      createdAt: new Date()
    };
    this.jobs.set(jobId, job);
    return job;
  }

  updateProgress(jobId: string, percent: number, message: string): void {
    const job = this.jobs.get(jobId);
    if (job) {
      job.status = 'PROCESSING';
      job.percent = percent;
      job.message = message;
    }
  }

  completeJob(
    jobId: string,
    result: { videoPath: string; thumbnailPath?: string; durationSeconds: number }
  ): void {
    const job = this.jobs.get(jobId);
    if (job) {
      job.status = 'COMPLETED';
      job.percent = 100;
      job.message = 'Video generated successfully';
      job.videoPath = result.videoPath;
      job.thumbnailPath = result.thumbnailPath;
      job.durationSeconds = result.durationSeconds;
    }
  }

  failJob(jobId: string, error: string): void {
    const job = this.jobs.get(jobId);
    if (job) {
      job.status = 'FAILED';
      job.error = error;
      job.message = `Generation failed: ${error}`;
    }
  }

  getJob(jobId: string): VideoJobProgress | undefined {
    return this.jobs.get(jobId);
  }

  // Periodic cleanup of completed/failed jobs older than 1 hour
  cleanupOldJobs(): void {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    for (const [id, job] of this.jobs.entries()) {
      if (job.createdAt.getTime() < oneHourAgo) {
        this.jobs.delete(id);
      }
    }
  }
}

export const videoJobManager = new VideoJobManager();
