const require_chunk = require('./chunk-D0pENJGy.js');
require("drizzle-orm/cockroach-core");
require("drizzle-orm/mssql-core");
let drizzle_orm_mysql_core = require("drizzle-orm/mysql-core");
let drizzle_orm_pg_core = require("drizzle-orm/pg-core");
let drizzle_orm_sqlite_core = require("drizzle-orm/sqlite-core");

//#region src/dialects/drizzle.ts
var drizzle_exports = /* @__PURE__ */ require_chunk.__exportAll({ extractPostgresExisting: () => extractPostgresExisting });
const extractPostgresExisting = (schemas, views, matViews) => {
	const existingSchemas = schemas.filter((x) => x.isExisting).map((x) => ({
		type: "schema",
		name: x.schemaName
	}));
	const existingViews = views.map((x) => (0, drizzle_orm_pg_core.getViewConfig)(x)).filter((x) => x.isExisting).map((x) => ({
		type: "table",
		schema: x.schema ?? "public",
		name: x.name
	}));
	const existingMatViews = matViews.map((x) => (0, drizzle_orm_pg_core.getMaterializedViewConfig)(x)).filter((x) => x.isExisting).map((x) => ({
		type: "table",
		schema: x.schema ?? "public",
		name: x.name
	}));
	return [
		...existingSchemas,
		...existingViews,
		...existingMatViews
	];
};

//#endregion
Object.defineProperty(exports, 'drizzle_exports', {
  enumerable: true,
  get: function () {
    return drizzle_exports;
  }
});