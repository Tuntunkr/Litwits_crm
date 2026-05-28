import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const tabOrders = pgTable("tab_orders", {
  id: serial().primaryKey(),
  documentKey: text("document_key").notNull().unique(),
  tabOrder: text("tab_order").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
