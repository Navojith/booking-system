import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { LocationResponseDto } from './dto/location-response.dto.js';

@Injectable()
export class LocationsService {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>) {}

  async findAll(): Promise<LocationResponseDto[]> {
    const rows = await this.txHost.tx.location.findMany({ orderBy: { name: 'asc' } });
    return rows.map(({ id, name, address }) => ({ id, name, address }));
  }
}
