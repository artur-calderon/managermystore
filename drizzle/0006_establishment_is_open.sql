ALTER TABLE "establishments" ADD COLUMN IF NOT EXISTS "is_open" boolean DEFAULT true NOT NULL;
