import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString } from "class-validator";

export class ReviewMilestoneDto {
  @ApiProperty({ enum: ["approved", "observado"], enumName: "Decision" })
  @IsIn(["approved", "observado"])
  decision: "approved" | "observado";

  /** Required when observing: what the producer must correct */
  @IsOptional()
  @IsString()
  reason?: string;
}
