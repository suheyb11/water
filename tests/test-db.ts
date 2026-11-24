// Never run the tests (they empty the tables) against the real data: the test database must be a separate
// Postgres database named waterportal_test, or a separate schema named test (?schema=test).
export function isTestDbUrl(url: string | undefined): url is string {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.pathname.replace(/^\//, "").toLowerCase() === "waterportal_test" || u.searchParams.get("schema") === "test";
  } catch {
    return false;
  }
}
