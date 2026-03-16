/**
 * Minimal mock for react-native used by Vitest.
 * Only stubs the APIs actually imported by lib/ code.
 */
export const Platform = {
  OS: "web" as const,
  select: <T>(obj: { web?: T; default?: T }) => obj.web ?? obj.default,
};

export default { Platform };
