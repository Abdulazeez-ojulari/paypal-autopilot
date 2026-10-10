import { Injectable } from '@nestjs/common';
import { AiProvider } from './ai-provider.interface';
import { OllamaProvider } from './ollama.provider';
import { OpenAiProvider } from './openai.provider';

@Injectable()
export class AiProviderFactory {
    constructor(
        private readonly ollamaProvider: OllamaProvider,
        private readonly openAiProvider: OpenAiProvider,
    ) {}

    getProvider(): AiProvider {
        const provider = (process.env.AI_PROVIDER ?? 'ollama').toLowerCase();

        switch (provider) {
            case 'ollama':
                return this.ollamaProvider;

            case 'openai':
                return this.openAiProvider;

            default:
                throw new Error(`Unsupported AI_PROVIDER: ${provider}. ` + `Use "ollama" or "openai".`);
        }
    }
}