import { Module } from '@nestjs/common';
import { RevenueModule } from '../revenue/revenue.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiProviderFactory } from './providers/ai-provider.factory';
import { OllamaProvider } from './providers/ollama.provider';
import { OpenAiProvider } from './providers/openai.provider';
import { AiRunService } from './ai-run.service';
import { PolicyEngineService } from './policy-engine.service';

@Module({
    imports: [
        RevenueModule,
    ],

    controllers: [
        AiController,
    ],

    providers: [
        AiService,
        AiProviderFactory,
        OpenAiProvider,
        OllamaProvider,
        AiRunService,
        PolicyEngineService,
    ],

    exports: [
        AiService,
        AiRunService,
    ],
})
export class AiModule {}