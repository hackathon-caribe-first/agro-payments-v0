import { IsNotEmpty, IsString } from "class-validator";

export class SubmitEvidenceDto {
  /** What the producer did and what the evidence shows */
  @IsString()
  @IsNotEmpty()
  description: string;
}
