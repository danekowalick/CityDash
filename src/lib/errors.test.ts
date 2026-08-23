import { describe, expect, it } from "vitest";
import { describeError, isConnectionFailure } from "./errors";

describe("describeError", () => {
  it("uses a plain error message", () => {
    expect(describeError(new Error("relation does not exist"))).toBe(
      "relation does not exist",
    );
  });

  it("never returns an empty string for an error with an empty message", () => {
    // This is the real failure: Postgres unreachable throws AggregateError
    // with message "". An empty description is indistinguishable from "no
    // error" once it reaches a truthiness check in the UI.
    const aggregate = new AggregateError([], "");
    const described = describeError(aggregate);
    expect(described.length).toBeGreaterThan(0);
    expect(described).toContain("AggregateError");
  });

  it("unwraps the causes inside an AggregateError", () => {
    const inner = Object.assign(new Error("connect ECONNREFUSED ::1:55432"), {
      code: "ECONNREFUSED",
    });
    const described = describeError(new AggregateError([inner], ""));
    expect(described).toContain("ECONNREFUSED");
    expect(described).toContain("55432");
  });

  it("includes a code when the message omits it", () => {
    const error = Object.assign(new Error("connection failed"), { code: "ENOTFOUND" });
    expect(describeError(error)).toBe("connection failed: ENOTFOUND");
  });

  it("does not repeat the code when it is already the message", () => {
    const error = Object.assign(new Error("ECONNREFUSED"), { code: "ECONNREFUSED" });
    expect(describeError(error)).toBe("ECONNREFUSED");
  });

  it("handles non-error values", () => {
    expect(describeError("boom")).toBe("boom");
    expect(describeError(null).length).toBeGreaterThan(0);
    expect(describeError(undefined).length).toBeGreaterThan(0);
    expect(describeError(42)).toBe("42");
  });

  it("does not recurse without bound", () => {
    const looping: { name: string; message: string; errors: unknown[] } = {
      name: "Looping",
      message: "",
      errors: [],
    };
    looping.errors.push(looping);
    expect(() => describeError(looping)).not.toThrow();
  });
});

describe("isConnectionFailure", () => {
  it("recognises a refused connection", () => {
    const inner = Object.assign(new Error("connect ECONNREFUSED ::1:55432"), {
      code: "ECONNREFUSED",
    });
    expect(isConnectionFailure(new AggregateError([inner], ""))).toBe(true);
  });

  it("does not flag a SQL error as a connection failure", () => {
    expect(isConnectionFailure(new Error('relation "incidents" does not exist'))).toBe(false);
  });
});
