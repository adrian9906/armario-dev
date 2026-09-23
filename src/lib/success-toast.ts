export function withSuccessToast(path: string, message: string) {
  const url = new URL(path, "http://armario.local");
  url.searchParams.set("toast", message);
  return `${url.pathname}${url.search}${url.hash}`;
}
