CREATE TABLE "tab_orders" (
	"id" serial PRIMARY KEY,
	"document_key" text NOT NULL UNIQUE,
	"tab_order" text NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
