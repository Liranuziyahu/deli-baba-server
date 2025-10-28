import fs from "fs";
import path from "path";
import YAML from "yaml";

type OpenAPIDoc = {
  openapi: string;
  info: { title: string; version: string; description?: string };
  servers: { url: string }[];
  tags?: { name: string }[];
  paths: Record<string, any>;
  components: { schemas: Record<string, any>; securitySchemes?: Record<string, any> };
  security?: any[];
};

const input = process.argv[2];
const out = process.argv[3] || "openapi/openapi.yaml";
if (!input) {
  console.error('Usage: tsx scripts/postman-to-openapi.ts "openapi/source/collection.json" [openapi/openapi.yaml]');
  process.exit(1);
}

const raw = fs.readFileSync(input, "utf8");
const coll = JSON.parse(raw);

const oas: OpenAPIDoc = {
  openapi: "3.1.0",
  info: { title: coll.info?.name || "API", version: "1.0.0" },
  servers: [{ url: "http://localhost:3000/" }],
  tags: [],
  paths: {},
  components: { schemas: {} },
};

const toOASPath = (p: string) =>
  (p.startsWith("/") ? p : "/" + p).replace(/{{\s*([^}]+)\s*}}/g, (_m, v) => `{${String(v).replace(/\W+/g, "_")}}`);

const addTag = (name: string) => {
  if (!name) return;
  if (!oas.tags!.some((t) => t.name === name)) oas.tags!.push({ name });
};

const ensurePathItem = (p: string) => (oas.paths[p] ??= {});

const guessJson = (str?: string) => {
  if (!str) return null;
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
};

const jsonToSchema = (obj: any): any => {
  if (obj === null) return { type: "null" };
  if (Array.isArray(obj)) {
    const first = obj.length ? jsonToSchema(obj[0]) : {};
    return { type: "array", items: first };
  }
  switch (typeof obj) {
    case "string":
      return { type: "string" };
    case "number":
      return Number.isInteger(obj) ? { type: "integer" } : { type: "number" };
    case "boolean":
      return { type: "boolean" };
    case "object":
      return {
        type: "object",
        properties: Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, jsonToSchema(v)])),
        required: Object.entries(obj)
          .filter(([, v]) => v !== undefined)
          .map(([k]) => k),
        additionalProperties: false,
      };
    default:
      return {};
  }
};

const safeName = (s: string) => (s || "Schema").replace(/[^\w]/g, "_").slice(0, 60) || "Schema";
const upsertSchema = (name: string, sample: any) => {
  const n = safeName(name);
  if (!oas.components.schemas[n]) {
    oas.components.schemas[n] = jsonToSchema(sample);
  }
  return n;
};

// ─── Recursive Walk ───────────────────────────────────────────────────────────────

const walk = (items: any[], currentTag?: string) => {
  for (const it of items) {
    if (it.item && Array.isArray(it.item)) {
      const tag = it.name?.trim() || currentTag || "General";
      addTag(tag);
      walk(it.item, tag);
      continue;
    }

    const req = it.request;
    if (!req) continue;

    const method = String(req.method || "GET").toLowerCase();
    const rawUrl = req.url?.raw || "";
    let rawPath = rawUrl.split("?")[0] || "/";
    if (rawPath.includes("{{baseUrl}}")) {
      rawPath = rawPath.replace(/{{\s*baseUrl\s*}}\/?/, ""); // מסיר את {{baseUrl}} מהנתיב
    }
    const path = toOASPath(rawPath);

    const inferTag =
      currentTag ||
      (path.includes("/users")
        ? "Users"
        : path.includes("/drivers")
        ? "Drivers"
        : path.includes("/orders")
        ? "Orders"
        : path.includes("/routes") && path.includes("/stops")
        ? "RouteStops"
        : path.includes("/routes")
        ? "Routes"
        : "Default");

    addTag(inferTag);
    const pathItem = ensurePathItem(path);

    // parameters
    const parameters: any[] = [];
    for (const m of path.matchAll(/{([^}]+)}/g)) {
      parameters.push({ name: m[1], in: "path", required: true, schema: { type: "string" } });
    }

    if (req.url?.query && Array.isArray(req.url.query)) {
      for (const q of req.url.query) {
        parameters.push({
          name: q.key,
          in: "query",
          required: false,
          schema: { type: "string" },
          example: q.value,
        });
      }
    }

    // request body
    let requestBody: any = undefined;
    if (req.body?.mode === "raw" && typeof req.body.raw === "string") {
      const sample = guessJson(req.body.raw);
      if (sample && typeof sample === "object") {
        const schemaName = upsertSchema(`${it.name || method + path}-Request`, sample);
        requestBody = {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: `#/components/schemas/${schemaName}` },
              example: sample,
            },
          },
        };
      }
    }

    // responses
    const responses: any = {
      "200": {
        description: "Success",
        content: { "application/json": { schema: { type: "object" } } },
      },
    };

    // auth rule: protect all except login/register
    const isProtected = !path.includes("/auth/login") && !path.includes("/auth/register");
    const security = isProtected ? [{ bearerAuth: [] }] : undefined;

    pathItem[method] = {
      tags: [inferTag],
      summary: it.name || undefined,
      description: req.description || undefined,
      parameters: parameters.length ? parameters : undefined,
      requestBody,
      responses,
      ...(security ? { security } : {}),
    };
  }
};

const rootItems = Array.isArray(coll.item) ? coll.item : [];
walk(rootItems);

// ─── Add global JWT definition ───────────────────────────────────────────────
oas.components.securitySchemes = {
  bearerAuth: {
    type: "http",
    scheme: "bearer",
    bearerFormat: "JWT",
  },
};

const yaml = YAML.stringify(oas);
fs.writeFileSync(out, yaml, "utf8");
console.log(`✅ Wrote ${path.resolve(out)} with automatic JWT security`);
