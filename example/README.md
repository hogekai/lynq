# lynq demo

Login → tool visibility change demo. Includes async tasks.

## Run with Claude Code

Open this directory in Claude Code:

```sh
cd example
claude
```

`.mcp.json` is pre-configured. The `lynq-demo` server starts automatically.

### Flow

1. Only `login` is visible
2. Call `login` with `admin` / `1234`
3. `get_weather`, `save_note`, and `slow_analysis` appear
4. `slow_analysis` is an async task — it returns a task ID immediately, then sends progress notifications (`0%`, `50%`, `100%`) over ~4 seconds
