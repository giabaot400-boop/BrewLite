import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  Min,
  ValidateNested,
} from "class-validator";

import { Type } from "class-transformer";

// Giới hạn số nguyên Int trong PostgreSQL
const MAX_MONEY = 2147483647;

// DTO cho từng món trong đơn hàng
export class CreateOrderItemDto {
  // Mã sản phẩm phải là chuỗi không rỗng
  @IsString()
  @IsNotEmpty()
  productId!: string;

  // Size chỉ được S, M hoặc L
  @IsIn(["S", "M", "L"])
  size!: string;

  // Danh sách topping không được trùng ID
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  toppingIds!: string[];

  // Số lượng mỗi món: 1 đến 20
  @IsInt()
  @Min(1)
  @Max(20)
  qty!: number;

  // Giá khách xác nhận: số nguyên không âm
  @IsInt()
  @Min(0)
  @Max(MAX_MONEY)
  expectedUnitPrice!: number;
}

// DTO cho toàn bộ đơn hàng
export class CreateOrderDto {
  // Đơn hàng có từ 1 đến 20 dòng món
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];
}
