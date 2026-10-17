import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { SwaggerModule } from "@nestjs/swagger";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { json, urlencoded } from "express";
import { AppModule } from "./app.module";
import { DomainErrorFilter } from "./shared/domain-error.filter";
import { loadEnv } from "./shared/config/env";
import { buildOpenApiDocument } from "./shared/openapi";

// Better Auth reads the raw request stream, so body parsers must skip /api/auth/*.
function skipAuthPath(parser: RequestHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) =>
    req.path === "/api/auth" || req.path.startsWith("/api/auth/") ? next() : parser(req, res, next);
}

async function bootstrap() {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(skipAuthPath(json()), skipAuthPath(urlencoded({ extended: true })));
  app.enableCors({ origin: env.webOrigins, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new DomainErrorFilter());
  SwaggerModule.setup("docs", app, buildOpenApiDocument(app));
  await app.listen(env.port);
}
bootstrap();
