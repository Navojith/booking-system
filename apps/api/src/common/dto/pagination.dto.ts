import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class PaginationQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;

  get skip() {
    return (this.page - 1) * this.pageSize;
  }
}

export class PaginatedResponseDto<T> {
  @ApiProperty({ isArray: true })
  items!: T[];
  @ApiProperty()
  page!: number;
  @ApiProperty()
  pageSize!: number;
  @ApiProperty()
  total!: number;

  static of<T>(items: T[], total: number, query: PaginationQueryDto): PaginatedResponseDto<T> {
    return Object.assign(new PaginatedResponseDto<T>(), {
      items,
      page: query.page,
      pageSize: query.pageSize,
      total,
    });
  }
}
