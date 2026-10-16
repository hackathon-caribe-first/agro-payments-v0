import { writeFileSync } from "node:fs";
import { NestFactory } from "@nestjs/core";
import { stringify } from "yaml";
import { AppModule } from "./app.module";
import { buildOpenApiDocument } from "./shared/openapi";

// Like `swag init` in Go: regenerate openapi.yaml from controllers and DTOs.
async function generate() {
  const app = await NestFactory.create(AppModule, { logger: false });
  writeFileSync("openapi.yaml", stringify(buildOpenApiDocument(app), { aliasDuplicateObjects: false }));
  await app.close();
}
generate();
