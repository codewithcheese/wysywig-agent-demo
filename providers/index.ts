import type { LLMProvider } from '../engine/types.js';
import { createOpenAIProvider, type OpenAIConfig } from './openai/index.js';
import { createAnthropicProvider, type AnthropicConfig } from './anthropic/index.js';

export { OpenAIProvider, createOpenAIProvider, type OpenAIConfig } from './openai/index.js';
export { AnthropicProvider, createAnthropicProvider, type AnthropicConfig } from './anthropic/index.js';
export * from './common/index.js';

export type ProviderName = 'openai' | 'anthropic';

export interface ProviderConfig {
  name: ProviderName;
  model?: string;
  apiKey?: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Creates an LLM provider based on configuration
 */
export function createProvider(config: ProviderConfig): LLMProvider {
  switch (config.name) {
    case 'openai':
      return createOpenAIProvider({
        apiKey: config.apiKey,
        model: config.model,
        maxTokens: config.maxTokens,
        temperature: config.temperature,
      } as OpenAIConfig);

    case 'anthropic':
      return createAnthropicProvider({
        apiKey: config.apiKey,
        model: config.model,
        maxTokens: config.maxTokens,
        temperature: config.temperature,
      } as AnthropicConfig);

    default:
      throw new Error(`Unknown provider: ${config.name}`);
  }
}

/**
 * Gets the default provider from environment variables
 */
export function getDefaultProvider(): LLMProvider {
  const providerName = (process.env.LLM_PROVIDER || 'openai') as ProviderName;
  const model = process.env.LLM_MODEL;

  return createProvider({ name: providerName, model });
}
