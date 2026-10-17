import { jsonRequest } from "~/platform/json-request";

/** RF-37 notice for the session user (or their role). */
export type Notice = {
  id: string;
  kind: string;
  title: string;
  body: string;
  project_id: string | null;
  milestone_id: string | null;
  created_at: string;
  read_at: string | null;
};

export const notifications = {
  list: () => jsonRequest<Notice[]>("/notifications"),
  markRead: (id: string) => jsonRequest<Notice>(`/notifications/${encodeURIComponent(id)}/read`, { method: "POST", body: {} }),
};
