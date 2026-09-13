import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Box,
  Tabs,
  Tab,
  TextField,
  Button,
  Chip,
  Alert,
  Skeleton,
  Typography,
  Tooltip,
  ToggleButton,
} from "@mui/material";
import { Refresh, Download, KeyboardArrowDown } from "@mui/icons-material";
import { experimentsAPI } from "../../services/api";
import { downloadBlob } from "../../utils/download-file";
import { renderLine } from "./log-line-renderer";

type StreamKey = "batsim_stdout" | "batsim_stderr" | "pybatsim_stdout" | "pybatsim_stderr";

interface StreamData {
  content: string;
  truncated: boolean;
  size_bytes: number;
}

type StreamsState = Record<StreamKey, StreamData>;

const STREAM_KEYS: StreamKey[] = [
  "batsim_stdout",
  "batsim_stderr",
  "pybatsim_stdout",
  "pybatsim_stderr",
];

const STREAM_LABELS: Record<StreamKey, string> = {
  batsim_stdout: "BatSim stdout",
  batsim_stderr: "BatSim stderr",
  pybatsim_stdout: "PyBatsim stdout",
  pybatsim_stderr: "PyBatsim stderr",
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export interface LogStreamViewerProps {
  experimentId: number;
  live: boolean; // drives 5s auto-refresh when RUNNING
  showProgressHeader?: boolean; // default true; set false to skip (not used here — strip is in parent)
}

export const LogStreamViewer: React.FC<LogStreamViewerProps> = ({
  experimentId,
  live,
}) => {
  const [streams, setStreams] = useState<StreamsState | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  // Auto-tail: default ON when live
  const [tailEnabled, setTailEnabled] = useState(live);
  // Ref to the scrollable content box
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const fetchStreams = useCallback(async () => {
    try {
      const res = await experimentsAPI.getLogStreams(experimentId);
      setStreams(res.data as StreamsState);
      setFetchError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load logs";
      setFetchError(msg);
    } finally {
      setLoading(false);
    }
  }, [experimentId]);

  // Initial fetch
  useEffect(() => {
    setLoading(true);
    fetchStreams();
  }, [fetchStreams]);

  // Auto-refresh when live
  useEffect(() => {
    if (!live) return;
    const id = setInterval(fetchStreams, 5000);
    return () => clearInterval(id);
  }, [live, fetchStreams]);

  // Re-arm tailEnabled when live prop changes to true
  useEffect(() => {
    if (live) setTailEnabled(true);
  }, [live]);

  // One-shot: if the default tab is empty (batsim stdout is often 0 B),
  // jump to the first stream with content so the user never lands on
  // "No output captured." with data sitting one tab away.
  const didAutoSelect = useRef(false);
  useEffect(() => {
    if (didAutoSelect.current || !streams) return;
    didAutoSelect.current = true;
    if ((streams[STREAM_KEYS[activeTab]]?.size_bytes ?? 0) === 0) {
      const idx = STREAM_KEYS.findIndex((k) => (streams[k]?.size_bytes ?? 0) > 0);
      if (idx >= 0) setActiveTab(idx);
    }
  }, [streams, activeTab]);

  // Reset scroll ref + tail-state on tab change
  const handleTabChange = (_: React.SyntheticEvent, v: number) => {
    setActiveTab(v as number);
    setSearchTerm("");
    if (live) setTailEnabled(true);
  };

  const activeKey = STREAM_KEYS[activeTab];

  // Fetched through the API client so the auth header is attached; a plain
  // <a download> link would hit the endpoint unauthenticated and get a 401.
  const handleDownload = useCallback(async () => {
    const res = await experimentsAPI.downloadLogStream(experimentId, activeKey);
    downloadBlob(res.data, `experiment-${experimentId}-${activeKey}.txt`, "text/plain");
  }, [experimentId, activeKey]);
  const activeStream = streams?.[activeKey];

  const renderedLines = useMemo(() => {
    if (!activeStream?.content) return null;
    const lines = activeStream.content.split("\n");
    const filtered = searchTerm
      ? lines.filter((l) => l.toLowerCase().includes(searchTerm.toLowerCase()))
      : lines;
    if (filtered.length === 0) return null;
    // Perf guard: skip token tinting on very large logs (plain render is cheap)
    const tokenize = filtered.length < 5000;
    return filtered.map((line, i) => renderLine(line, i + 1, tokenize));
  }, [activeStream?.content, searchTerm]);

  // Auto-scroll to bottom when content updates and tail is armed
  useEffect(() => {
    if (!live || !tailEnabled || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [renderedLines, tailEnabled, live]);

  // Detect user scrolling up to disarm tail
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    if (!atBottom && tailEnabled) {
      setTailEnabled(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ p: 2 }}>
        <Skeleton variant="rectangular" height={40} sx={{ mb: 1 }} />
        <Skeleton variant="rectangular" height={300} />
      </Box>
    );
  }

  if (fetchError) {
    return <Alert severity="error" sx={{ m: 2 }}>{fetchError}</Alert>;
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          variant="scrollable"
          scrollButtons="auto"
        >
          {STREAM_KEYS.map((key) => {
            const s = streams?.[key];
            const label = `${STREAM_LABELS[key]}${s ? ` · ${formatSize(s.size_bytes)}` : ""}`;
            return (
              <Tab
                key={key}
                label={
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    <span>{label}</span>
                    {s?.truncated && (
                      <Chip label="TRUNCATED" size="small" color="warning" sx={{ height: 16, fontSize: "0.6rem" }} />
                    )}
                  </Box>
                }
              />
            );
          })}
        </Tabs>
      </Box>

      <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 2, py: 1, borderBottom: 1, borderColor: "divider" }}>
        <TextField
          size="small"
          placeholder="Search lines..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          sx={{ width: 200 }}
          inputProps={{ "aria-label": "search log lines" }}
        />
        <Button size="small" startIcon={<Refresh />} onClick={fetchStreams} variant="outlined">
          Refresh
        </Button>
        <Button
          size="small"
          startIcon={<Download />}
          variant="outlined"
          onClick={handleDownload}
        >
          Download .txt
        </Button>
        {/* Auto-tail toggle — only meaningful when live */}
        {live && (
          <Tooltip title={tailEnabled ? "Auto-scroll to bottom (ON — click to pause)" : "Auto-scroll paused (click to re-arm)"}>
            <ToggleButton
              size="small"
              selected={tailEnabled}
              value="tail"
              onChange={() => {
                const next = !tailEnabled;
                setTailEnabled(next);
                // Immediately scroll to bottom when re-arming
                if (next && scrollRef.current) {
                  scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
                }
              }}
              aria-label="auto-scroll to bottom"
              aria-pressed={tailEnabled}
              sx={{ ml: 1, height: 30, px: 1 }}
            >
              <KeyboardArrowDown fontSize="small" />
            </ToggleButton>
          </Tooltip>
        )}
        {live && (
          <Chip label="LIVE" color="success" size="small" sx={{ ml: "auto" }} />
        )}
      </Box>

      {activeStream?.truncated && (
        <Alert severity="warning" sx={{ mx: 2, mt: 1, py: 0.5 }}>
          Stream truncated to 5 MB. Download for full content.
        </Alert>
      )}

      <Box
        ref={scrollRef}
        onScroll={handleScroll}
        sx={{
          flex: 1,
          overflow: "auto",
          p: 1.5,
          bgcolor: "grey.900",
          fontFamily: "monospace",
          fontSize: "0.75rem",
          color: "grey.100",
          minHeight: 200,
        }}
      >
        {renderedLines ?? (
          <Typography
            sx={{
              color: "grey.500",
              fontFamily: "monospace",
              fontSize: "0.75rem",
              textAlign: "center",
              mt: 4,
            }}
          >
            No output captured.
          </Typography>
        )}
      </Box>
    </Box>
  );
};
