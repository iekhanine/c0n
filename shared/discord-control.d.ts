export const CONTROL_OPERATIONS: string[];
export function destructive(op: string): boolean;
export function readOperation(op: string): boolean;
export function controlInput(
  op: string,
  input?: Record<string, unknown>,
): Record<string, unknown>;
export function smallCaps(value: string): string;
