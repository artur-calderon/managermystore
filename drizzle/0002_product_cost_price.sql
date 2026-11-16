ALTER TABLE "products" ADD COLUMN "cost_price" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_cost_price_check" CHECK ("products"."cost_price" is null or "products"."cost_price" >= 0);
