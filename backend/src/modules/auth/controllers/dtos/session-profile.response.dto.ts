import { ApiProperty } from "@nestjs/swagger";

export class SessionProfileResponseDto {
  user_id: string;
  name: string;
  email: string;

  @ApiProperty({ enum: ["PRODUCER", "BUYER", "INVESTOR", "VERIFIER", "OPERATOR", "UNKNOWN"] })
  role: string;

  /** The record id the web app acts as: the demo alias of a seeded account, else the user id. */
  profile_id: string;
}
