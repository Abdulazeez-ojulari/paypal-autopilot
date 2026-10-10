import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { AiProvider } from "./ai-provider.interface";
import OpenAI from "openai";
import { RevenueAgentResponse, RevenueAgentResponseSchema } from "../ai.types";
import { buildRevenueUserPrompt, REVENUE_SYSTEM_PROMPT } from "../ai-prompts";
import { REVENUE_AGENT_JSON_SCHEMA } from "../revenue-agent.schema";

@Injectable()
export class OpenAiProvider implements AiProvider {
    private readonly client: OpenAI;
    private readonly model: string;

    constructor() {
        const apiKey = process.env.OPENAI_API_KEY;

        if (!apiKey) {
            throw new Error('OPENAI_API_KEY is required when AI_PROVIDER=openai');
        }

        this.client = new OpenAI({ apiKey });
        this.model = process.env.AI_MODEL ?? 'gpt-4.1-mini';
    }

    async analyzeRevenue(
        revenueContext: unknown,
    ): Promise<RevenueAgentResponse> {
        try {
            const response = await this.client.chat.completions.create(
                {
                    model: this.model,
                    temperature: 0,
                    messages: [
                        {
                            role: 'system',
                            content: REVENUE_SYSTEM_PROMPT
                        },
                        {
                            role: 'user',
                            content: buildRevenueUserPrompt(revenueContext),
                        },
                    ],
                    response_format: {
                        type: 'json_schema',
                        json_schema: {
                            name: 'revenue_agent_response',
                            strict: true,
                            schema: REVENUE_AGENT_JSON_SCHEMA,
                        },
                    },
                },
            );

            const content = response.choices[0]?.message?.content;

            if (!content) {
                throw new Error('OpenAI returned an empty response');
            }

            const parsed = JSON.parse(content);

            return RevenueAgentResponseSchema.parse(parsed);
        } catch (error) {
            console.error('OpenAI revenue analysis failed:', error);

            throw new InternalServerErrorException('OpenAI revenue analysis failed');
        }
    }
}