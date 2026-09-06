import { z } from 'zod';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIProviderConfig {
  name?: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  structuredOutput?: boolean;
  disableReasoning?: boolean;
  providerOptions?: Record<string, unknown>;
}

export interface AICompletionOptions {
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  responseFormatJson?: boolean;
  disableReasoning?: boolean;
}

export interface AIProvider {
  chat(messages: ChatMessage[], options?: AICompletionOptions): Promise<string>;
  generateStructured<T>(
    prompt: string,
    schema: z.ZodType<T>,
    options?: AICompletionOptions
  ): Promise<T>;
  testConnection(): Promise<{ success: boolean; message: string; model?: string }>;
}
