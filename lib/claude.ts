import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

// The only module that imports @anthropic-ai/sdk. Every Claude call in the app
// goes through callClaude() or callClaudeStructured() so that the kill switch,
// prompt caching, retries and cost logging apply everywhere.

export const MODELS = {
  // Parsing and scoring.
  haiku: "claude-haiku-5-5",
  // Research and re-verification (with web search / web fetch).
  sonnet: "claude-sonnet-5-5",
} as const;

export type ClaudeModel = (typeof MODELS)[keyof typeof MODELS];

// ---------------------------------------------------------------------------
// Prices, USD per million tokens, from platform.claude.com/docs/en/about-claude/pricing
// (checked 2026-10-15). Update here if Anthropic changes them.
// ---------------------------------------------------------------------------

interface Rates {
  input: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  cacheRead: number;
  output: number;
}

interface ModelPricing {
  standard: Rates;
  // Haiku 5.5 charges more once a prompt exceeds 100,000 tokens.
  longContext?: { thresholdTokens: number; rates: Rates };
}

const PRICES: Record<ClaudeModel, ModelPricing> = {
  "claude-haiku-5-5": {
    standard: { input: 0.1, cacheWrite5m: 0.125, cacheWrite1h: 0.2, cacheRead: 0.01, output: 0.5 },
    longContext: {
      thresholdTokens: 100_000,
      rates: { input: 0.5, cacheWrite5m: 0.625, cacheWrite1h: 1, cacheRead: 0.05, output: 2.5 },
    },
  },
  "claude-sonnet-5-5": {
    standard: { input: 2, cacheWrite5m: 2.5, cacheWrite1h: 4, cacheRead: 0.1, output: 10 },
  },
};

// Web search is billed per search on top of tokens; web fetch has no extra charge.
const WEB_SEARCH_USD = 10 / 1000;

export interface UsageSummary {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  webSearches: number;
  costUsd: number;
}

export function summarizeUsage(model: ClaudeModel, usage: Anthropic.Usage): UsageSummary {
  const inputTokens = usage.input_tokens;
  const outputTokens = usage.output_tokens;
  const cacheReadTokens = usage.cache_read_input_tokens ?? 0;
  const cacheWriteTokens = usage.cache_creation_input_tokens ?? 0;
  const webSearches = usage.server_tool_use?.web_search_requests ?? 0;

  // Split cache writes by TTL when the API reports it; otherwise they are 5-minute writes.
  const write1h = usage.cache_creation?.ephemeral_1h_input_tokens ?? 0;
  const write5m = cacheWriteTokens - write1h;

  const pricing = PRICES[model];
  const promptTokens = inputTokens + cacheReadTokens + cacheWriteTokens;
  const rates =
    pricing.longContext && promptTokens > pricing.longContext.thresholdTokens
      ? pricing.longContext.rates
      : pricing.standard;

  const tokenCost =
    (inputTokens * rates.input +
      write5m * rates.cacheWrite5m +
      write1h * rates.cacheWrite1h +
      cacheReadTokens * rates.cacheRead +
      outputTokens * rates.output) /
    1_000_000;

  return {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    webSearches,
    costUsd: tokenCost + webSearches * WEB_SEARCH_USD,
  };
}

// ---------------------------------------------------------------------------
// Calling Claude
// ---------------------------------------------------------------------------

export class ClaudeDisabledError extends Error {
  constructor() {
    super("Claude API calls are disabled (CLAUDE_DISABLED=true). Unset it to resume.");
    this.name = "ClaudeDisabledError";
  }
}

export interface ClaudeCallOptions {
  // Short label for logs, e.g. "assess", "email-parse", "research-scan:state".
  purpose: string;
  organizationId: string;
  // The scan_runs row this call's tokens and cost are added to.
  scanRunId: string;
  model: ClaudeModel;
  system: string;
  messages: Anthropic.MessageParam[];
  tools?: Anthropic.ToolUnion[];
  maxTokens: number;
  // Cache the system block. Use it when the same system prompt is sent repeatedly.
  cache?: boolean;
}

export interface StructuredCallOptions<S extends z.ZodType> extends ClaudeCallOptions {
  // Zod schema the response must match (sent as a JSON schema).
  schema: S;
}

let client: Anthropic | undefined;

function getClient(): Anthropic {
  // maxRetries: 2 means up to 3 attempts. The SDK retries 429s, 5xx errors and
  // connection failures with exponential backoff.
  client ??= new Anthropic({ maxRetries: 2 });
  return client;
}

function assertEnabled() {
  // Read on every call, so flipping the env var stops calls on the next request.
  if (process.env.CLAUDE_DISABLED === "true") {
    throw new ClaudeDisabledError();
  }
}

function buildParams(opts: ClaudeCallOptions) {
  return {
    model: opts.model,
    max_tokens: opts.maxTokens,
    system: opts.cache
      ? [{ type: "text" as const, text: opts.system, cache_control: { type: "ephemeral" as const } }]
      : opts.system,
    messages: opts.messages,
    ...(opts.tools ? { tools: opts.tools } : {}),
  };
}

async function recordUsage(opts: ClaudeCallOptions, message: Anthropic.Message) {
  const usage = summarizeUsage(opts.model, message.usage);

  // Metadata only. Never log prompt or response bodies here: they can contain
  // customer email contents.
  console.info("claude call", {
    purpose: opts.purpose,
    organizationId: opts.organizationId,
    scanRunId: opts.scanRunId,
    model: opts.model,
    stopReason: message.stop_reason,
    ...usage,
  });

  const { data, error } = await createAdminClient().rpc("record_claude_usage", {
    p_scan_run_id: opts.scanRunId,
    p_tokens_in: usage.inputTokens,
    p_tokens_out: usage.outputTokens,
    p_cache_read_tokens: usage.cacheReadTokens,
    p_cache_write_tokens: usage.cacheWriteTokens,
    p_searches: usage.webSearches,
    p_cost_usd: usage.costUsd,
  });

  // The call has already been paid for, so a logging failure is reported but
  // not thrown: throwing would make Inngest retry and pay for the call twice.
  if (error || data !== true) {
    console.error("failed to record Claude usage in scan_runs", {
      purpose: opts.purpose,
      scanRunId: opts.scanRunId,
      error: error?.message ?? "scan_runs row not found",
      costUsd: usage.costUsd,
    });
  }

  return usage;
}

// Plain call: returns the full message (text, tool use, server tool results).
export async function callClaude(opts: ClaudeCallOptions) {
  assertEnabled();
  const message = await getClient().messages.create(buildParams(opts));
  const usage = await recordUsage(opts, message);
  return { message, usage };
}

// Structured call: the response is constrained to `schema` and returned parsed.
export async function callClaudeStructured<S extends z.ZodType>(opts: StructuredCallOptions<S>) {
  assertEnabled();
  const message = await getClient().messages.parse({
    ...buildParams(opts),
    output_config: { format: zodOutputFormat(opts.schema) },
  });
  const usage = await recordUsage(opts, message);

  if (message.parsed_output == null) {
    throw new Error(
      `Claude returned no parseable output for ${opts.purpose} (stop_reason: ${message.stop_reason}).`,
    );
  }
  return { message, usage, data: message.parsed_output as z.infer<S> };
}
