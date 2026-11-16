CREATE TABLE "accounts" (
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "accounts_provider_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"email" text,
	"email_verified" timestamp with time zone,
	"image" text,
	"password_hash" text,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "verification_tokens_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
CREATE TABLE "cash_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"establishment_id" uuid NOT NULL,
	"order_id" uuid,
	"type" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"description" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_movements_type_check" CHECK ("cash_movements"."type" in ('in', 'out')),
	CONSTRAINT "cash_movements_amount_check" CHECK ("cash_movements"."amount" > 0),
	CONSTRAINT "cash_movements_description_check" CHECK ("cash_movements"."type" = 'in' or "cash_movements"."description" is not null)
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"establishment_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "categories_establishment_id_key" UNIQUE("establishment_id","id")
);
--> statement-breakpoint
CREATE TABLE "tables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"establishment_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "tables_establishment_id_key" UNIQUE("establishment_id","id")
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"establishment_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"product_name" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_items_order_product_key" UNIQUE("order_id","product_id"),
	CONSTRAINT "order_items_quantity_check" CHECK ("order_items"."quantity" > 0),
	CONSTRAINT "order_items_price_check" CHECK ("order_items"."unit_price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"establishment_id" uuid NOT NULL,
	"table_id" uuid,
	"channel" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"total_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"created_by_user_id" uuid,
	"customer_name" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "orders_establishment_id_key" UNIQUE("establishment_id","id"),
	CONSTRAINT "orders_channel_check" CHECK ((
        ("orders"."channel" = 'waiter' and "orders"."table_id" is not null and "orders"."created_by_user_id" is not null)
        or ("orders"."channel" = 'catalog' and "orders"."created_by_user_id" is null)
      )),
	CONSTRAINT "orders_status_check" CHECK ("orders"."status" in ('pending', 'preparing', 'ready', 'closed', 'cancelled')),
	CONSTRAINT "orders_channel_value_check" CHECK ("orders"."channel" in ('waiter', 'catalog')),
	CONSTRAINT "orders_total_check" CHECK ("orders"."total_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"establishment_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price" numeric(12, 2) NOT NULL,
	"is_available" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "products_establishment_id_key" UNIQUE("establishment_id","id"),
	CONSTRAINT "products_price_check" CHECK ("products"."price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "establishment_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"establishment_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "establishment_members_establishment_user_key" UNIQUE("establishment_id","user_id"),
	CONSTRAINT "establishment_members_establishment_id_key" UNIQUE("establishment_id","id"),
	CONSTRAINT "establishment_members_role_check" CHECK ("establishment_members"."role" in ('owner', 'admin', 'waiter', 'kitchen', 'cashier'))
);
--> statement-breakpoint
CREATE TABLE "establishments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"timezone" text DEFAULT 'America/Sao_Paulo' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "establishments_slug_unique" UNIQUE("slug"),
	CONSTRAINT "establishments_status_check" CHECK ("establishments"."status" in ('active', 'suspended')),
	CONSTRAINT "establishments_slug_check" CHECK ("establishments"."slug" = lower("establishments"."slug") and char_length("establishments"."slug") between 3 and 63 and "establishments"."slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_order_establishment_fk" FOREIGN KEY ("establishment_id","order_id") REFERENCES "public"."orders"("establishment_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_member_establishment_fk" FOREIGN KEY ("establishment_id","created_by_user_id") REFERENCES "public"."establishment_members"("establishment_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tables" ADD CONSTRAINT "tables_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_establishment_fk" FOREIGN KEY ("establishment_id","order_id") REFERENCES "public"."orders"("establishment_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_establishment_fk" FOREIGN KEY ("establishment_id","product_id") REFERENCES "public"."products"("establishment_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_establishment_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_table_establishment_fk" FOREIGN KEY ("establishment_id","table_id") REFERENCES "public"."tables"("establishment_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_member_establishment_fk" FOREIGN KEY ("establishment_id","created_by_user_id") REFERENCES "public"."establishment_members"("establishment_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_establishment_fk" FOREIGN KEY ("establishment_id","category_id") REFERENCES "public"."categories"("establishment_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "establishment_members" ADD CONSTRAINT "establishment_members_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "establishment_members" ADD CONSTRAINT "establishment_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_uidx" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "cash_movements_one_sale" ON "cash_movements" USING btree ("order_id") WHERE "cash_movements"."order_id" is not null and "cash_movements"."type" = 'in';--> statement-breakpoint
CREATE INDEX "cash_movements_establishment_occurred_idx" ON "cash_movements" USING btree ("establishment_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_name_active_key" ON "categories" USING btree ("establishment_id","name") WHERE "categories"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "tables_name_active_key" ON "tables" USING btree ("establishment_id","name") WHERE "tables"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "order_items_establishment_product_idx" ON "order_items" USING btree ("establishment_id","product_id");--> statement-breakpoint
CREATE INDEX "orders_establishment_status_idx" ON "orders" USING btree ("establishment_id","status");--> statement-breakpoint
CREATE INDEX "orders_active_status_idx" ON "orders" USING btree ("establishment_id","status") WHERE "orders"."status" in ('pending', 'preparing', 'ready');--> statement-breakpoint
CREATE INDEX "orders_establishment_table_idx" ON "orders" USING btree ("establishment_id","table_id");--> statement-breakpoint
CREATE UNIQUE INDEX "products_name_active_key" ON "products" USING btree ("establishment_id","category_id","name") WHERE "products"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "products_establishment_category_idx" ON "products" USING btree ("establishment_id","category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "establishment_members_one_owner" ON "establishment_members" USING btree ("establishment_id") WHERE "establishment_members"."role" = 'owner' and "establishment_members"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "establishment_members_user_id_idx" ON "establishment_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "establishment_members_establishment_id_idx" ON "establishment_members" USING btree ("establishment_id");--> statement-breakpoint
CREATE INDEX "establishments_status_idx" ON "establishments" USING btree ("status");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER establishments_set_updated_at BEFORE UPDATE ON establishments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER establishment_members_set_updated_at BEFORE UPDATE ON establishment_members FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER categories_set_updated_at BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER products_set_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER tables_set_updated_at BEFORE UPDATE ON tables FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER orders_set_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER order_items_set_updated_at BEFORE UPDATE ON order_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION assert_one_active_owner()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target uuid;
  owner_count integer;
BEGIN
  IF TG_TABLE_NAME = 'establishments' THEN
    target := NEW.id;
  ELSE
    target := COALESCE(NEW.establishment_id, OLD.establishment_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM establishments WHERE id = target) THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO owner_count
  FROM establishment_members
  WHERE establishment_id = target
    AND role = 'owner'
    AND deleted_at IS NULL;

  IF owner_count <> 1 THEN
    RAISE EXCEPTION 'establishment_requires_one_owner';
  END IF;

  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER establishments_require_owner
AFTER INSERT ON establishments
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION assert_one_active_owner();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER establishment_members_one_owner
AFTER INSERT OR UPDATE OR DELETE ON establishment_members
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION assert_one_active_owner();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_disable_active_owner()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.disabled_at IS NOT NULL AND OLD.disabled_at IS DISTINCT FROM NEW.disabled_at THEN
    IF EXISTS (
      SELECT 1
      FROM establishment_members AS member
      INNER JOIN establishments AS establishment ON establishment.id = member.establishment_id
      WHERE member.user_id = NEW.id
        AND member.role = 'owner'
        AND member.deleted_at IS NULL
        AND establishment.deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'cannot_disable_active_owner';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER users_prevent_disable_owner
BEFORE UPDATE OF disabled_at ON users
FOR EACH ROW
EXECUTE FUNCTION prevent_disable_active_owner();