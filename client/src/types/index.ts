export type JobType = 'return' | 'cancel';
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface Job {
  id: number;
  jobType: JobType;
  orderNumber: string;
  details: string | null;
  status: JobStatus;
  attempts: number;
  maxRetries: number;
  resultMessage: string | null;
  errorMessage: string | null;
  cancelRequested: boolean;
  hasScreenshot: boolean;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface OrderCounts {
  total: number;
  done: number;
  alreadyDone: number;
  failed: number;
  verified: number;
}

export interface CalendarJob {
  id: number;
  status: JobStatus;
  fromDate: string;
  toDate: string; // exclusive
  filtered: boolean; // include-list or start-after, so it didn't cover every order in the range
  cancelRequested: boolean;
  errorMessage: string | null;
  hasScreenshot: boolean;
  counts: OrderCounts;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface JobOrder {
  orderNumber: string;
  status: 'done' | 'already_done' | 'failed';
  verified: boolean;
}

export interface JobDetail extends Job {
  orders: JobOrder[];
  counts: OrderCounts;
}

export interface PortalSettings {
  toolUrl: string;
  accounts: PortalAccount[];
}

export interface PortalAccount {
  username: string;
  password: string;
}

export interface ReturnSettings {
  deliveryBoy: string;
  reason: string;
}
