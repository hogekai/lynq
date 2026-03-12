import type { Store } from "@lynq/lynq";

export interface SqliteStoreOptions {
	/** better-sqlite3 Database instance. */
	db: {
		prepare(sql: string): {
			run(...params: unknown[]): unknown;
			get(...params: unknown[]): unknown;
		};
		exec(sql: string): void;
	};
	/** Table name. Default: "lynq_store" */
	table?: string;
}

/**
 * Create a SQLite-backed Store implementation.
 *
 * @example
 * ```ts
 * import Database from "better-sqlite3";
 * import { sqliteStore } from "@lynq/store-sqlite";
 *
 * const store = sqliteStore({ db: new Database("app.db") });
 * const server = createMCPServer({ name: "my-server", version: "1.0.0", store });
 * ```
 */
export function sqliteStore(options: SqliteStoreOptions): Store {
	const { db, table = "lynq_store" } = options;

	// Create table if not exists
	db.exec(`
		CREATE TABLE IF NOT EXISTS ${table} (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL,
			expires_at INTEGER
		)
	`);

	const getStmt = db.prepare(
		`SELECT value, expires_at FROM ${table} WHERE key = ?`,
	);
	const setStmt = db.prepare(
		`INSERT OR REPLACE INTO ${table} (key, value, expires_at) VALUES (?, ?, ?)`,
	);
	const deleteStmt = db.prepare(`DELETE FROM ${table} WHERE key = ?`);
	const cleanupStmt = db.prepare(
		`DELETE FROM ${table} WHERE expires_at IS NOT NULL AND expires_at <= ?`,
	);

	return {
		async get<T = unknown>(key: string): Promise<T | undefined> {
			// Clean up expired entries lazily
			cleanupStmt.run(Date.now());

			const row = getStmt.get(key) as
				| { value: string; expires_at: number | null }
				| undefined;
			if (!row) return undefined;

			if (row.expires_at !== null && row.expires_at <= Date.now()) {
				deleteStmt.run(key);
				return undefined;
			}

			try {
				return JSON.parse(row.value) as T;
			} catch {
				return row.value as T;
			}
		},

		async set(key: string, value: unknown, ttl?: number): Promise<void> {
			const serialized = JSON.stringify(value);
			const expiresAt =
				ttl !== undefined && ttl > 0 ? Date.now() + ttl * 1000 : null;
			setStmt.run(key, serialized, expiresAt);
		},

		async delete(key: string): Promise<void> {
			deleteStmt.run(key);
		},
	};
}
