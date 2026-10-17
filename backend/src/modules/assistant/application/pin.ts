import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { Injectable } from "@nestjs/common";
import { DomainError, ValidationError } from "../../../shared/domain-errors";
import { PinStore } from "../ports/assistant-store";

// RNF-12 / D-14: the 4-digit PIN that confirms an order line. It only ever travels in the confirm request body, is stored
// as a salted scrypt hash and never reaches the model or the conversation.
export const MAX_PIN_ATTEMPTS = 5;
const KEY_LENGTH = 32;
const hashPin = promisify(scrypt) as (pin: string, salt: Buffer, keylen: number) => Promise<Buffer>;

const isPin = (v: unknown): v is string => typeof v === "string" && /^\d{4}$/.test(v);
const pinError = (message: string) => new ValidationError({ pin: [message] }, message);

@Injectable()
export class PinUseCase {
  constructor(private readonly store: PinStore) {}

  async status(userId: string) {
    const record = await this.store.find(userId);
    return { pinSet: record !== null, locked: record !== null && record.failedAttempts >= MAX_PIN_ATTEMPTS };
  }

  /** Set or change the PIN; changing it needs the current one (and counts as an attempt). */
  async set(userId: string, request: { pin: unknown; currentPin?: unknown }) {
    if (!isPin(request.pin)) throw pinError("El PIN debe tener exactamente 4 dígitos.");
    if (await this.store.find(userId)) {
      if (!isPin(request.currentPin)) throw new ValidationError({ current_pin: ["Ingrese su PIN actual para cambiarlo."] }, "Current PIN required");
      await this.verify(userId, request.currentPin);
    }
    const salt = randomBytes(16);
    const hash = await hashPin(request.pin, salt, KEY_LENGTH);
    await this.store.save({ userId, hash: hash.toString("hex"), salt: salt.toString("hex"), failedAttempts: 0, updatedAt: new Date() });
  }

  // ponytail: a locked PIN stays locked; unlocking is the technician's job (modo asistido, RF-39), not built yet.
  async verify(userId: string, pin: unknown) {
    const record = await this.store.find(userId);
    if (!record) throw new DomainError("Primero cree su PIN de 4 dígitos para confirmar órdenes.");
    if (record.failedAttempts >= MAX_PIN_ATTEMPTS) throw new DomainError("Su PIN está bloqueado por intentos fallidos. Pida ayuda a su técnico.");
    const expected = Buffer.from(record.hash, "hex");
    const actual = isPin(pin) ? await hashPin(pin, Buffer.from(record.salt, "hex"), KEY_LENGTH) : Buffer.alloc(KEY_LENGTH);
    if (isPin(pin) && timingSafeEqual(expected, actual)) {
      if (record.failedAttempts > 0) await this.store.save({ ...record, failedAttempts: 0, updatedAt: new Date() });
      return;
    }
    const failedAttempts = record.failedAttempts + 1;
    await this.store.save({ ...record, failedAttempts, updatedAt: new Date() });
    const left = MAX_PIN_ATTEMPTS - failedAttempts;
    throw pinError(left > 0 ? `PIN incorrecto. Le quedan ${left} intentos.` : "PIN incorrecto. Su PIN quedó bloqueado; pida ayuda a su técnico.");
  }
}
