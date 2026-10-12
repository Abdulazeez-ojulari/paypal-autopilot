import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
    @IsEmail()
    @MaxLength(254)
    email!: string;

    @IsString()
    @MinLength(12)
    @MaxLength(72)
    password!: string;

    @IsString()
    @MinLength(2)
    @MaxLength(100)
    businessName!: string;
}