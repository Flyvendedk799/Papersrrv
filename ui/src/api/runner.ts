import { api } from "./client";

export const runnerApi = {
  status: () => api.get<{ paused: boolean }>("/runner/status"),
  setPaused: (paused: boolean) => api.post<{ paused: boolean }>("/runner/pause", { paused }),
};
