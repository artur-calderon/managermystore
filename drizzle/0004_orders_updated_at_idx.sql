CREATE INDEX IF NOT EXISTS "orders_establishment_updated_idx" ON "orders" USING btree ("establishment_id","updated_at");
