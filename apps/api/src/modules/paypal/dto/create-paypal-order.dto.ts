import { IsNumber, IsOptional, IsString, Length, Matches, Min } from 'class-validator';

export class CreatePaypalOrderDto {
    @IsNumber()
    @Min(0.01)
    amount!: number;

    @IsString()
    @Length(3, 3)
    @Matches(/^[A-Z]{3}$/)
    currencyCode!: string;

    @IsOptional()
    @IsString()
    @Length(1, 127)
    description?: string;
}