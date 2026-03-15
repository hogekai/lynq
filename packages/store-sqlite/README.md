# @lynq/store-sqlite

SQLite-backed Store implementation for [lynq](https://www.npmjs.com/package/@lynq/lynq) MCP framework.

## Install

```sh
npm install @lynq/store-sqlite @lynq/lynq better-sqlite3
```

## Usage

```ts
import Database from "better-sqlite3";
import { createMCPServer } from "@lynq/lynq";
import { sqliteStore } from "@lynq/store-sqlite";

const db = new Database("store.db");

const server = createMCPServer({
  name: "my-server",
  version: "1.0.0",
  store: sqliteStore({ db }),
});

// In tool handlers: c.store.get(key), c.store.set(key, value, ttl?)
```

The table is created automatically on first use.

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `db` | `Database` | required | better-sqlite3 Database instance |
| `table` | `string` | `"lynq_store"` | Table name |

## Documentation

[https://hogekai.github.io/lynq/](https://hogekai.github.io/lynq/)

## License

MIT
