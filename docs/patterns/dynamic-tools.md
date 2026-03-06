# Dynamic Tools

Three patterns for controlling tool visibility at runtime beyond simple auth gating.

## 1. Onboarding — Sequential Steps

Problem: A wizard flow where step 2 only appears after step 1 completes.

```ts
import { createMCPServer, type ToolMiddleware } from "@lynq/lynq";

function step(name: string): ToolMiddleware {
  return {
    name,
    onRegister: () => false,
  };
}

const server = createMCPServer({ name: "onboarding", version: "1.0.0" });

server.tool(
  "step1_set_name",
  { description: "Set your display name" },
  async (args, ctx) => {
    ctx.session.set("name", args.name);
    ctx.session.enableTools("step2_choose_plan");
    return { content: [{ type: "text", text: `Name set to ${args.name}` }] };
  },
);

server.tool(
  "step2_choose_plan",
  step("onboarding-step2"),
  { description: "Choose your plan" },
  async (args, ctx) => {
    ctx.session.set("plan", args.plan);
    ctx.session.enableTools("step3_confirm");
    return { content: [{ type: "text", text: `Plan: ${args.plan}` }] };
  },
);

server.tool(
  "step3_confirm",
  step("onboarding-step3"),
  { description: "Confirm and finish setup" },
  async (_args, ctx) => {
    const name = ctx.session.get("name");
    const plan = ctx.session.get("plan");
    return { content: [{ type: "text", text: `Welcome ${name} (${plan})!` }] };
  },
);
```

## 2. Multi-Tenant — Plan-Based Access

Problem: Free users see basic tools; premium users see everything.

```ts
import { createMCPServer, type ToolMiddleware } from "@lynq/lynq";

function premium(): ToolMiddleware {
  return { name: "premium", onRegister: () => false };
}

const server = createMCPServer({ name: "saas", version: "1.0.0" });

server.tool(
  "login",
  { description: "Log in" },
  async (args, ctx) => {
    const user = await fetchUser(args.token); // your logic
    ctx.session.set("user", user);

    if (user.plan === "premium") {
      ctx.session.authorize("premium");
    }
    return { content: [{ type: "text", text: `Welcome ${user.name}` }] };
  },
);

server.tool("search", { description: "Basic search" }, async (args) => ({
  content: [{ type: "text", text: `Results for ${args.query}` }],
}));

server.tool(
  "analytics",
  premium(),
  { description: "Advanced analytics (premium)" },
  async () => ({
    content: [{ type: "text", text: "Analytics data..." }],
  }),
);

server.tool(
  "export",
  premium(),
  { description: "Export to CSV (premium)" },
  async () => ({
    content: [{ type: "text", text: "Exported." }],
  }),
);
```

## 3. Wizard — Result-Driven Branching

Problem: Tool A's output determines which tool appears next.

```ts
import { createMCPServer, type ToolMiddleware } from "@lynq/lynq";

function hidden(name: string): ToolMiddleware {
  return { name, onRegister: () => false };
}

const server = createMCPServer({ name: "deploy", version: "1.0.0" });

server.tool(
  "choose_target",
  { description: "Where to deploy?" },
  async (args, ctx) => {
    ctx.session.set("target", args.target);

    if (args.target === "aws") {
      ctx.session.enableTools("configure_aws");
    } else if (args.target === "cloudflare") {
      ctx.session.enableTools("configure_cloudflare");
    }

    return { content: [{ type: "text", text: `Target: ${args.target}` }] };
  },
);

server.tool(
  "configure_aws",
  hidden("aws-config"),
  { description: "Configure AWS deployment" },
  async (args) => ({
    content: [{ type: "text", text: `AWS region: ${args.region}` }],
  }),
);

server.tool(
  "configure_cloudflare",
  hidden("cf-config"),
  { description: "Configure Cloudflare deployment" },
  async (args) => ({
    content: [{ type: "text", text: `CF zone: ${args.zone}` }],
  }),
);
```

Key difference: `authorize(name)` reveals **all** tools guarded by that middleware. `enableTools(...names)` reveals **specific** tools by name. Use whichever fits your use case.
