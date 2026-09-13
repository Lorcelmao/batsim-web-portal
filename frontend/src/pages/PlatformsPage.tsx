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
  Download,
  ExpandMore,
  Description,
  Code as CodeIcon,
  Computer,
} from "@mui/icons-material";
import {
  platformsAPI,
  templatesAPI,
  extractValidationErrors,
  Platform,
  ValidationResponse,
} from "../services/api";
import { downloadBlob, filenameFromContentDisposition } from "../utils/download-file";
import ValidationErrorPanel from "../components/ValidationErrorPanel";
import FileDropzone from "../components/common/file-dropzone";
import { formatRelativeTime } from "../utils/format-relative-time";
import { SortMenu } from "../components/common/sort-menu";
import { PaginationFooter } from "../components/common/pagination-footer";
import { useListQueryParams } from "../utils/use-list-query-params";
import { useViewMode } from "../utils/use-view-mode";
import { ViewToggle } from "../components/common/view-toggle";
import { EntityListTable } from "../components/common/entity-list-table";
import { PLATFORM_SORTS } from "../config/sort-options";

type PanelMode = "view" | "edit" | "add";

function getFileTypeIcon(fileType: string | undefined) {
  if (!fileType) return <Description sx={{ color: "#4a9eff" }} />;
  if (fileType.includes("xml")) return <CodeIcon sx={{ color: "#4a9eff" }} />;
  return <Description sx={{ color: "#4a9eff" }} />;
}

const PlatformsPage: React.FC = () => {
  const { sort, order, page, size, skip, update } = useListQueryParams();
  const [total, setTotal] = useState(0);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [panelMode, setPanelMode] = useState<PanelMode>("view");
  const [viewMode, setViewMode] = useViewMode("platforms");
  const [selectedPlatform, setSelectedPlatform] = useState<Platform | null>(
    null
  );
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error";
  }>({ open: false, message: "", severity: "success" });
  const [expandedConfig, setExpandedConfig] = useState(false);
  const [validationResult, setValidationResult] =
    useState<ValidationResponse | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    file: null as File | null,
  });

  useEffect(() => {
    const fetchPlatforms = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await platformsAPI.getAll({ sort_by: sort, order, skip, limit: size });
        const data = Array.isArray(res.data)
          ? res.data
          : (res.data as any).items || [];
        setPlatforms(data);
        setTotal(Number(res.headers["x-total-count"] ?? data.length));
      } catch (err: any) {
        setError("Failed to load platforms.");
      } finally {
        setLoading(false);
      }
    };
    fetchPlatforms();
  }, [sort, order, skip, size]);

  const openDrawer = (mode: PanelMode, platform?: Platform) => {
    setPanelMode(mode);
    setSelectedPlatform(platform || null);
    setFormError(null);
    setValidationResult(null);
    if (mode === "add") {
      setForm({ name: "", description: "", file: null });
    } else if (platform) {
      setForm({
        name: platform.name,
        description: platform.description || "",
        file: null,
      });
    }
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setSelectedPlatform(null);
    setFormError(null);
    setValidationResult(null);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.file) return;

    setActionLoading(true);
    setFormError(null);
    try {
      const formData = new FormData();
      formData.append("name", form.name);
      formData.append("description", form.description);
      formData.append("file", form.file);

      const res = await platformsAPI.create(formData);
      setPlatforms((prev) => [res.data, ...prev]);
      closeDrawer();
      setSnackbar({
        open: true,
        message: "Platform uploaded successfully!",
        severity: "success",
      });
    } catch (err: any) {
      const validation = extractValidationErrors(err);
      if (validation) {
        setValidationResult(validation);
      } else {
        setFormError("Failed to add platform.");
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlatform) return;

    setActionLoading(true);
    setFormError(null);
    try {
      const formData = new FormData();
      formData.append("name", form.name);
      formData.append("description", form.description);
      if (form.file) {
        formData.append("file", form.file);
      }

      const res = await platformsAPI.updateFile(selectedPlatform.id, formData);
      setPlatforms((prev) =>
        prev.map((p) => (p.id === selectedPlatform.id ? res.data : p))
      );
      closeDrawer();
      setSnackbar({
        open: true,
        message: "Platform updated successfully!",
        severity: "success",
      });
    } catch (err: any) {
      setFormError("Failed to update platform.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedPlatform) return;

    setActionLoading(true);
    try {
      await platformsAPI.delete(selectedPlatform.id);
      setPlatforms((prev) => prev.filter((p) => p.id !== selectedPlatform.id));
      setDeleteDialogOpen(false);
      closeDrawer();
      setSnackbar({
        open: true,
        message: "Platform deleted successfully!",
        severity: "success",
      });
    } catch (err: any) {
      setFormError("Failed to delete platform.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!selectedPlatform) return;
    try {
      const res = await platformsAPI.download(selectedPlatform.id);
      // The endpoint streams the file; take the name from its
      // Content-Disposition header, falling back to the record's name.
      const filename = filenameFromContentDisposition(
        res.headers["content-disposition"],
        selectedPlatform.name,
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
      {/* Platform List */}
      <Box>
        <Typography variant="h4" fontWeight={900} gutterBottom>
          Platforms
        </Typography>
        <Stack direction={{ xs: "column", sm: "row" }} alignItems={{ sm: "center" }} justifyContent="space-between" spacing={2} sx={{ mb: 3, width: "100%" }}>
          <Button
            variant="contained"
            color="primary"
            onClick={() => openDrawer("add")}
            sx={{ borderRadius: 1, fontWeight: 700 }}
          >
            Upload New Platform
          </Button>
          <Stack direction="row" spacing={2} alignItems="center">
            <ViewToggle value={viewMode} onChange={setViewMode} />
            <SortMenu
              options={PLATFORM_SORTS}
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
        ) : platforms.length === 0 ? (
          <Typography color="text.secondary" sx={{ mt: 4 }}>
            No platforms yet — click Upload New Platform to add one.
          </Typography>
        ) : viewMode === "list" ? (
          <EntityListTable
            rows={platforms}
            rowKey={(p) => p.id}
            onRowClick={(p) => openDrawer("view", p)}
            columns={[
              {
                key: "name", label: "Name",
                render: (p) => (
                  <Typography variant="body2" fontWeight={600} noWrap title={p.name}>{p.name}</Typography>
                ),
              },
              { key: "hosts", label: "Hosts", align: "right", render: (p) => p.nb_hosts ?? "-" },
              { key: "clusters", label: "Clusters", align: "right", render: (p) => p.nb_clusters ?? "-" },
              { key: "version", label: "Version", align: "right", render: (p) => `v${p.version ?? 1}` },
              {
                key: "created", label: "Created",
                render: (p) => (
                  <Typography variant="caption" color="text.secondary">
                    {formatRelativeTime(p.created_at)}
                  </Typography>
                ),
              },
            ]}
          />
        ) : (
          <Grid container spacing={3}>
            {platforms.map((p) => (
              <Grid item xs={12} sm={6} md={4} key={p.id}>
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
                  }}
                  onClick={() => openDrawer("view", p)}
                >
                  <CardContent>
                    <Stack
                      direction="row"
                      alignItems="center"
                      spacing={2}
                      mb={2}
                    >
                      <Computer sx={{ fontSize: 36, color: "#4a9eff" }} />
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography
                          variant="h6"
                          fontWeight={900}
                          noWrap
                          title={p.name}
                          sx={{ color: "#fff" }}
                        >
                          {p.name}
                        </Typography>
                        {/* Domain stats, not MIME noise: hosts · clusters · version */}
                        <Typography variant="body2" color="text.secondary">
                          {p.nb_hosts != null ? `${p.nb_hosts} hosts` : "? hosts"}
                          {p.nb_clusters ? ` · ${p.nb_clusters} cluster${p.nb_clusters > 1 ? "s" : ""}` : ""}
                          {` · v${p.version ?? 1}`}
                        </Typography>
                      </Box>
                    </Stack>
                    <Typography
                      variant="body2"
                      sx={{ mb: 2 }}
                      color="text.secondary"
                    >
                      {p.description || "No description provided."}
                    </Typography>
                    <Stack direction="row" spacing={1}>
                      <Chip
                        label={formatRelativeTime(p.created_at)}
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

      {/* Detail/Edit Panel */}
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
              ? "Upload New Platform"
              : panelMode === "edit"
              ? "Edit Platform"
              : selectedPlatform?.name || "Platform Details"}
          </Typography>
          <IconButton onClick={closeDrawer}>
            <Close />
          </IconButton>
        </Box>
        {panelMode === "view" && selectedPlatform && (
          <>
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{ mb: 1 }}
            >
              {getFileTypeIcon(selectedPlatform.file_type)}
              <Typography variant="subtitle2" color="text.secondary">
                {selectedPlatform.file_type?.toUpperCase() || "File"} •{" "}
                {selectedPlatform.file_size
                  ? `${(selectedPlatform.file_size / 1024).toFixed(1)} KB`
                  : "Unknown size"}
              </Typography>
              <Tooltip title="Download file">
                <IconButton size="small" onClick={handleDownload}>
                  <Download />
                </IconButton>
              </Tooltip>
            </Stack>
            <Typography variant="body2" sx={{ mb: 2 }} color="text.secondary">
              {selectedPlatform.description || "No description provided."}
            </Typography>
            <Stack direction="row" spacing={1} mb={2}>
              <Chip
                label={selectedPlatform.file_type || "file"}
                size="small"
                color="secondary"
              />
              <Chip
                label={selectedPlatform.created_at?.split("T")[0]}
                size="small"
                color="default"
              />
              {selectedPlatform.creator_username && (
                <Chip
                  label={`By ${selectedPlatform.creator_username}`}
                  size="small"
                  color="primary"
                />
              )}
              {selectedPlatform.updated_at && (
                <Chip
                  label={`Updated ${selectedPlatform.updated_at.split("T")[0]}`}
                  size="small"
                  color="info"
                />
              )}
            </Stack>
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              <b>Platform Metadata</b>
            </Typography>
            <Stack direction="row" spacing={2} mb={2}>
              <Chip
                label={`Hosts: ${selectedPlatform.nb_hosts ?? "-"}`}
                size="small"
                color="secondary"
              />
              <Chip
                label={`Clusters: ${selectedPlatform.nb_clusters ?? "-"}`}
                size="small"
                color="secondary"
              />
            </Stack>
            <Accordion
              expanded={expandedConfig}
              onChange={() => setExpandedConfig((v) => !v)}
            >
              <AccordionSummary expandIcon={<ExpandMore />}>
                <Typography>Platform Configuration</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Box sx={{ maxHeight: 180, overflow: "auto" }}>
                  <pre style={{ fontSize: 12, margin: 0 }}>
                    {selectedPlatform.platform_config ||
                      "No configuration available"}
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
                id="platform-file"
                accept=".xml,.txt,.platform"
                file={form.file}
                onFileChange={(file) => setForm((f) => ({ ...f, file }))}
                label={`File${panelMode === "add" ? " (required)" : " (optional)"}`}
                hint={
                  panelMode === "edit"
                    ? "XML platform definition — leave empty to keep current file"
                    : "XML platform definition"
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
                    href={templatesAPI.download("platform")}
                    sx={{ textDecoration: "underline" }}
                  >
                    Download the sample platform template
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
          <DialogTitle>Delete Platform</DialogTitle>
          <DialogContent>
            <Typography>
              Are you sure you want to delete "{selectedPlatform?.name}"? This
              action cannot be undone.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button
              onClick={() => setDeleteDialogOpen(false)}
              disabled={actionLoading}
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

export default PlatformsPage;
