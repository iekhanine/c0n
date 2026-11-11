export const PERMISSION_GROUPS: { label: string; items: string[][] }[];
export const PERMISSIONS: string[];
export function presetPermissions(role: string): string[];
export function withViewPermissions(values: string[]): string[];
export function effectivePermissions(
  grant: string | { access?: string; owner?: boolean; permissions?: string[] },
): string[];
export function hasPermission(
  grant: string | { access?: string; owner?: boolean; permissions?: string[] },
  permission: string,
): boolean;
export function contentPrefix(kind: string): string;
export function channelLabel(value: string): string;
export function discordMessageTime(value: string | null): string | null;
