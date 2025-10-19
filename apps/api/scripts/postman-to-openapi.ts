import fs from "fs";
import path from "path";
import YAML from "yaml";

type OpenAPIDoc = {
  openapi: string;
  info: { title: string; version: string; description?: string };
  servers: { url: string }[];
  tags?: { name: string }[];
  paths: Record<string, any>;
  components: { schemas: Record<string, any> };
};

const input = process.argv[2];
const out = process.argv[3] || "openapi/openapi.yaml";
if (!input) {
  console.error('Usage: tsx scripts/postman-to-openapi.ts "openapi/source/collection.json" [openapi/openapi.yaml]');
  process.exit(1);
}

const raw = fs.readFileSync(input, "utf8");
const coll = JSON.parse(raw); // ← זהו אובייקט ה-Postman המקורי

const oas: OpenAPIDoc = {
  openapi: "3.1.0",
  info: { title: coll.info?.name || coll.info?.title || coll.info?.description || "API", version: "1.0.0" },
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

// ─── Helpers ───────────────────────────────────────────────────────────────────

// path מה-raw או מה-path של Postman
const getPathFromUrl = (u: any): string => {
  if (!u) return "/";
  // 1) אם יש path כ-array: ["api","v1","users","{{id}}"]
  if (u.path && Array.isArray(u.path) && u.path.length) {
    return "/" + u.path.join("/");
  }
  // 2) אם יש raw מלא (יכול להיות URL מלא או relative עם querystring)
  const raw = typeof u === "string" ? u : u.raw || "";
  if (raw) {
    // תנסה כ-URL מלא; אם לא—תחתוך עד סימן שאלה
    try {
      const parsed = new URL(raw);
      return parsed.pathname || "/";
    } catch {
      const pathname = raw.split("?")[0] || "/";
      return pathname.startsWith("/") ? pathname : "/" + pathname;
    }
  }
  return "/";
};

// ממיר :id ל-{id} וגם {{var}} ל-{var}
const normalizeTemplatedParams = (p: string): string =>
  p
    .replace(/:([A-Za-z0-9_]+)/g, (_m, v) => `{${v}}`)
    .replace(/{{\s*([^}]+)\s*}}/g, (_m, v) => `{${String(v).replace(/\W+/g, "_")}}`);

// מחלץ מערך באופן אחיד (תומך גם ב-Collection SDK וגם ב-JSON גולמי)
const toArray = (maybe: any): any[] => {
  if (!maybe) return [];
  if (Array.isArray(maybe)) return maybe;
  if (typeof maybe.count === "function" && typeof maybe.each === "function") {
    const arr: any[] = [];
    maybe.each((x: any) => arr.push(x));
    return arr;
  }
  return [];
};

// ─── The walk ──────────────────────────────────────────────────────────────────

// ─── Main Recursive Parser ──────────────────────────────────────────────

const walk = (items: any[], currentTag?: string) => {
  for (const it of items) {
    // אם זה תיקייה (folder)
    if (it.item && Array.isArray(it.item)) {
      const tag = it.name?.trim() || currentTag || "General";
      console.log("📂 Folder →", tag);

      addTag(tag);
      walk(it.item, tag); // העברת השם של התיקייה כ־tag לכל הילדים
      continue;
    }

    // אם זה request רגיל
    const req = it.request;
    if (!req) continue;

    const method = String(req.method || "GET").toLowerCase();

    // הפקת הנתיב
    const getPathFromUrl = (u: any): string => {
      if (!u) return "/";
      if (u.path && Array.isArray(u.path) && u.path.length) return "/" + u.path.join("/");
      const raw = typeof u === "string" ? u : u.raw || "";
      const pathname = raw.split("?")[0] || "/";
      return pathname.startsWith("/") ? pathname : "/" + pathname;
    };
    const urlPath = getPathFromUrl(req.url);
    const fullPath = toOASPath(urlPath);

    // אם אין tag מההורה — ננסה להסיק לפי הנתיב
    const inferTag =
      currentTag ||
      (fullPath.includes("/users")
        ? "Users"
        : fullPath.includes("/drivers")
        ? "Drivers"
        : fullPath.includes("/orders")
        ? "Orders"
        : fullPath.includes("/routes") && fullPath.includes("/stops")
        ? "RouteStops"
        : fullPath.includes("/routes")
        ? "Routes"
        : "Default");

        console.log("➡️  Endpoint:", fullPath, "| tag:", inferTag);

    addTag(inferTag);

    const pathItem = ensurePathItem(fullPath);

    // parameters: path + query
    const parameters: any[] = [];

    for (const m of fullPath.matchAll(/{([^}]+)}/g)) {
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

    // requestBody (אם יש JSON)
    let requestBody: any = undefined;
    if (req.body?.mode === "raw" && typeof req.body.raw === "string") {
      const sample = guessJson(req.body.raw);
      if (sample && typeof sample === "object") {
        const schemaName = upsertSchema(`${it.name || method + fullPath}-Request`, sample);
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

    // תגובה בסיסית
    const responses: any = {
      "200": {
        description: "Success",
        content: { "application/json": { schema: { type: "object" } } },
      },
    };

    // רישום בפאת'ים
    pathItem[method] = {
      tags: [inferTag],
      summary: it.name || undefined,
      description:
        typeof it.description === "string"
          ? it.description
          : it.description?.content || req.description || undefined,
      parameters: parameters.length ? parameters : undefined,
      requestBody,
      responses,
    };
  }
};


const rootItems = Array.isArray(coll.item) ? coll.item : [];
walk(rootItems);

// // (אופציונלי) אבטחה גלובלית Bearer:
// (oas as any).components = (oas as any).components || {};
// (oas as any).components.securitySchemes = { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } };
// (oas as any).security = [{ bearerAuth: [] }];

const yaml = YAML.stringify(oas);
fs.writeFileSync(out, yaml, "utf8");
console.log(`✅ Wrote ${path.resolve(out)}`);
