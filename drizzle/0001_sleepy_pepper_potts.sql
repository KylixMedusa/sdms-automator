CREATE TYPE "public"."identifier_type" AS ENUM('consumer', 'phone');--> statement-breakpoint
CREATE TYPE "public"."job_type" AS ENUM('cash_memo', 'dac');--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "job_type" "job_type" DEFAULT 'cash_memo' NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "identifier_type" "identifier_type";