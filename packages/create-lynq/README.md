# create-lynq

Scaffold a new [lynq](https://www.npmjs.com/package/@lynq/lynq) MCP server project.

## Usage

```sh
npm create lynq my-server
# or
pnpm create lynq my-server
```

## Templates

| Template | Description |
|---|---|
| `minimal` | stdio transport + 1 tool |
| `hono` | Hono HTTP + guard + auth flow |
| `full` | Hono + GitHub OAuth + Stripe + Store + tests |

```sh
npm create lynq my-server --template hono
```

## Documentation

[https://hogekai.github.io/lynq/](https://hogekai.github.io/lynq/)

## License

MIT
