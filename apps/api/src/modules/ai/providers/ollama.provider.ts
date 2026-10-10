import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { AiProvider } from "./ai-provider.interface";
import { RevenueAgentResponse, RevenueAgentResponseSchema } from "../ai.types";
import { buildRevenueUserPrompt, REVENUE_SYSTEM_PROMPT } from "../ai-prompts";
import { REVENUE_AGENT_JSON_SCHEMA } from "../revenue-agent.schema";
import { Agent, setGlobalDispatcher } from 'undici';

type OllamaChatResponse = {
    message?: {
        role?: string;
        content?: string;
    };
};

const customAgent = new Agent({
  headersTimeout: 0,
  bodyTimeout: 0, 
});

setGlobalDispatcher(customAgent);

@Injectable()
export class OllamaProvider implements AiProvider {
    private readonly baseUrl: string;
    private readonly model: string;

    constructor() {
        this.baseUrl = (process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434').replace(/\/$/, '');
        this.model = process.env.AI_MODEL ?? 'qwen3:8b';
    }

    async analyzeRevenue(
        revenueContext: unknown,
    ): Promise<RevenueAgentResponse> {
        try {
            console.log(buildRevenueUserPrompt(revenueContext))
            const response = await fetch(
                `${this.baseUrl}/api/chat`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },

                    body: JSON.stringify({
                        model: this.model,
                        stream: false,
                        messages: [
                            {
                                role: 'system',
                                content: REVENUE_SYSTEM_PROMPT,
                            },
                            {
                                role: 'user',
                                content: buildRevenueUserPrompt(revenueContext),
                            },
                        ],
                        format: REVENUE_AGENT_JSON_SCHEMA,
                        options: {
                            temperature: 0,
                            "num_ctx": 32768, "num_predict": 8192
                        },
                    }),
                },
            );

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Ollama returned ${response.status}: ${errorText}`);
            }

            // console.log(await response.json())

            const data = (await response.json()) as OllamaChatResponse;
            console.log(data)
            const content = data.message?.content;

            if (!content) {
                throw new Error('Ollama returned an empty response');
            }

            const parsed = JSON.parse(content);

            return RevenueAgentResponseSchema.parse(parsed);
        } catch (error) {
            console.error('Ollama revenue analysis failed:', error);
            throw new InternalServerErrorException('Ollama revenue analysis failed');
        }
    }
}