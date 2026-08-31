import { formatDateTime } from "@/lib/format";
import type { Notification } from "@/lib/types/domain";

export function NotificationList({
  notifications,
}: {
  notifications: Notification[];
}) {
  return (
    <section>
      <h2 className="text-base font-semibold">최근 알림</h2>
      {notifications.length === 0 ? (
        <p className="mt-2 text-sm text-muted">이 프로젝트의 알림이 없습니다.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {notifications.map((item) => (
            <li
              key={item.id}
              className="rounded-lg border border-border bg-surface px-3 py-3"
            >
              <p className="text-sm font-medium">{item.title}</p>
              <p className="mt-1 text-sm text-muted">{item.body}</p>
              <p className="mt-2 text-xs text-muted">
                {formatDateTime(item.createdAt)} · {item.status}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
