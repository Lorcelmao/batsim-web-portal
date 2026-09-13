import React, { useEffect, useState } from "react";
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Skeleton,
  Button,
  Stack,
  Chip,
  Drawer,
  IconButton,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Snackbar,
  Alert,
  Collapse,
  Divider,
  Tooltip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from "@mui/material";
import {
  Edit,
  Delete,
  Close,
  UploadFile,
  Download,
  ExpandMore,
  Description,
  Code as CodeIcon,
} from "@mui/icons-material";
import { Storage } from "@mui/icons-material";
import {
  workloadsAPI,
  templatesAPI,
  extractValidationErrors,
  Workload,
  ValidationResponse,
  WorkloadSummary,
} from "../services/api";
import { downloadBlob, filenameFromContentDisposition } from "../utils/download-file";
import ValidationErrorPanel from "../components/ValidationErrorPanel";
import FileDropzone from "../components/common/file-dropzone";
import { formatRelativeTime } from "../utils/format-relative-time";
import { SortMenu } from "../components/common/sort-menu";
import { PaginationFooter } from "../components/common/pagination-footer";
import { VirtualJobList } from "../components/common/virtual-job-list";
import { useListQueryParams } from "../utils/use-list-query-params";
import { useViewMode } from "../utils/use-view-mode";
import { ViewToggle } from "../components/common/view-toggle";
import { EntityListTable } from "../components/common/entity-list-table";
import { WORKLOAD_SORTS } from "../config/sort-options";

type PanelMode = "view" | "edit" | "add";

function getFileTypeIcon(fileType: string | undefined) {
  if (!fileType) return <Description sx={{ color: "#4a9eff" }} />;
  if (fileType.includes("json")) return <CodeIcon sx={{ color: "#4a9eff" }} />;
  if (fileType.includes("csv")) return <CodeIcon sx={{ color: "#4a9eff" }} />;
  return <Description sx={{ color: "#4a9eff" }} />;
}

const WorkloadsPage: React.FC = () => {
  const { sort, order, page, size, skip, update } = useListQueryParams();
  const [workloads, setWorkloads] = useState<Workload[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [panelMode, setPanelMode] = useState<PanelMode>("view");
  const [viewMode, setViewMode] = useViewMode("workloads");
  const [selectedWorkload, setSelectedWorkload] = useState<Workload | null>(
    null
  );
  const [form, setForm] = useState<{
    name: string;
    description: string;
    file: File | null;
  }>({ name: "", description: "", file: null });
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error";
  }>({ open: false, message: "", severity: "success" });
  const [expandedJobs, setExpandedJobs] = useState(false);
  const [expandedProfiles, setExpandedProfiles] = useState(false);
  const [validationResult, setValidationResult] =
    useState<ValidationResponse | null>(null);
  const [summary, setSummary] = useState<WorkloadSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Load aggregate stats when drawer opens for an existing workload —
  // avoids parsing the (potentially huge) jobs JSON blob client-side.
  // Dep on selectedWorkload?.id (primitive) instead of the whole object so re-selecting
  // the same row doesn't re-fire the fetch when React creates a fresh reference.
  // Fetch full record + summary when drawer opens — list response uses load_only
  // (no jobs/profiles blobs) so we need the detail endpoint for the drawer.
  const selectedWorkloadId = selectedWorkload?.id;
  useEffect(() => {
    if (!drawerOpen || panelMode !== "view" || selectedWorkloadId == null) {
      setSummary(null);
      return;
    }
    let cancelled = false;
    setSummaryLoading(true);
    Promise.all([
      workloadsAPI.getById(selectedWorkloadId),
      workloadsAPI.getSummary(selectedWorkloadId),
    ])
      .then(([fullRes, summaryRes]) => {
        if (cancelled) return;
        setSelectedWorkload(fullRes.data);
        setSummary(summaryRes.data);
      })
      .catch(() => {
        if (!cancelled) setSummary(null);
      })
      .finally(() => {
        if (!cancelled) setSummaryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [drawerOpen, panelMode, selectedWorkloadId]);

  useEffect(() => {
    const fetchWorkloads = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await workloadsAPI.getAll({ sort_by: sort, order, skip, limit: size });
        setWorkloads(res.data);
        setTotal(Number(res.headers["x-total-count"] ?? res.data.length));
      } catch (err: any) {
        setError("Failed to load workloads.");
      } finally {
        setLoading(false);
      }
    };
    fetchWorkloads();
  }, [sort, order, skip, size]);

  const openDrawer = (mode: PanelMode, workload?: Workload) => {
    setPanelMode(mode);
    setSelectedWorkload(workload || null);
    setForm({
      name: workload?.name || "",
      description: workload?.description || "",
      file: null,
    });
    setDrawerOpen(true);
    setFormError(null);
    setValidationResult(null);
  };
  const closeDrawer = () => {
    setDrawerOpen(false);
    setSelectedWorkload(null);
    setFormError(null);
    setValidationResult(null);
  };
  const handleDelete = async () => {
    if (!selectedWorkload) return;
    setActionLoading(true);
    try {
      await workloadsAPI.delete(selectedWorkload.id);
      setWorkloads((prev) => prev.filter((w) => w.id !== selectedWorkload.id));
      setDeleteDialogOpen(false);
      closeDrawer();
      setSnackbar({
        open: true,
        message: "Workload deleted successfully!",
        severity: "success",
      });
    } catch (err: any) {
      setFormError("Failed to delete workload.");
    } finally {
      setActionLoading(false);
    }
  };
  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorkload) return;
    setActionLoading(true);
    try {
      await workloadsAPI.update(selectedWorkload.id, {
        name: form.name,
        description: form.description,
      });
      setWorkloads((prev) =>
        prev.map((w) =>
          w.id === selectedWorkload.id
            ? { ...w, name: form.name, description: form.description }
            : w
        )
      );
      closeDrawer();
      setSnackbar({
        open: true,
        message: "Workload updated successfully!",
        severity: "success",
      });
    } catch (err: any) {
      setFormError("Failed to update workload.");
    } finally {
      setActionLoading(false);
    }
  };
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.file) {
      setFormError("Name and file are required.");
      return;
    }
    setActionLoading(true);
    try {
      const formData = new FormData();
      formData.append("name", form.name);
      formData.append("description", form.description);
      formData.append("file", form.file);
      const res = await workloadsAPI.create(formData);
      setWorkloads((prev) => [res.data, ...prev]);
      closeDrawer();
      setSnackbar({
        open: true,
        message: "Workload uploaded successfully!",
        severity: "success",
      });
    } catch (err: any) {
      const validation = extractValidationErrors(err);
      if (validation) {
        setValidationResult(validation);
        setFormError(null);
      } else {
        setFormError(
          err?.response?.data?.detail || "Failed to add workload."
        );
      }
    } finally {
      setActionLoading(false);
    }
  };
  const handleDownload = async () => {
    if (!selectedWorkload) return;
    try {
      const res = await workloadsAPI.download(selectedWorkload.id);
      // The endpoint streams the file; take the name from its
      // Content-Disposition header, falling back to the record's name.
      const filename = filenameFromContentDisposition(
        res.headers["content-disposition"],
        selectedWorkload.name,
      );
      downloadBlob(res.data, filename);
    } catch {
      setSnackbar({
        open: true,
        message: "Failed to download file.",
        severity: "error",
      });
    }
  };

  return (
    <Box>
      {/* Workload List */}
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="h4" fontWeight={900} gutterBottom>
          Workloads
        </Typography>
        <Stack direction={{ xs: "column", sm: "row" }} alignItems={{ sm: "center" }} justifyContent="space-between" spacing={2} sx={{ mb: 3, width: "100%" }}>
          <Button
            variant="contained"
            color="primary"
            startIcon={<UploadFile />}
            sx={{ borderRadius: 1, fontWeight: 700 }}
            onClick={() => openDrawer("add")}
          >
            Upload New Workload
          </Button>
          <Stack direction="row" spacing={2} alignItems="center">
            <ViewToggle value={viewMode} onChange={setViewMode} />
            <SortMenu
              options={WORKLOAD_SORTS}
              value={`${sort}:${order}`}
              onChange={(s, o) => update({ sort: s, order: o, page: 1 })}
            />
          </Stack>
        </Stack>
        {loading ? (
          <Grid container spacing={3}>
            {Array.from({ length: 6 }).map((_, i) => (
              <Grid item xs={12} sm={6} md={4} key={i}>
                <Skeleton variant="rectangular" height={180} sx={{ borderRadius: 1 }} />
              </Grid>
            ))}
          </Grid>
        ) : error ? (
          <Alert severity="error" sx={{ mt: 4 }}>{error}</Alert>
        ) : workloads.length === 0 ? (
          <Typography color="text.secondary" sx={{ mt: 4 }}>
            No workloads yet — click Upload New Workload to add one.
          </Typography>
        ) : viewMode === "list" ? (
          <EntityListTable
            rows={workloads}
            rowKey={(w) => w.id}
            onRowClick={(w) => openDrawer("view", w)}
            columns={[
              {
                key: "name", label: "Name",
                render: (w) => (
                  <Typography variant="body2" fontWeight={600} noWrap title={w.name}>{w.name}</Typography>
                ),
              },
              { key: "res", label: "Resources", align: "right", render: (w) => w.nb_res ?? "-" },
              {
                key: "size", label: "File size", align: "right",
                render: (w) => (w.file_size ? `${(w.file_size / 1024).toFixed(1)} KB` : "-"),
              },
              { key: "version", label: "Version", align: "right", render: (w) => `v${w.version ?? 1}` },
              {
                key: "created", label: "Created",
                render: (w) => (
                  <Typography variant="caption" color="text.secondary">
                    {formatRelativeTime(w.created_at)}
                  </Typography>
                ),
              },
            ]}
          />
        ) : (
          <Grid container spacing={3}>
            {workloads.map((w) => (
              <Grid item xs={12} sm={6} md={4} key={w.id}>
                <Card
                  sx={{
                    borderRadius: 1,
                    background: "rgba(26,32,44,0.98)",
                    height: "100%",
                    overflow: "hidden",
                    cursor: "pointer",
                    transition: "transform 150ms ease, box-shadow 150ms ease",
                    "&:hover": {
                      transform: "translateY(-2px)",
                      boxShadow: "0 8px 24px 0 rgba(0,0,0,0.4)",
                    },
                    border:
                      selectedWorkload?.id === w.id && drawerOpen
                        ? "2px solid #4a9eff"
                        : undefined,
                  }}
                  onClick={() => openDrawer("view", w)}
                >
                  <CardContent>
                    <Stack
                      direction="row"
                      alignItems="center"
                      spacing={2}
                      mb={2}
                    >
                      <Storage sx={{ fontSize: 36, color: "#4a9eff" }} />
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography
                          variant="h6"
                          fontWeight={900}
                          noWrap
                          title={w.name}
                          sx={{ color: "#fff" }}
                        >
                          {w.name}
                        </Typography>
                        {/* Domain stats, not MIME noise: resources · size · version */}
                        <Typography variant="body2" color="text.secondary">
                          {w.nb_res != null ? `${w.nb_res} res · ` : ""}
                          {w.file_size
                            ? w.file_size >= 1024 * 1024
                              ? `${(w.file_size / (1024 * 1024)).toFixed(1)} MB`
                              : `${(w.file_size / 1024).toFixed(1)} KB`
                            : "?"}
                          {` · v${w.version ?? 1}`}
                        </Typography>
                      </Box>
                    </Stack>
                    <Typography
                      variant="body2"
                      sx={{ mb: 2 }}
                      color="text.secondary"
                    >
                      {w.description || "No description provided."}
                    </Typography>
                    <Stack direction="row" spacing={1}>
                      <Chip
                        label={formatRelativeTime(w.created_at)}
                        size="small"
                        color="default"
                      />
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
        {!loading && !error && (
          <PaginationFooter
            page={page}
            size={size}
            total={total}
            onPageChange={(p) => update({ page: p })}
            onSizeChange={(s) => update({ size: s, page: 1 })}
          />
        )}
      </Box>
      {/* Drawer for Detail/Edit/Add */}
      <Drawer
        anchor="right"
        open={drawerOpen}
        onClose={closeDrawer}
        PaperProps={{
          sx: { width: { xs: "100%", md: 560 }, p: 3, background: "#1a202c" },
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
          <Typography variant="h6" fontWeight={900} sx={{ flex: 1 }}>
            {panelMode === "add"
              ? "Upload New Workload"
              : panelMode === "edit"
              ? "Edit Workload"
              : selectedWorkload?.name || "Workload Details"}
          </Typography>
          <IconButton onClick={closeDrawer}>
            <Close />
          </IconButton>
        </Box>
        {panelMode === "view" && selectedWorkload && (
          <>
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{ mb: 1 }}
            >
              {getFileTypeIcon(selectedWorkload.file_type)}
              <Typography variant="subtitle2" color="text.secondary">
                {selectedWorkload.file_type?.toUpperCase() || "File"} •{" "}
                {selectedWorkload.file_size
                  ? `${(selectedWorkload.file_size / 1024).toFixed(1)} KB`
                  : "Unknown size"}
              </Typography>
              <Tooltip title="Download file">
                <IconButton size="small" onClick={handleDownload}>
                  <Download />
                </IconButton>
              </Tooltip>
            </Stack>
            <Typography variant="body2" sx={{ mb: 2 }} color="text.secondary">
              {selectedWorkload.description || "No description provided."}
            </Typography>
            <Stack direction="row" spacing={1} mb={2}>
              <Chip
                label={selectedWorkload.file_type || "file"}
                size="small"
                color="secondary"
              />
              <Chip
                label={selectedWorkload.created_at?.split("T")[0]}
                size="small"
                color="default"
              />
              {selectedWorkload.creator_username && (
                <Chip
                  label={`By ${selectedWorkload.creator_username}`}
                  size="small"
                  color="primary"
                />
              )}
              {selectedWorkload.updated_at && (
                <Chip
                  label={`Updated ${selectedWorkload.updated_at.split("T")[0]}`}
                  size="small"
                  color="info"
                />
              )}
            </Stack>
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              <b>Workload Metadata</b>
            </Typography>
            <Stack direction="row" spacing={1} mb={1} flexWrap="wrap" useFlexGap>
              <Chip
                label={`nb_res: ${selectedWorkload.nb_res ?? "-"}`}
                size="small"
                color="secondary"
              />
              <Chip
                label={`jobs: ${summary?.n_jobs ?? (summaryLoading ? "…" : "-")}`}
                size="small"
                color="secondary"
              />
              <Chip
                label={`profiles: ${summary?.n_profiles ?? (summaryLoading ? "…" : "-")}`}
                size="small"
                color="secondary"
              />
              {summary?.mean_walltime != null && (
                <Chip
                  label={`mean walltime: ${summary.mean_walltime.toFixed(2)}s`}
                  size="small"
                  variant="outlined"
                />
              )}
              {summary?.max_res != null && (
                <Chip
                  label={`max res: ${summary.max_res}`}
                  size="small"
                  variant="outlined"
                />
              )}
              {summary?.latest_subtime != null && (
                <Chip
                  label={`time span: ${summary.latest_subtime.toFixed(0)}s`}
                  size="small"
                  variant="outlined"
                />
              )}
            </Stack>
            <Accordion
              expanded={expandedJobs}
              onChange={() => setExpandedJobs((v) => !v)}
              slotProps={{ transition: { unmountOnExit: true } }}
            >
              <AccordionSummary expandIcon={<ExpandMore />}>
                <Typography>
                  Jobs preview {summary?.n_jobs ? `(${summary.n_jobs} total)` : ""}
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                {/* Lazy: VirtualJobList only mounts (and only hits the API) when accordion expanded */}
                {expandedJobs && (
                  <VirtualJobList workloadId={selectedWorkload.id} height={320} />
                )}
              </AccordionDetails>
            </Accordion>
            <Accordion
              expanded={expandedProfiles}
              onChange={() => setExpandedProfiles((v) => !v)}
            >
              <AccordionSummary expandIcon={<ExpandMore />}>
                <Typography>Profiles</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Box sx={{ maxHeight: 180, overflow: "auto" }}>
                  <pre style={{ fontSize: 12, margin: 0 }}>
                    {selectedWorkload.profiles
                      ? JSON.stringify(
                          JSON.parse(selectedWorkload.profiles),
                          null,
                          2
                        )
                      : "No profiles"}
                  </pre>
                </Box>
              </AccordionDetails>
            </Accordion>
            <Stack direction="row" spacing={2} mt={2}>
              <Button
                variant="outlined"
                color="primary"
                startIcon={<Edit />}
                onClick={() => setPanelMode("edit")}
                sx={{ fontWeight: 700, borderRadius: 1 }}
              >
                Edit
              </Button>
              <Button
                variant="outlined"
                color="error"
                startIcon={<Delete />}
                onClick={() => setDeleteDialogOpen(true)}
                sx={{ fontWeight: 700, borderRadius: 1 }}
              >
                Delete
              </Button>
            </Stack>
          </>
        )}
        {(panelMode === "edit" || panelMode === "add") && (
          <Box
            component="form"
            onSubmit={panelMode === "add" ? handleAdd : handleEdit}
            sx={{ mt: 2 }}
          >
            <TextField
              label="Name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              fullWidth
              required
              sx={{ mb: 2 }}
              disabled={panelMode === "edit"}
            />
            <TextField
              label="Description"
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
              fullWidth
              multiline
              minRows={2}
              sx={{ mb: 2 }}
            />
            <Box sx={{ mb: 2 }}>
              <FileDropzone
                id="workload-file"
                accept=".json,.txt,.csv,.dat,.workload"
                file={form.file}
                onFileChange={(file) => setForm((f) => ({ ...f, file }))}
                label={`File${panelMode === "add" ? " (required)" : " (optional)"}`}
                hint={
                  panelMode === "edit"
                    ? "JSON / TXT / CSV / DAT / WORKLOAD — leave empty to keep current file"
                    : "JSON / TXT / CSV / DAT / WORKLOAD"
                }
                required={panelMode === "add"}
              />
              {panelMode === "add" && (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
                  No file yet?{" "}
                  <Typography
                    component="a"
                    variant="caption"
                    color="primary"
                    href={templatesAPI.download("workload")}
                    sx={{ textDecoration: "underline" }}
                  >
                    Download the sample workload template
                  </Typography>{" "}
                  and start from there.
                </Typography>
              )}
            </Box>
            <ValidationErrorPanel validation={validationResult} />
            {formError && (
              <Alert severity="error" sx={{ mb: 2 }}>{formError}</Alert>
            )}
            <Stack direction="row" spacing={2}>
              <Button
                type="submit"
                variant="contained"
                color="primary"
                disabled={
                  actionLoading ||
                  (panelMode === "add" && (!form.name || !form.file))
                }
                sx={{ fontWeight: 700, borderRadius: 1 }}
              >
                {panelMode === "add"
                  ? actionLoading ? "Uploading..." : "Upload"
                  : actionLoading ? "Saving..." : "Save"}
              </Button>
              <Button
                variant="outlined"
                color="secondary"
                onClick={closeDrawer}
                sx={{ fontWeight: 700, borderRadius: 1 }}
                disabled={actionLoading}
              >
                Cancel
              </Button>
            </Stack>
          </Box>
        )}
        {/* Delete Confirmation Dialog */}
        <Dialog
          open={deleteDialogOpen}
          onClose={() => setDeleteDialogOpen(false)}
        >
          <DialogTitle>Delete Workload</DialogTitle>
          <DialogContent>
            <Typography>
              Are you sure you want to delete this workload?
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button
              onClick={() => setDeleteDialogOpen(false)}
              color="secondary"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDelete}
              color="error"
              disabled={actionLoading}
            >
              Delete
            </Button>
          </DialogActions>
        </Dialog>
        {/* Snackbar for feedback */}
        <Snackbar
          open={snackbar.open}
          autoHideDuration={4000}
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        >
          <Alert
            severity={snackbar.severity}
            onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
            sx={{ width: "100%" }}
          >
            {snackbar.message}
          </Alert>
        </Snackbar>
      </Drawer>
    </Box>
  );
};

export default WorkloadsPage;
