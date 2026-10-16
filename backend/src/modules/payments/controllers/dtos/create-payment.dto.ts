import { IsNumber, IsPositive, Length } from "class-validator";

export class CreatePaymentDto {
  /** Amount in major currency units, e.g. 1500 */
  @IsNumber()
  @IsPositive()
  amount: number;

  /** ISO 4217 currency code, e.g. COP */
  @Length(3, 3)
  currency: string;
}
