//#region src/cli/validations/sqlite.d.ts
type SqliteCredentials = {
  driver: 'd1-http';
  accountId: string;
  databaseId: string;
  token: string;
} | {
  driver: 'sqlite-cloud';
  url: string;
} | {
  url: string;
};
//#endregion
//#region src/ext/api-sqlite.d.ts
declare const startStudioServer: (imports: Record<string, unknown>, credentials: SqliteCredentials | {
  driver: "d1";
  binding: D1Database;
}, options?: {
  host?: string;
  port?: number;
  key?: string;
  cert?: string;
}) => Promise<void>;
//#endregion
export { startStudioServer };