import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { buildOpenApiDocument } from "./shared/openapi";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  SwaggerModule.setup("docs", app, buildOpenApiDocument(app));
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
