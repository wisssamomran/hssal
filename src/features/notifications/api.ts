/**
 * What the platform has to tell this person, and the read state of each item.
 *
 * Every path below is a route the server actually registers: `npm run check:api`
 * compares these modules against `php artisan route:list`, so a button here cannot
 * be wired to an endpoint that was never built. A call that must not run twice on a
 * retried click passes an `idempotencyKey`, and the transport that stamps it — the
 * token, the organization header, the envelope — is `src/core/api/http.ts`.
 */

import { qs, request } from '@/core/api/http';

export async function getNotifications(page?: number) {
  return request('/api/v1/notifications' + qs({ page }));
}

export async function getUnreadNotificationCount() {
  return request<{ count: number }>('/api/v1/notifications/unread-count');
}

export async function markNotificationRead(id: number) {
  return request(`/api/v1/notifications/${id}/read`, { method: 'POST' });
}

export async function markAllNotificationsRead() {
  return request('/api/v1/notifications/read-all', { method: 'POST' });
}
