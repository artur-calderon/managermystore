CREATE TABLE IF NOT EXISTS "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"establishment_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disabled_at" timestamp with time zone,
	CONSTRAINT "customers_establishment_id_key" UNIQUE("establishment_id","id")
);
--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "customers_establishment_email_uidx" ON "customers" USING btree ("establishment_id",lower("email"));--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "customer_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"label" text,
	"street" text NOT NULL,
	"number" text NOT NULL,
	"complement" text,
	"neighborhood" text NOT NULL,
	"city" text NOT NULL,
	"postal_code" text,
	"reference" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_addresses_customer_idx" ON "customer_addresses" USING btree ("customer_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "customer_sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"customer_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customer_sessions" ADD CONSTRAINT "customer_sessions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_sessions_customer_idx" ON "customer_sessions" USING btree ("customer_id");--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "customer_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "customer_phone" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_address" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_fee" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_method" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "change_for" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_establishment_fk" FOREIGN KEY ("establishment_id","customer_id") REFERENCES "public"."customers"("establishment_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_customer_idx" ON "orders" USING btree ("customer_id","updated_at");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_fee_check" CHECK ("orders"."delivery_fee" >= 0);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_change_for_check" CHECK ("orders"."change_for" is null or "orders"."change_for" > 0);--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_channel_check";--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_channel_check" CHECK ((
        ("orders"."channel" = 'waiter' and "orders"."table_id" is not null and "orders"."created_by_user_id" is not null)
        or ("orders"."channel" = 'catalog' and "orders"."created_by_user_id" is null)
        or (
          "orders"."channel" = 'delivery' and "orders"."table_id" is null and "orders"."created_by_user_id" is null
          and "orders"."customer_id" is not null and "orders"."delivery_address" is not null and "orders"."payment_method" is not null
        )
      ));
