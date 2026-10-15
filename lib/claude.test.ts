import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const create = vi.fn();
const parse = vi.fn();
const rpc = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create, parse };
  },
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc }),
}));

const { callClaude, callClaudeStructured, ClaudeDisabledError, summarizeUsage } = await import(
  "@/lib/claude"
);

const baseOpts = {
  purpose: "test",
  organizationId: "org-1",
  scanRunId: "run-1",
  model: "claude-haiku-5-5" as const,
  system: "You are a test.",
  messages: [{ role: "user" as const, content: "hi" }],
  maxTokens: 1000,
};

function fakeMessage(usage: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return { stop_reason: "end_turn", content: [], usage: { input_tokens: 0, output_tokens: 0, ...usage }, ...extra };
}

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  rpc.mockResolvedValue({ data: true, error: null });
});

afterEach(() => {
  vi.restoreAllMocks();
  create.mockReset();
  parse.mockReset();
  rpc.mockReset();
  delete process.env.CLAUDE_DISABLED;
});

describe("summarizeUsage", () => {
  it("prices Haiku tokens at the standard rate", () => {
    const u = summarizeUsage("claude-haiku-5-5", {
      input_tokens: 2_000,
      output_tokens: 300,
      cache_read_input_tokens: 10_000,
      cache_creation_input_tokens: 0,
    } as never);
    // 2000*0.10 + 10000*0.01 + 300*0.50, per million
    expect(u.costUsd).toBeCloseTo((200 + 100 + 150) / 1_000_000, 12);
  });

  it("switches Haiku to long-context rates above 100,000 prompt tokens", () => {
    const u = summarizeUsage("claude-haiku-5-5", {
      input_tokens: 150_000,
      output_tokens: 1_000,
    } as never);
    expect(u.costUsd).toBeCloseTo((150_000 * 0.5 + 1_000 * 2.5) / 1_000_000, 12);
  });

  it("adds web searches and splits cache writes by TTL for Sonnet", () => {
    const u = summarizeUsage("claude-sonnet-5-5", {
      input_tokens: 1_000_000,
      output_tokens: 100_000,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 300_000,
      cache_creation: { ephemeral_5m_input_tokens: 200_000, ephemeral_1h_input_tokens: 100_000 },
      server_tool_use: { web_search_requests: 40, web_fetch_requests: 12 },
    } as never);
    // input $2 + 5m writes $0.50 + 1h writes $0.40 + output $1 + 40 searches $0.40
    expect(u.costUsd).toBeCloseTo(4.3, 10);
    expect(u.webSearches).toBe(40);
    expect(u.cacheWriteTokens).toBe(300_000);
  });
});

describe("callClaude", () => {
  it("refuses to run when CLAUDE_DISABLED=true", async () => {
    process.env.CLAUDE_DISABLED = "true";
    await expect(callClaude(baseOpts)).rejects.toBeInstanceOf(ClaudeDisabledError);
    expect(create).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("caches the system block only when asked", async () => {
    create.mockResolvedValue(fakeMessage({}));

    await callClaude(baseOpts);
    expect(create.mock.calls[0][0].system).toBe("You are a test.");

    await callClaude({ ...baseOpts, cache: true });
    expect(create.mock.calls[1][0].system).toEqual([
      { type: "text", text: "You are a test.", cache_control: { type: "ephemeral" } },
    ]);
  });

  it("records tokens, searches and cost on the scan run", async () => {
    create.mockResolvedValue(
      fakeMessage({
        input_tokens: 2_000,
        output_tokens: 300,
        cache_read_input_tokens: 500,
        cache_creation_input_tokens: 100,
        server_tool_use: { web_search_requests: 3, web_fetch_requests: 0 },
      }),
    );

    await callClaude(baseOpts);

    expect(rpc).toHaveBeenCalledWith("record_claude_usage", {
      p_scan_run_id: "run-1",
      p_tokens_in: 2_000,
      p_tokens_out: 300,
      p_cache_read_tokens: 500,
      p_cache_write_tokens: 100,
      p_searches: 3,
      p_cost_usd: expect.any(Number),
    });
  });

  it("does not throw when recording usage fails, so the paid call is not retried", async () => {
    create.mockResolvedValue(fakeMessage({}));
    rpc.mockResolvedValue({ data: null, error: { message: "db down" } });

    await expect(callClaude(baseOpts)).resolves.toBeDefined();
    expect(console.error).toHaveBeenCalled();
  });
});

describe("callClaudeStructured", () => {
  const schema = z.object({ relevance: z.number() });

  it("returns parsed output", async () => {
    parse.mockResolvedValue(fakeMessage({}, { parsed_output: { relevance: 72 } }));

    const { data } = await callClaudeStructured({ ...baseOpts, schema });

    expect(data).toEqual({ relevance: 72 });
    expect(parse.mock.calls[0][0].output_config.format).toBeDefined();
  });

  it("throws when the response could not be parsed", async () => {
    parse.mockResolvedValue(fakeMessage({}, { parsed_output: null, stop_reason: "max_tokens" }));

    await expect(callClaudeStructured({ ...baseOpts, schema })).rejects.toThrow(/max_tokens/);
    expect(rpc).toHaveBeenCalled();
  });
});
