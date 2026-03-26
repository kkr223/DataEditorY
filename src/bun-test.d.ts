declare module 'bun:test' {
  export function describe(name: string, fn: () => void | Promise<void>): void;
  export function test(name: string, fn: () => void | Promise<void>): void;
  export function expect<T = unknown>(value: T): {
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toContain(expected: unknown): void;
    toHaveLength(expected: number): void;
    toBeInstanceOf(expected: new (...args: any[]) => unknown): void;
    toBeNull(): void;
    toThrow(expected?: unknown): void;
    not: {
      toBe(expected: unknown): void;
    };
  };
}
