import SwaggerParser from "@apidevtools/swagger-parser";

const path = "openapi/openapi.yaml";

try {
  await SwaggerParser.validate(path);
  console.log("✅ OpenAPI valid");
} catch (e) {
  console.error("❌ OpenAPI invalid:", e.message);
  process.exit(1);
}
