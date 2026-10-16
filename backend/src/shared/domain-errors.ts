// Errors raised by business rules; DomainErrorFilter maps them to HTTP so modules stay framework-free.
export class DomainError extends Error {}
export class NotFoundError extends DomainError {}
