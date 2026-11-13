import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  Equals,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

const MAX_MONEY = 2147483647;

export class CreateOrderV2ItemDto {
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @IsIn(["S", "M", "L"])
  size!: "S" | "M" | "L";

  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  toppingIds!: string[];

  @IsInt()
  @Min(1)
  @Max(20)
  qty!: number;

  @IsInt()
  @Min(0)
  @Max(MAX_MONEY)
  expectedUnitPrice!: number;
}

export class CreateOrderV2Dto {
  @Equals(2)
  schemaVersion!: 2;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderV2ItemDto)
  items!: CreateOrderV2ItemDto[];

  @IsOptional()
  @IsString()
  promotionCode!: string | null;

  @IsInt()
  @Min(1)
  @Max(MAX_MONEY)
  expectedTotal!: number;
}
