import React, { useState, useEffect } from "react";

// Imported rather than referenced by URL: a literal "/src/assets/..." path is
// only served by the Vite dev server, so it 404s in any production build.
import batsimLogo from "../assets/batweb-logo.png";
import { IS_DEMO } from "../config/demo";
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  LinearProgress,
  Chip,
  Paper,
  Button,
  Avatar,
  Stack,
  Tabs,
  Tab,
  Divider,
  CircularProgress,
  LinearProgress as MuiLinearProgress,
} from "@mui/material";
import {
  Storage,
  Computer,
  Settings,
  Code,
  Science,
  Analytics,
  TrendingUp,
  Star,
  ContentCopy,
} from "@mui/icons-material";
import {
  workloadsAPI,
  platformsAPI,
  scenariosAPI,
  strategiesAPI,
  experimentsAPI,
  resultsAPI,
} from "../services/api";
import {
  Workload,
  Platform,
  Scenario,
  Strategy,
  Experiment,
  Result,
} from "../services/api";
import DashboardAnalyticsGadget from "../components/DashboardAnalyticsGadget";
import { formatRelativeTime } from "../utils/format-relative-time";

interface DashboardStats {
  workloads: number;
  platforms: number;
  scenarios: number;
  strategies: number;
  experiments: number;
  results: number;
  runningExperiments: number;
  completedExperiments: number;
}

const DashboardPage: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats>({
    workloads: 0,
    platforms: 0,
    scenarios: 0,
    strategies: 0,
    experiments: 0,
    results: 0,
    runningExperiments: 0,
    completedExperiments: 0,
  });
  const [loading, setLoading] = useState(true);
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [expTab, setExpTab] = useState(0);
  const [expLoading, setExpLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [
          workloadsRes,
          platformsRes,
          scenariosRes,
          strategiesRes,
          experimentsRes,
          resultsRes,
        ] = await Promise.all([
          workloadsAPI.getAll({ limit: 1 }),
          platformsAPI.getAll({ limit: 1 }),
          scenariosAPI.getAll({ limit: 1 }),
          strategiesAPI.getAll({ limit: 1 }),
          experimentsAPI.getAll({ limit: 500 }),
          resultsAPI.getAll({ limit: 1 }),
        ]);

        // Counts come from the X-Total-Count header now that lists are paginated;
        // experiments fetches more rows so we can still count by status client-side.
        const totalOf = (res: any): number =>
          Number(res.headers?.["x-total-count"] ?? (Array.isArray(res.data) ? res.data.length : 0));

        const experimentsArr = Array.isArray(experimentsRes.data)
          ? experimentsRes.data
          : experimentsRes.data.items || [];
        const runningExperiments = experimentsArr.filter(
          (exp: Experiment) => exp.status === "running"
        ).length;
        const completedExperiments = experimentsArr.filter(
          (exp: Experiment) => exp.status === "completed"
        ).length;

        setStats({
          workloads: totalOf(workloadsRes),
          platforms: totalOf(platformsRes),
          scenarios: totalOf(scenariosRes),
          strategies: totalOf(strategiesRes),
          experiments: totalOf(experimentsRes),
          results: totalOf(resultsRes),
          runningExperiments,
          completedExperiments,
        });
        setExperiments(experimentsArr);
        setExpLoading(false);
      } catch (error) {
        console.error("Error fetching dashboard stats:", error);
        setExpLoading(false);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (loading) {
    return (
      <Box sx={{ width: "100%" }}>
        <LinearProgress />
      </Box>
    );
  }

  // Tab filtering logic
  const tabLabels = ["Running", "Completed", "Failed"];
  const statusMap = ["running", "completed", "failed"];
  const filteredExperiments = experiments.filter(
    (exp) =>
      (expTab === 0 && exp.status === "running") ||
      (expTab === 1 && exp.status === "completed") ||
      (expTab === 2 && (exp.status === "failed" || exp.status === "cancelled"))
  );

  return (
    <Box>
      {/* Hero Section */}
      <Box
        sx={{
          background: "linear-gradient(90deg, #2d3748 0%, #0c2259 100%)",
          borderRadius: 16,
          p: { xs: 3, md: 6 },
          mb: 5,
          color: "#e2e8f0",
          display: "flex",
          flexDirection: { xs: "column", md: "row" },
          alignItems: "center",
          justifyContent: "space-between",
          minHeight: 180,
          boxShadow: "0 4px 32px 0 rgba(74,158,255,0.15)",
        }}
      >
        <Box sx={{ flex: 2, minWidth: 0 }}>
          <Typography variant="h4" fontWeight={600} gutterBottom sx={{ mb: 2 }}>
            Welcome to BatSim Web Portal
          </Typography>
          <Typography
            variant="body1"
            sx={{ opacity: 0.9, mb: 3, fontSize: 16, maxWidth: 600 }}
          >
            {IS_DEMO
              ? "Browse completed HPC scheduling simulations: job timelines, host utilization heatmaps, waiting time distributions and side by side comparisons. Uploading and running experiments are disabled on this public demo."
              : "Manage, run, and analyze your BatSim experiments with ease. Upload workloads, platforms, and strategies, create scenarios, launch experiments, and view results, all in one place."}
          </Typography>
          {/* The standard actions are all writes, which the demo refuses. Point
              visitors at what this deployment can actually show instead. */}
          {IS_DEMO ? (
          <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
            <Button
              variant="contained"
              color="primary"
              href="/results"
              size="large"
              sx={{ fontWeight: 900, borderRadius: 8, py: 1.5 }}
            >
              View Results
            </Button>
            <Button
              variant="outlined"
              color="primary"
              href="/compare"
              size="large"
              sx={{ fontWeight: 700, borderRadius: 8, borderWidth: 2 }}
            >
              Compare Experiments
            </Button>
            <Button
              variant="outlined"
              color="primary"
              href="/docs"
              target="_blank"
              rel="noopener"
              size="large"
              sx={{ fontWeight: 700, borderRadius: 8, borderWidth: 2 }}
            >
              API Docs
            </Button>
          </Stack>
          ) : (
          <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
            <Button
              variant="contained"
              color="primary"
              href="/experiments"
              size="large"
              sx={{ fontWeight: 900, borderRadius: 8, py: 1.5 }}
            >
              Start New Experiment
            </Button>
            <Button
              variant="outlined"
              color="primary"
              href="/workloads"
              size="large"
              sx={{ fontWeight: 700, borderRadius: 8, borderWidth: 2 }}
            >
              Upload New Workload
            </Button>
            <Button
              variant="outlined"
              color="primary"
              href="/platforms"
              size="large"
              sx={{ fontWeight: 700, borderRadius: 8, borderWidth: 2 }}
            >
              Upload New Platform
            </Button>
            <Button
              variant="outlined"
              color="primary"
              href="/strategies"
              size="large"
              sx={{ fontWeight: 700, borderRadius: 8, borderWidth: 2 }}
            >
              Upload New Strategy
            </Button>
            <Button
              variant="outlined"
              color="primary"
              href="/scenarios"
              size="large"
              sx={{ fontWeight: 700, borderRadius: 8, borderWidth: 2 }}
            >
              Create Scenario
            </Button>
          </Stack>
          )}
        </Box>
        <Box
          sx={{
            flex: 1,
            display: { xs: "none", md: "flex" },
            justifyContent: "flex-end",
            alignItems: "center",
          }}
        >
          <img
            src={batsimLogo}
            alt="BatSim"
            style={{
              height: 140,
              maxWidth: 260,
            }}
          />
        </Box>
      </Box>

      {/* Portal Stats Section */}
      <Typography variant="h5" fontWeight={900} sx={{ mb: 2, mt: 2 }}>
        Portal Stats
      </Typography>
      {(() => {
        const statsCards = [
          {
            icon: <Storage sx={{ fontSize: 40, color: "#4a9eff", mb: 1 }} />,
            label: "Workloads",
            value: stats.workloads,
          },
          {
            icon: <Computer sx={{ fontSize: 40, color: "#4a9eff", mb: 1 }} />,
            label: "Platforms",
            value: stats.platforms,
          },
          {
            icon: <Settings sx={{ fontSize: 40, color: "#4a9eff", mb: 1 }} />,
            label: "Scenarios",
            value: stats.scenarios,
          },
          {
            icon: <Code sx={{ fontSize: 40, color: "#4a9eff", mb: 1 }} />,
            label: "Strategies",
            value: stats.strategies,
          },
          {
            icon: <Science sx={{ fontSize: 40, color: "#4a9eff", mb: 1 }} />,
            label: "Experiments",
            value: stats.experiments,
            // Live activity at a glance — only shown when something is running
            sub: stats.runningExperiments > 0
              ? `${stats.runningExperiments} running`
              : undefined,
          },
          {
            icon: <Analytics sx={{ fontSize: 40, color: "#4a9eff", mb: 1 }} />,
            label: "Results",
            value: stats.results,
          },
        ];
        return (
          <Grid
            container
            spacing={3}
            sx={{ mb: 5, justifyContent: "flex-start" }}
          >
            {statsCards.map((stat) => (
              <Grid item xs={12} sm={6} md={4} lg={2} key={stat.label}>
                <Card
                  sx={{
                    p: 3,
                    textAlign: "center",
                    borderRadius: 8,
                    background: "rgba(26,32,44,0.98)",
                    boxShadow: "0 2px 12px 0 rgba(74,158,255,0.08)",
                  }}
                >
                  {stat.icon}
                  <Typography
                    variant="h4"
                    fontWeight={900}
                    sx={{ color: "#fff", mb: 0.5 }}
                  >
                    {stat.value}
                  </Typography>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ fontWeight: 700, letterSpacing: 0.5 }}
                  >
                    {stat.label}
                  </Typography>
                  {(stat as { sub?: string }).sub && (
                    <Typography variant="caption" sx={{ color: "#fbbf24", fontWeight: 700 }}>
                      {(stat as { sub?: string }).sub}
                    </Typography>
                  )}
                </Card>
              </Grid>
            ))}
          </Grid>
        );
      })()}

      {/* Experiments Overview Section */}
      <Typography variant="h5" fontWeight={900} sx={{ mb: 2, mt: 2 }}>
        Experiments Overview
      </Typography>
      <Card
        sx={{
          p: 0,
          borderRadius: 8,
          background: "rgba(24,34,53,0.98)",
          boxShadow: "0 2px 12px 0 rgba(0,224,211,0.04)",
          mb: 4,
        }}
      >
        <Tabs
          value={expTab}
          onChange={(_, v) => setExpTab(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ px: 3, pt: 2 }}
        >
          {tabLabels.map((label, idx) => (
            <Tab
              key={label}
              label={label}
              sx={{ fontWeight: 700, color: "#e2e8f0" }}
            />
          ))}
        </Tabs>
        <Divider sx={{ borderColor: "rgba(255,255,255,0.08)" }} />
        <Box sx={{ p: 3 }}>
          {expLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", my: 4 }}>
              <CircularProgress color="primary" />
            </Box>
          ) : filteredExperiments.length === 0 ? (
            <Typography color="text.secondary" align="center" sx={{ my: 4 }}>
              No {tabLabels[expTab].toLowerCase()} experiments found.
            </Typography>
          ) : (
            <Grid container spacing={2}>
              {filteredExperiments.map((exp) => (
                <Grid item xs={12} md={6} lg={4} key={exp.id}>
                  <Card
                    sx={{
                      borderRadius: 8,
                      background: "rgba(26,32,44,0.98)",
                      height: "100%",
                    }}
                  >
                    <CardContent>
                      <Stack
                        direction="row"
                        alignItems="center"
                        spacing={2}
                        mb={2}
                      >
                        <Science sx={{ fontSize: 32, color: "#4a9eff" }} />
                        <Box>
                          <Typography
                            variant="h6"
                            fontWeight={900}
                            sx={{ color: "#fff" }}
                          >
                            {exp.name}
                          </Typography>
                          <Stack
                            direction="row"
                            spacing={1}
                            alignItems="center"
                          >
                            <Chip
                              label={
                                exp.status.charAt(0).toUpperCase() +
                                exp.status.slice(1)
                              }
                              size="small"
                              color={
                                exp.status === "running"
                                  ? "primary"
                                  : exp.status === "completed"
                                  ? "success"
                                  : "error"
                              }
                              sx={{ fontWeight: 700 }}
                            />
                            {exp.progress_percentage !== undefined &&
                              exp.status === "running" && (
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                >
                                  {exp.progress_percentage}%
                                </Typography>
                              )}
                          </Stack>
                        </Box>
                      </Stack>
                      <Typography
                        variant="body2"
                        sx={{ mb: 2 }}
                        color="text.secondary"
                      >
                        {exp.description || "No description provided."}
                      </Typography>
                      <Stack direction="row" spacing={1} mb={1}>
                        <Chip
                          label={exp.scenario_name || "Scenario"}
                          size="small"
                          color="secondary"
                        />
                        <Chip
                          label={exp.strategy_name || "Strategy"}
                          size="small"
                          color="secondary"
                        />
                      </Stack>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Chip
                          label={formatRelativeTime(exp.created_at)}
                          size="small"
                          color="default"
                        />
                        {exp.status === "completed" && exp.end_time && (
                          <Chip
                            label={`Ended: ${exp.end_time.split("T")[0]}`}
                            size="small"
                            color="success"
                          />
                        )}
                        {exp.status === "running" && (
                          <MuiLinearProgress
                            variant="determinate"
                            value={exp.progress_percentage || 0}
                            sx={{
                              height: 8,
                              borderRadius: 8,
                              flex: 1,
                              ml: 2,
                              background: "#23304a",
                            }}
                          />
                        )}
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}
        </Box>
      </Card>

      {/* Analytics Section */}
      <Typography variant="h5" fontWeight={900} sx={{ mb: 2, mt: 2 }}>
        Analytics
      </Typography>
      <DashboardAnalyticsGadget />
    </Box>
  );
};

export default DashboardPage;
