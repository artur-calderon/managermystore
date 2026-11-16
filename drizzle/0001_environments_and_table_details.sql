CREATE TABLE "environments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"establishment_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "environments_establishment_id_key" UNIQUE("establishment_id","id")
);
--> statement-breakpoint
ALTER TABLE "environments" ADD CONSTRAINT "environments_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "environments_name_active_key" ON "environments" USING btree ("establishment_id","name") WHERE "environments"."deleted_at" is null;--> statement-breakpoint
INSERT INTO "environments" ("establishment_id", "name")
SELECT "id", 'Salão Principal'
FROM "establishments"
WHERE "deleted_at" IS NULL;--> statement-breakpoint
ALTER TABLE "tables" ADD COLUMN "environment_id" uuid;--> statement-breakpoint
ALTER TABLE "tables" ADD COLUMN "capacity" integer DEFAULT 4 NOT NULL;--> statement-breakpoint
ALTER TABLE "tables" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "tables" ADD COLUMN "digital_menu_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
UPDATE "tables"
SET "environment_id" = "environments"."id"
FROM "environments"
WHERE "environments"."establishment_id" = "tables"."establishment_id"
  AND "environments"."name" = 'Salão Principal'
  AND "environments"."deleted_at" IS NULL;--> statement-breakpoint
ALTER TABLE "tables" ALTER COLUMN "environment_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tables" ADD CONSTRAINT "tables_environment_establishment_fk" FOREIGN KEY ("establishment_id","environment_id") REFERENCES "public"."environments"("establishment_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tables_establishment_environment_idx" ON "tables" USING btree ("establishment_id","environment_id");--> statement-breakpoint
ALTER TABLE "tables" ADD CONSTRAINT "tables_capacity_check" CHECK ("tables"."capacity" > 0);
