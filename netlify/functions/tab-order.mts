import { db } from "../../db/index.js";
import { tabOrders } from "../../db/schema.js";
import { eq } from "drizzle-orm";

export const config = { path: "/api/tab-order" };

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

export default async (req: Request) => {
  if (req.method === "OPTIONS") {
    return json({}, 204);
  }

  if (req.method === "GET") {
    const url = new URL(req.url);
    const documentKey = url.searchParams.get("documentKey");
    if (!documentKey) {
      return json({ error: "documentKey is required" }, 400);
    }

    const [row] = await db
      .select()
      .from(tabOrders)
      .where(eq(tabOrders.documentKey, documentKey));

    if (!row) {
      return json({ tabOrder: null });
    }

    return json({ tabOrder: JSON.parse(row.tabOrder), updatedAt: row.updatedAt });
  }

  if (req.method === "POST") {
    const body = await req.json();
    const { documentKey, tabOrder } = body as {
      documentKey: string;
      tabOrder: string[];
    };

    if (!documentKey || !Array.isArray(tabOrder)) {
      return json({ error: "documentKey and tabOrder[] are required" }, 400);
    }

    const serialized = JSON.stringify(tabOrder);

    const [existing] = await db
      .select()
      .from(tabOrders)
      .where(eq(tabOrders.documentKey, documentKey));

    if (existing) {
      await db
        .update(tabOrders)
        .set({ tabOrder: serialized, updatedAt: new Date() })
        .where(eq(tabOrders.documentKey, documentKey));
    } else {
      await db.insert(tabOrders).values({
        documentKey,
        tabOrder: serialized,
        updatedAt: new Date(),
      });
    }

    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, 405);
};
