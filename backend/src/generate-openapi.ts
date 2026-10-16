import { writeFileSync } from "node:fs";
import { NestFactory } from "@nestjs/core";
import { stringify } from "yaml";
import { AppModule } from "./app.module";
import { buildOpenApiDocument } from "./shared/openapi";

// Like `swag init` in Go: regenerate openapi.yaml from controllers and DTOs.
// preview: builds the module graph without instantiating providers, so no database or env is needed.
async function generate() {
  const app = await NestFactory.create(AppModule, { logger: false, preview: true });
  writeFileSync("openapi.yaml", stringify(buildOpenApiDocument(app), { aliasDuplicateObjects: false }));
  await app.close();
}
generate();
