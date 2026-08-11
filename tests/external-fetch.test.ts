import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

const { lookupMock, requestMock } = vi.hoisted(() => ({
  lookupMock: vi.fn(),
  requestMock: vi.fn(),
}));

vi.mock("node:dns/promises", () => ({ lookup: lookupMock }));
vi.mock("node:https", () => ({ request: requestMock }));

import { fetchExternalUrl } from "@/lib/external-url";

describe("external HTTPS fetch", () => {
  it("connects with the public address verified during DNS validation", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    let lookupResult: { address?: string; family?: number } = {};
    requestMock.mockImplementation(
      (
        _: URL,
        options: {
          lookup: (
            hostname: string,
            lookupOptions: object,
            callback: (error: Error | null, address: string, family: number) => void,
          ) => void;
        },
        callback: (response: EventEmitter) => void,
      ) => {
        const request = Object.assign(new EventEmitter(), {
          end: () => {
            options.lookup("public.example", {}, (error, address, family) => {
              if (error) throw error;
              lookupResult = { address, family };
            });
            const response = Object.assign(new EventEmitter(), {
              headers: {},
              statusCode: 200,
              statusMessage: "OK",
            });
            callback(response);
            response.emit("end");
          },
          write: vi.fn(),
        });
        return request;
      },
    );

    const response = await fetchExternalUrl(
      "https://public.example/webhook",
      "WEBHOOK",
      undefined,
      { method: "POST", body: "{}" },
    );

    expect(response.status).toBe(200);
    expect(lookupResult).toEqual({ address: "93.184.216.34", family: 4 });
  });
});
