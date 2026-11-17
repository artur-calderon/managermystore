CREATE TABLE IF NOT EXISTS "delivery_settings" (
	"establishment_id" uuid PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"fee" numeric(12, 2) DEFAULT '0' NOT NULL,
	"payment_methods" text[] DEFAULT '{cash,pix,credit_card,debit_card}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_settings_fee_check" CHECK ("delivery_settings"."fee" >= 0),
	CONSTRAINT "delivery_settings_payment_methods_check" CHECK ("delivery_settings"."payment_methods" <@ array['cash', 'pix', 'credit_card', 'debit_card', 'meal_voucher']::text[])
);
--> statement-breakpoint
ALTER TABLE "delivery_settings" ADD CONSTRAINT "delivery_settings_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_status_check";--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_status_check" CHECK ("orders"."status" in ('pending', 'preparing', 'ready', 'out_for_delivery', 'closed', 'cancelled'));--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_channel_value_check";--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_channel_value_check" CHECK ("orders"."channel" in ('waiter', 'catalog', 'delivery'));--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_channel_check";--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_channel_check" CHECK ((
        ("orders"."channel" = 'waiter' and "orders"."table_id" is not null and "orders"."created_by_user_id" is not null)
        or ("orders"."channel" = 'catalog' and "orders"."created_by_user_id" is null)
        or ("orders"."channel" = 'delivery' and "orders"."table_id" is null and "orders"."created_by_user_id" is null)
      ));--> statement-breakpoint
DROP INDEX IF EXISTS "orders_active_status_idx";--> statement-breakpoint
CREATE INDEX "orders_active_status_idx" ON "orders" USING btree ("establishment_id","status") WHERE "orders"."status" in ('pending', 'preparing', 'ready', 'out_for_delivery');
