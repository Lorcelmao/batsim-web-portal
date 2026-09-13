import axios, { AxiosResponse } from "axios";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

// Common list params (sort + pagination) — shared across all entity list endpoints.
// Backend reads X-Total-Count header for pagination; whitelist enforced server-side.
export interface ListParams {
  skip?: number;
  limit?: number;
  sort_by?: string;
  order?: "asc" | "desc";
  /** Experiments list only: filter by source scenario (scenario drawer) */
  scenario_id?: number;
}

// Types
export interface User {
  id: number;
  username: string;
  email: string;
  role: "admin" | "user";
  is_active: string;
  created_at: string;
  updated_at?: string;
}

export interface Workload {
  id: number;
  name: string;
  description?: string;
  file_path: string;
  file_size?: number;
  file_type?: string;
  created_by?: number;
  created_at: string;
  updated_at?: string;
  creator_username?: string;
  nb_res?: number;
  jobs?: string; // JSON string
  profiles?: string; // JSON string
  version?: number;
}

export interface Platform {
  id: number;
  name: string;
  description?: string;
  file_path: string;
  file_size?: number;
  file_type?: string;
  created_by?: number;
  created_at: string;
  updated_at?: string;
  creator_username?: string;
  nb_hosts?: number;
  nb_clusters?: number;
  platform_config?: string; // XML string
  version?: number;
}

export interface ScenarioWorkloadBrief {
  id: number;
  name: string;
  version: number;
  nb_res?: number;
  file_size?: number;
}

export interface ScenarioPlatformBrief {
  id: number;
  name: string;
  version: number;
  nb_hosts?: number;
  nb_clusters?: number;
}

export interface Scenario {
  id: number;
  name: string;
  description?: string;
  workload_id: number;
  platform_id: number;
  created_by?: number;
  created_at: string;
  updated_at?: string;
  workload_name?: string;
  workload_version?: number;
  platform_name?: string;
  platform_version?: number;
  // Nested cheap-column briefs for composition rows (scenarios page)
  workload?: ScenarioWorkloadBrief;
  platform?: ScenarioPlatformBrief;
  creator_username?: string;
}

export interface Strategy {
  id: number;
  name: string;
  description?: string;
  file_path: string;
  file_size?: number;
  file_type: string;
  created_by?: number;
  created_at: string;
  updated_at?: string;
  creator_username?: string;
  nb_files?: number;
  main_entry?: string;
  version?: number;
  strategy_files?: string; // JSON string
}

export interface Experiment {
  id: number;
  name: string;
  description?: string;
  scenario_id: number;
  strategy_id: number;
  status:
    | "pending"
    | "queued"
    | "running"
    | "paused"
    | "completed"
    | "failed"
    | "cancelled";
  batsim_container_id?: string;
  pybatsim_container_id?: string;
  start_time?: string;
  end_time?: string;
  estimated_duration?: number;
  total_jobs?: number;
  completed_jobs: number;
  progress_percentage: number;
  config?: string;
  frozen_config?: string;
  seed?: number;
  params?: string;
  simulation_dir?: string;
  batsim_logs?: string;
  pybatsim_logs?: string;
  error_message?: string;
  container_network?: string;
  created_by?: number;
  live_jobs_submitted?: number;
  live_jobs_completed?: number;
  live_jobs_running?: number;
  live_jobs_failed?: number;
  last_sim_time?: number;
  created_at: string;
  updated_at?: string;
  scenario_name?: string;
  strategy_name?: string;
  creator_username?: string;
}

export interface Result {
  id: number;
  experiment_id: number;
  simulation_time?: number;
  total_jobs?: number;
  completed_jobs?: number;
  failed_jobs: number;
  makespan?: number;
  average_waiting_time?: number;
  average_turnaround_time?: number;
  resource_utilization?: number;
  config?: string;
  metrics?: string;
  logs?: string;
  result_file_path?: string;
  log_file_path?: string;
  created_at: string;
  experiment_name?: string;
  scenario_name?: string;
  strategy_name?: string;
  jobs_data?: string; // CSV string
  schedule_data?: string; // CSV string
  computed_metrics?: string; // JSON string
}

// Workload summary — aggregate stats without shipping the full jobs blob.
// Backed by GET /workloads/{id}/summary.
export interface WorkloadSummary {
  workload_id: number;
  name: string;
  nb_res?: number;
  n_jobs: number;
  n_profiles: number;
  min_walltime?: number | null;
  max_walltime?: number | null;
  mean_walltime?: number | null;
  total_walltime?: number | null;
  min_res?: number | null;
  max_res?: number | null;
  earliest_subtime?: number | null;
  latest_subtime?: number | null;
}

// Paginated jobs slice for virtualized preview (GET /workloads/{id}/jobs?offset=&limit=).
export interface WorkloadJobsPage {
  workload_id: number;
  offset: number;
  limit: number;
  total: number;
  jobs: Array<Record<string, unknown>>;
}

// Replay timeline payload (GET /results/{id}/timeline). Series are shared time axis (jobs/util/queue).
export interface TimelineJob {
  job_id: string;
  submission_time: number;
  starting_time?: number | null;
  finish_time?: number | null;
  waiting_time?: number | null;
  execution_time?: number | null;
  turnaround_time?: number | null;
  slowdown?: number | null;
  requested_resources: number;
  allocated_resources: number[];
  success: boolean;
  final_state?: string | null;
}

export interface TimelineSeriesPoint {
  t: number;
  value: number;
}

export interface TimelineResponse {
  result_id: number;
  total_jobs: number;
  n_hosts: number;
  makespan: number;
  truncated: boolean;
  jobs: TimelineJob[];
  utilization_series: TimelineSeriesPoint[];
  queue_series: TimelineSeriesPoint[];
  // Stacked-area layers (waiting = queue_series, running, cumulative completed)
  running_series?: TimelineSeriesPoint[];
  completed_series?: TimelineSeriesPoint[];
  waiting_cdf: TimelineSeriesPoint[];
}

// Host x Time busy-fraction grid (server-aggregated over ALL jobs)
export interface HeatmapResponse {
  result_id: number;
  n_hosts: number;
  buckets: number;
  t0: number;
  t1: number;
  rows: number[][]; // rows[host][bucket] = busy fraction 0..1
}

// PyBatSim runtime manifest (GET /system/runtime). 503 detail uses RuntimeManifestError shape.
export interface RuntimeLib {
  name: string;
  version: string;
}

export interface RuntimeInfo {
  image: string;
  base_image: string;
  python_version: string;
  pybatsim_version: string;
  available_libs: RuntimeLib[];
  policy?: string;
}

export interface RuntimeManifestError {
  error: "runtime_manifest_unavailable";
  message: string;
  configured_path: string;
  tried_paths: string[];
  cause?: string | null;
  hint?: string;
}

// Validation types returned by backend on 422
export interface ValidationError {
  field: string;
  error: string;
  suggestion: string;
}

export interface ValidationWarning {
  field: string;
  message: string;
}

export interface ValidationResponse {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface RegisterData {
  username: string;
  email: string;
  password: string;
  role?: "admin" | "user";
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Read token from the persisted Zustand blob without importing the store
// (avoids a circular import: api.ts <-> authStore.ts).
function readPersistedToken(): string | null {
  try {
    const raw = localStorage.getItem("auth-storage");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.state?.token ?? null;
  } catch {
    return null;
  }
}

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = readPersistedToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      error.response?.status === 401 &&
      !error.config?.url?.includes("/auth/")
    ) {
      // Already on /login? Don't loop — just propagate the error.
      if (window.location.pathname.startsWith("/login")) {
        return Promise.reject(error);
      }
      // Clear EVERY auth-state key (raw legacy + zustand persist blob)
      // so the next page load doesn't see stale isAuthenticated: true.
      try {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        localStorage.removeItem("auth-storage");
      } catch {
        // ignore
      }
      // Flag so LoginPage can show "Session expired" once.
      try {
        sessionStorage.setItem("session_expired", "1");
      } catch {
        // ignore
      }
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  login: (
    credentials: LoginCredentials
  ): Promise<AxiosResponse<TokenResponse>> => {
    // Use JSON endpoint for easier frontend integration
    return api.post("/auth/login-json", credentials);
  },
  register: (userData: RegisterData): Promise<AxiosResponse<User>> =>
    api.post("/auth/register", userData),
  getMe: (): Promise<AxiosResponse<User>> => api.get("/auth/me"),
};

// Workloads API
export const workloadsAPI = {
  getAll: (params?: ListParams): Promise<AxiosResponse<Workload[]>> => api.get("/workloads/", { params }),
  getById: (id: number): Promise<AxiosResponse<Workload>> =>
    api.get(`/workloads/${id}`),
  // Aggregate stats — call instead of parsing workload.jobs JSON on the client
  getSummary: (id: number): Promise<AxiosResponse<WorkloadSummary>> =>
    api.get(`/workloads/${id}/summary`),
  // Paginated jobs slice — pair with VirtualJobList for >50-job previews
  getJobs: (
    id: number,
    offset: number = 0,
    limit: number = 50,
  ): Promise<AxiosResponse<WorkloadJobsPage>> =>
    api.get(`/workloads/${id}/jobs`, { params: { offset, limit } }),
  create: (formData: FormData): Promise<AxiosResponse<Workload>> =>
    api.post("/workloads/", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  update: (
    id: number,
    data: Partial<Workload>
  ): Promise<AxiosResponse<Workload>> => api.put(`/workloads/${id}`, data),
  delete: (id: number): Promise<AxiosResponse<{ message: string }>> =>
    api.delete(`/workloads/${id}`),
  // Blob: the endpoint streams the file, and the auth header must ride along,
  // so this cannot be a plain link.
  download: (id: number): Promise<AxiosResponse<Blob>> =>
    api.get(`/workloads/${id}/download`, { responseType: "blob" }),
};

// Platforms API
export const platformsAPI = {
  getAll: (params?: ListParams): Promise<AxiosResponse<Platform[]>> => api.get("/platforms/", { params }),
  getById: (id: number): Promise<AxiosResponse<Platform>> =>
    api.get(`/platforms/${id}`),
  create: (formData: FormData): Promise<AxiosResponse<Platform>> =>
    api.post("/platforms/", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  update: (
    id: number,
    data: Partial<Platform>
  ): Promise<AxiosResponse<Platform>> => api.put(`/platforms/${id}`, data),
  updateFile: (
    id: number,
    formData: FormData
  ): Promise<AxiosResponse<Platform>> =>
    api.put(`/platforms/${id}/file`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  delete: (id: number): Promise<AxiosResponse<{ message: string }>> =>
    api.delete(`/platforms/${id}`),
  // Blob: the endpoint streams the file, and the auth header must ride along,
  // so this cannot be a plain link.
  download: (id: number): Promise<AxiosResponse<Blob>> =>
    api.get(`/platforms/${id}/download`, { responseType: "blob" }),
};

// Scenarios API
export const scenariosAPI = {
  getAll: (params?: ListParams): Promise<AxiosResponse<Scenario[]>> => api.get("/scenarios/", { params }),
  getById: (id: number): Promise<AxiosResponse<Scenario>> =>
    api.get(`/scenarios/${id}`),
  create: (
    data: Omit<Scenario, "id" | "created_at" | "updated_at">
  ): Promise<AxiosResponse<Scenario>> => api.post("/scenarios/", data),
  update: (
    id: number,
    data: Partial<Scenario>
  ): Promise<AxiosResponse<Scenario>> => api.put(`/scenarios/${id}`, data),
  delete: (id: number): Promise<AxiosResponse<{ message: string }>> =>
    api.delete(`/scenarios/${id}`),
};

// Strategies API
export const strategiesAPI = {
  getAll: (params?: ListParams): Promise<AxiosResponse<Strategy[]>> => api.get("/strategies/", { params }),
  getById: (id: number): Promise<AxiosResponse<Strategy>> =>
    api.get(`/strategies/${id}`),
  create: (formData: FormData): Promise<AxiosResponse<Strategy>> =>
    api.post("/strategies/", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  update: (
    id: number,
    data: Partial<Strategy>
  ): Promise<AxiosResponse<Strategy>> => api.put(`/strategies/${id}`, data),
  updateFile: (
    id: number,
    formData: FormData
  ): Promise<AxiosResponse<Strategy>> =>
    api.put(`/strategies/${id}/file`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  delete: (id: number): Promise<AxiosResponse<{ message: string }>> =>
    api.delete(`/strategies/${id}`),
  // Blob: the endpoint streams the file, and the auth header must ride along,
  // so this cannot be a plain link.
  download: (id: number): Promise<AxiosResponse<Blob>> =>
    api.get(`/strategies/${id}/download`, { responseType: "blob" }),
  getContent: (
    id: number
  ): Promise<
    AxiosResponse<{
      filename: string;
      content: string;
      language: string;
      size: number;
      truncated: boolean;
    }>
  > => api.get(`/strategies/${id}/content`),
};

// Experiments API
export const experimentsAPI = {
  getAll: (params?: ListParams): Promise<AxiosResponse<Experiment[]>> =>
    api.get("/experiments/", { params }),
  getById: (id: number): Promise<AxiosResponse<Experiment>> =>
    api.get(`/experiments/${id}`),
  create: (data: {
    name: string;
    description?: string;
    scenario_id: number;
    strategy_id: number;
    config?: any;
    seed?: number;
    params?: Record<string, any>;
  }): Promise<AxiosResponse<Experiment>> => api.post("/experiments/", data),
  getQueue: (): Promise<AxiosResponse<{
    running: number;
    queued: number;
    max_concurrent: number;
    available_slots: number;
  }>> => api.get("/experiments/queue/"),
  update: (
    id: number,
    data: Partial<Experiment>
  ): Promise<AxiosResponse<Experiment>> => api.put(`/experiments/${id}`, data),
  delete: (id: number): Promise<AxiosResponse<{ message: string }>> =>
    api.delete(`/experiments/${id}`),
  start: (id: number): Promise<AxiosResponse<{ message: string }>> =>
    api.post(`/experiments/${id}/start`),
  stop: (id: number): Promise<AxiosResponse<{ message: string }>> =>
    api.post(`/experiments/${id}/stop`),
  // Rerun: clones the FROZEN inputs of a finished experiment into a new
  // experiment and auto-starts it (one-click reproducibility).
  rerun: (id: number): Promise<AxiosResponse<Experiment>> =>
    api.post(`/experiments/${id}/rerun`),
  getStatus: (
    id: number
  ): Promise<
    AxiosResponse<{
      status: string;
      progress_percentage: number;
      completed_jobs: number;
      total_jobs: number;
      start_time: string;
      end_time: string;
      error_message?: string;
    }>
  > => api.get(`/experiments/${id}/status`),
  getLogs: (
    id: number
  ): Promise<
    AxiosResponse<{
      batsim_logs: string;
      pybatsim_logs: string;
      live: boolean;
    }>
  > => api.get(`/experiments/${id}/logs`),
  getLogStreams: (
    id: number
  ): Promise<
    AxiosResponse<{
      batsim_stdout: { content: string; truncated: boolean; size_bytes: number };
      batsim_stderr: { content: string; truncated: boolean; size_bytes: number };
      pybatsim_stdout: { content: string; truncated: boolean; size_bytes: number };
      pybatsim_stderr: { content: string; truncated: boolean; size_bytes: number };
      live: boolean;
    }>
  > => api.get(`/experiments/${id}/logs/streams`),
  // Blob rather than a URL: the endpoint requires auth, and a plain <a href>
  // sends no Authorization header, so a link download returns 401.
  downloadLogStream: (id: number, stream: string): Promise<AxiosResponse<Blob>> =>
    api.get(`/experiments/${id}/logs/streams/${stream}/download`, {
      responseType: "blob",
    }),
  getProgress: (
    id: number,
    history: boolean = false,
  ): Promise<AxiosResponse<{
    live_jobs_submitted: number;
    live_jobs_completed: number;
    live_jobs_running: number;
    live_jobs_failed: number;
    last_sim_time: number;
    progress_percentage: number;
    total_jobs: number | null;
    completed_jobs: number | null;
    wall_seconds: number;
    live: boolean;
    history?: Array<[number, number]>;
  }>> => api.get(`/experiments/${id}/progress`, { params: history ? { history: 1 } : {} }),
};

// Results API
export const resultsAPI = {
  getAll: (params?: ListParams): Promise<AxiosResponse<Result[]>> => api.get("/results/", { params }),
  getById: (id: number): Promise<AxiosResponse<Result>> =>
    api.get(`/results/${id}`),
  getByExperiment: (experimentId: number): Promise<AxiosResponse<Result[]>> =>
    api.get(`/results/experiment/${experimentId}`),
  getAnalytics: (params?: {
    start_date?: string;
    end_date?: string;
  }): Promise<AxiosResponse<any>> => api.get("/results/analytics", { params }),
  delete: (id: number): Promise<AxiosResponse<{ message: string }>> =>
    api.delete(`/results/${id}`),
  compare: (ids: number[]): Promise<AxiosResponse<{ experiments: any[] }>> =>
    api.get(`/results/compare/metrics?ids=${ids.join(",")}`),
  exportResult: (id: number, format: "json" | "csv" = "json") =>
    api.get(`/results/${id}/export?format=${format}`, { responseType: "blob" }),
  // Replay tab data — Gantt jobs + utilization/queue/CDF series. `limit` triggers density mode.
  getTimeline: (
    id: number,
    limit?: number,
  ): Promise<AxiosResponse<TimelineResponse>> =>
    api.get(`/results/${id}/timeline`, { params: limit ? { limit } : {} }),
  // Host x Time heatmap grid for the Replay panel
  getHeatmap: (
    id: number,
    buckets: number = 240,
  ): Promise<AxiosResponse<HeatmapResponse>> =>
    api.get(`/results/${id}/heatmap`, { params: { buckets } }),
};

// Templates API
export const templatesAPI = {
  download: (type: "workload" | "platform" | "strategy"): string =>
    `${API_BASE_URL}/templates/${type}`,
  // Raw template text for in-app preview (keep response as plain string)
  getContent: (
    type: "workload" | "platform" | "strategy"
  ): Promise<AxiosResponse<string>> =>
    api.get(`/templates/${type}`, {
      responseType: "text",
      transformResponse: [(data) => data],
    }),
};

// Helper to extract validation errors from axios error
export function extractValidationErrors(
  err: any
): ValidationResponse | null {
  const detail = err?.response?.data?.detail;
  if (detail && typeof detail === "object" && "errors" in detail) {
    return detail as ValidationResponse;
  }
  return null;
}

// System API
export const systemAPI = {
  getStatus: (): Promise<AxiosResponse<{ message: string }>> =>
    api.get("/system"),
  getResources: (): Promise<
    AxiosResponse<{ cpu: number; memory: number; disk: number }>
  > => api.get("/system/resources"),
  getConfig: (): Promise<
    AxiosResponse<{
      grafana_url: string;
      max_concurrent_simulations: number;
      simulation_timeout_seconds: number;
    }>
  > => api.get("/system/config"),
  // PyBatSim image manifest (libs + Python version). Returns 503 if image not built yet.
  getRuntime: (): Promise<AxiosResponse<RuntimeInfo>> =>
    api.get("/system/runtime"),
};

export default api;
