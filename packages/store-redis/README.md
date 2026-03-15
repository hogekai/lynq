# @lynq/store-redis

Redis-backed Store implementation for [lynq](https://www.npmjs.com/package/@lynq/lynq) MCP framework.

## Install

```sh
npm install @lynq/store-redis @lynq/lynq ioredis
```

## Usage

```ts
import Redis from "ioredis";
import { createMCPServer } from "@lynq/lynq";
import { redisStore } from "@lynq/store-redis";

const client = new Redis();

const server = createMCPServer({
  name: "my-server",
  version: "1.0.0",
  store: redisStore({ client }),
});

// In tool handlers: c.store.get(key), c.store.set(key, value, ttl?)
```

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `client` | `Redis` | required | ioredis client instance |
| `prefix` | `string` | `"lynq:"` | Key prefix for all entries |

## Documentation

[https://hogekai.github.io/lynq/](https://hogekai.github.io/lynq/)

## License

MIT
