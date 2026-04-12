export type JobType = 'cash_memo' | 'dac';
export type IdentifierType = 'consumer' | 'phone';
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface Job {
  id: number;
  jobType: JobType;
  orderNumber: string;
  identifierType: IdentifierType | null;
  details: string | null;
  status: JobStatus;
  attempts: number;
  maxRetries: number;
  resultMessage: string | null;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface Stats {
  total: number;
  completed: number;
  failed: number;
  pending: number;
  running: number;
}

export interface JobsPage {
  jobs: Job[];
  nextCursor: number | null;
  hasMore: boolean;
  stats?: Stats;
}

export interface StatsResponse {
  stats: Stats;
}

export interface JobsQuery {
  date?: string;
  jobType?: JobType;
  status?: JobStatus;
  search?: string;
  cursor?: number;
  limit?: number;
}

export interface CashMemoSettings {
  toolUrl: string;
  toolUsername: string;
  toolPassword: string;
}
