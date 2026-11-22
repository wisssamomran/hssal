/*


*
 * What the platform tells a person, and the row that keeps the telling.
 *
 * These mirror what the endpoints actually return: statuses keep the server's uppercase
 * vocabulary, amounts arrive as decimal strings from MySQL, and any field the
 * platform only knows after a human entered it is nullable. When a component and
 * a type here disagree, the component is wrong.
 */

export interface AppNotification {
  id: number;
  title?: string | null;
  body?: string | null;
  data?: Record<string, unknown> | null;
  read_at?: string | null;
  created_at: string;
}
