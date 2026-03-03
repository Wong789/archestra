ALTER TABLE "tools" DROP CONSTRAINT "tools_catalog_id_name_agent_id_delegate_to_agent_id_unique";--> statement-breakpoint
ALTER TABLE "tools" ADD CONSTRAINT "tools_name_unique" UNIQUE("name");--> statement-breakpoint
ALTER TABLE "tools" ADD CONSTRAINT "tools_delegate_to_agent_id_unique" UNIQUE("delegate_to_agent_id");