import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

// C/E import module này vào ProductsModule sau khi cấu hình PostgreSQL local.
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
