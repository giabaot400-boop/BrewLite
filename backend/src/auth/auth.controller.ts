import { Body, Controller, Get, Headers, Header, HttpCode, Post } from '@nestjs/common';
import { AuthService } from './auth.service.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Header('Cache-Control', 'no-store')
  @Post('register')
  register(@Body() body: unknown) {
    return this.auth.register(body);
  }

  @Header('Cache-Control', 'no-store')
  @Post('login')
  login(@Body() body: unknown) {
    return this.auth.login(body);
  }

  @Header('Cache-Control', 'no-store')
  @Get('me')
  me(@Headers('authorization') authorization?: string) {
    return this.auth.me(authorization);
  }

  @Header('Cache-Control', 'no-store')
  @Post('logout')
  @HttpCode(204)
  async logout(@Headers('authorization') authorization?: string): Promise<void> {
    await this.auth.logout(authorization);
  }
}
