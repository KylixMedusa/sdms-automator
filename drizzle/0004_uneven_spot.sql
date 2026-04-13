CREATE INDEX "idx_jobs_status_created" ON "jobs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "idx_jobs_type_created" ON "jobs" USING btree ("job_type","created_at");--> statement-breakpoint
CREATE INDEX "idx_jobs_order_number" ON "jobs" USING btree ("order_number");