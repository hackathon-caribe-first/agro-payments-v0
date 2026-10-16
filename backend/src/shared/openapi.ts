import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

export function buildOpenApiDocument(app: INestApplication) {
  const config = new DocumentBuilder().setTitle("Agro Payments API").setVersion("0.1.0").build();
  return SwaggerModule.createDocument(app, config);
}
