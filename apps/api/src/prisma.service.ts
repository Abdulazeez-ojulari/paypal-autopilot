import "dotenv/config";
import { INestApplication, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { LogDefinition, LogLevel, TransactionIsolationLevel } from 'generated/prisma/internal/prismaNamespace';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from 'generated/prisma/client';

@Injectable()
export class PrismaService
    extends PrismaClient<{
        adapter: PrismaPg;
        log: (LogLevel | LogDefinition)[];
        transactionOptions?: {
            maxWait?: number;
            timeout?: number;
            isolationLevel?: TransactionIsolationLevel;
        };
    }>
    implements OnModuleInit
{
    private readonly logger = new Logger(PrismaService.name);

    constructor() {
        console.log(process.env.DATABASE_URL, "aadsd")
        const pool = new Pool({ connectionString: process.env.DATABASE_URL });
        // 2. Wrap it with the Prisma adapter
        const adapter = new PrismaPg(pool);

        super({
            adapter,
            log: [
                {
                    emit: 'event',
                    level: 'query',
                },
                {
                    emit: 'stdout',
                    level: 'error',
                },
                {
                    emit: 'stdout',
                    level: 'warn',
                },
            ],
        });

        this.$on('query', (event) => {
            this.logger.debug(`${event.duration}ms | ${event.query}`);
        });
    }

    async onModuleInit() {
        await this.$connect();
        this.logger.log('Connected to PostgreSQL');
    }

    async enableShutdownHooks(app: INestApplication) {
        process.on('beforeExit', async () => {
            await app.close();
        });
    }
}
