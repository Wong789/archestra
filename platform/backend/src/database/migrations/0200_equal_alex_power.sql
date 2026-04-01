ALTER TABLE "organization" ADD COLUMN "tool_context_labels" text[] DEFAULT '{"safe","sensitive"}' NOT NULL;--> statement-breakpoint
ALTER TABLE "tool_invocation_policies" ADD COLUMN "match_template" text DEFAULT '{{true}}' NOT NULL;--> statement-breakpoint
ALTER TABLE "tool_invocation_policies" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "trusted_data_policies" ADD COLUMN "match_template" text DEFAULT '{{true}}' NOT NULL;--> statement-breakpoint
ALTER TABLE "trusted_data_policies" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "trusted_data_policies" ADD COLUMN "labels" text[] DEFAULT '{}' NOT NULL;