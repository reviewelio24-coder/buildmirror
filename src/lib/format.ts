export function shortSha(sha: string | null | undefined): string {
  if (!sha) {
    return "없음";
  }
  return sha.slice(0, 7);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "없음";
  }
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "없음";
  }
  return `${value}%`;
}
