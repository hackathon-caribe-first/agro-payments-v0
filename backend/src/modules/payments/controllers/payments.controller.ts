import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CreatePaymentUseCase } from "../application/create-payment.use-case";
import { GetPaymentUseCase } from "../application/get-payment.use-case";
import { CreatePaymentDto } from "./dtos/create-payment.dto";
import { PaymentResponseDto } from "./dtos/payment.response.dto";

@ApiTags("payments")
@Controller("payments")
export class PaymentsController {
  constructor(
    private readonly createPayment: CreatePaymentUseCase,
    private readonly getPayment: GetPaymentUseCase,
  ) {}

  /** Create a payment */
  @Post()
  create(@Body() dto: CreatePaymentDto): Promise<PaymentResponseDto> {
    return this.createPayment.execute(dto);
  }

  /** Get a payment by id */
  @Get(":id")
  findOne(@Param("id") id: string): Promise<PaymentResponseDto> {
    return this.getPayment.execute(id);
  }
}
