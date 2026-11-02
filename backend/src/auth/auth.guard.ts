import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { AuthService } from './auth.service.js';

type AuthenticatedRequest = {
  headers: { authorization?: string };
  user?: { id: string };
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = await this.authService.validateSession(request.headers.authorization);
    request.user = { id: user.id };
    return true;
  }
}
