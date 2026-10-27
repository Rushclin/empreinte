import { describe, expect, it } from "vitest";
import { resultsToCsv } from "../lib/export";
import { readServerSentEvents } from "../lib/sse";

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

describe("readServerSentEvents", () => {
  it("parses events split across chunks and skips comments", async () => {
    const events = [];
    for await (const event of readServerSentEvents(
      streamOf(["event: start\nda", 'ta: {"total":2}\n\n: ping\n\nevent: result\n', "data: 1\n\n"]),
    )) {
      events.push(event);
    }
    expect(events).toEqual([
      { event: "start", data: '{"total":2}' },
      { event: "result", data: "1" },
    ]);
  });
});

describe("resultsToCsv", () => {
  it("writes a header and escapes values", () => {
    const csv = resultsToCsv([
      {
        site: "A",
        url: "https://a.test/x",
        urlMain: "https://a.test/",
        username: "x",
        status: "unknown",
        tags: [],
        context: "a, b",
      },
    ]);
    expect(csv).toBe(
      'username,site,url,status,http_status,response_time_ms,context\nx,A,https://a.test/x,unknown,,,"a, b"\n',
    );
  });
});
