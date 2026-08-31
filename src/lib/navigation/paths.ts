export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_PATH_LENGTH = 512;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function decodeRepeated(value: string): string | null {
  let current = value;
  for (let index = 0; index < 3; index += 1) {
    try {
      const decoded = decodeURIComponent(current.replace(/\+/g, " "));
      if (decoded === current) {
        return current;
      }
      current = decoded;
    } catch {
      return null;
    }
  }
  return current;
}

function hasUnsafeCharacters(value: string): boolean {
  return /[\0\r\n\t\\]/.test(value) || value.includes("://") || value.includes("@");
}

export function sanitizeInternalPath(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_PATH_LENGTH) {
    return null;
  }
  if (hasUnsafeCharacters(raw) || raw.includes("\\")) {
    return null;
  }

  const decoded = decodeRepeated(raw.trim());
  if (!decoded || hasUnsafeCharacters(decoded) || decoded.includes("\\")) {
    return null;
  }
  if (!decoded.startsWith("/") || decoded.startsWith("//")) {
    return null;
  }

  const withoutHash = decoded.split("#")[0] ?? decoded;
  const questionIndex = withoutHash.indexOf("?");
  const pathname =
    questionIndex >= 0 ? withoutHash.slice(0, questionIndex) : withoutHash;
  const search =
    questionIndex >= 0 ? withoutHash.slice(questionIndex + 1) : "";

  if (!pathname.startsWith("/") || pathname.startsWith("//")) {
    return null;
  }
  if (pathname.includes("//") || pathname.includes("\\")) {
    return null;
  }

  const normalizedPath =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname;

  if (!search) {
    return normalizedPath;
  }

  const params = new URLSearchParams(search);
  const snapshot = params.get("snapshot");
  if (snapshot && isUuid(snapshot) && [...params.keys()].every((key) => key === "snapshot")) {
    return `${normalizedPath}?snapshot=${snapshot}`;
  }
  return normalizedPath;
}

export function parseProjectIdFromPath(path: string): string | null {
  const pathname = path.split("?")[0] ?? path;
  const match = /^\/projects\/([0-9a-f-]{36})(?:\/settings)?$/i.exec(pathname);
  if (!match?.[1] || !isUuid(match[1])) {
    return null;
  }
  return match[1];
}

export function isProjectRoute(path: string, projectId: string): boolean {
  if (!isUuid(projectId)) {
    return false;
  }
  const sanitized = sanitizeInternalPath(path);
  if (!sanitized) {
    return false;
  }
  return parseProjectIdFromPath(sanitized) === projectId;
}

export function isAllowedPostLoginPath(path: string): boolean {
  const sanitized = sanitizeInternalPath(path);
  if (!sanitized) {
    return false;
  }
  const pathname = sanitized.split("?")[0] ?? sanitized;
  if (pathname === "/" || pathname === "/projects") {
    return true;
  }
  return parseProjectIdFromPath(sanitized) !== null;
}

export function projectHomePath(projectId: string): string {
  return `/projects/${projectId}`;
}

export function sanitizeNextPath(raw: unknown, fallback = "/projects"): string {
  const sanitized = sanitizeInternalPath(raw);
  if (!sanitized || !isAllowedPostLoginPath(sanitized)) {
    return fallback;
  }
  return sanitized;
}

export function sanitizeFilters(
  filters: Record<string, string>,
): Record<string, string> {
  const snapshot = filters.snapshot;
  if (snapshot && isUuid(snapshot)) {
    return { snapshot };
  }
  return {};
}

export function resolveOwnedSnapshotId(
  projectId: string,
  snapshotId: string | null | undefined,
  ownedSnapshotIds: Iterable<string>,
): string | null {
  if (!isUuid(projectId) || !snapshotId || !isUuid(snapshotId)) {
    return null;
  }
  for (const id of ownedSnapshotIds) {
    if (id === snapshotId) {
      return snapshotId;
    }
  }
  return null;
}

export function buildProjectRedirect(
  projectId: string,
  route: string | null | undefined,
  snapshotId: string | null | undefined,
): string {
  const home = projectHomePath(projectId);
  if (!route || !isProjectRoute(route, projectId)) {
    return home;
  }
  const sanitized = sanitizeInternalPath(route);
  if (!sanitized) {
    return home;
  }
  const pathname = sanitized.split("?")[0] ?? sanitized;
  if (pathname === home && snapshotId && isUuid(snapshotId)) {
    return `${home}?snapshot=${snapshotId}`;
  }
  return pathname;
}
