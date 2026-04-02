CREATE TABLE "agent_eval_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"eval_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"input" jsonb NOT NULL,
	"expected_tool_calls" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_eval_run_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"session_id" text,
	"agent_output" jsonb,
	"static_passed" boolean,
	"static_score" numeric(5, 4),
	"static_details" jsonb,
	"auditor_passed" boolean,
	"auditor_scores" jsonb,
	"auditor_tokens" integer,
	"observer_passed" boolean,
	"observer_scores" jsonb,
	"observer_tokens" integer,
	"error" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_eval_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"eval_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"summary" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_evals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"agent_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_eval_cases" ADD CONSTRAINT "agent_eval_cases_eval_id_agent_evals_id_fk" FOREIGN KEY ("eval_id") REFERENCES "public"."agent_evals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_eval_run_results" ADD CONSTRAINT "agent_eval_run_results_run_id_agent_eval_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_eval_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_eval_run_results" ADD CONSTRAINT "agent_eval_run_results_case_id_agent_eval_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."agent_eval_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_eval_runs" ADD CONSTRAINT "agent_eval_runs_eval_id_agent_evals_id_fk" FOREIGN KEY ("eval_id") REFERENCES "public"."agent_evals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_evals" ADD CONSTRAINT "agent_evals_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_eval_cases_eval_id_idx" ON "agent_eval_cases" USING btree ("eval_id");--> statement-breakpoint
CREATE INDEX "agent_eval_cases_org_id_idx" ON "agent_eval_cases" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "agent_eval_run_results_run_id_idx" ON "agent_eval_run_results" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "agent_eval_run_results_case_id_idx" ON "agent_eval_run_results" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "agent_eval_run_results_org_id_idx" ON "agent_eval_run_results" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "agent_eval_runs_eval_id_idx" ON "agent_eval_runs" USING btree ("eval_id");--> statement-breakpoint
CREATE INDEX "agent_eval_runs_org_id_idx" ON "agent_eval_runs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "agent_evals_org_id_idx" ON "agent_evals" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "agent_evals_agent_id_idx" ON "agent_evals" USING btree ("agent_id");