import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { DomainErrorFilter } from "./shared/domain-error.filter";
import { buildOpenApiDocument } from "./shared/openapi";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new DomainErrorFilter());
  app.enableCors({ origin: process.env.CORS_ORIGIN?.split(",") ?? true });
  SwaggerModule.setup("docs", app, buildOpenApiDocument(app));
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
