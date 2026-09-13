import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Container,
  Paper,
  TextField,
  Button,
  Typography,
  Alert,
  Link,
  Divider,
  CircularProgress,
} from "@mui/material";
import { LockOutlined, PlayArrow } from "@mui/icons-material";
import useAuthStore from "../store/authStore";
import { IS_DEMO, DEMO_CREDENTIALS, DEMO_BLURB } from "../config/demo";

const LoginPage: React.FC = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [sessionExpired, setSessionExpired] = useState(false);

  const navigate = useNavigate();
  const { login, register, isLoading, error, isAuthenticated, clearError } =
    useAuthStore();

  useEffect(() => {
    if (isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    clearError();
    try {
      if (sessionStorage.getItem("session_expired") === "1") {
        setSessionExpired(true);
        sessionStorage.removeItem("session_expired");
      }
    } catch {
      // ignore storage errors
    }
  }, [clearError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isRegistering) {
      if (password !== confirmPassword) {
        return;
      }
      const result = await register({ username, email, password });
      if (result.success) {
        setIsRegistering(false);
        setEmail("");
        setConfirmPassword("");
      }
    } else {
      const result = await login({ username, password });
      if (result.success) {
        navigate("/");
      }
    }
  };

  // One click into the demo. Recruiters arrive with no context and no reason
  // to guess credentials, so the published read-only account signs itself in.
  const handleDemoSignIn = async () => {
    const result = await login({ ...DEMO_CREDENTIALS });
    if (result.success) {
      navigate("/");
    }
  };

  const handleToggleMode = () => {
    setIsRegistering(!isRegistering);
    setUsername("");
    setPassword("");
    setEmail("");
    setConfirmPassword("");
    clearError();
  };

  return (
    <Container component="main" maxWidth="xs">
      <Box
        sx={{
          marginTop: 8,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <Paper
          elevation={3}
          sx={{
            padding: 4,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            width: "100%",
          }}
        >
          <Box
            sx={{
              backgroundColor: "primary.main",
              borderRadius: "50%",
              width: 56,
              height: 56,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              mb: 2,
            }}
          >
            <LockOutlined sx={{ color: "white" }} />
          </Box>

          <Typography component="h1" variant="h5" gutterBottom>
            {isRegistering ? "Register" : "Sign In"}
          </Typography>

          <Typography
            variant="body2"
            color="text.secondary"
            align="center"
            sx={{ mb: IS_DEMO ? 2 : 3 }}
          >
            {IS_DEMO
              ? DEMO_BLURB
              : isRegistering
                ? "Create your account to access BatSim Portal"
                : "Sign in to access BatSim Portal"}
          </Typography>

          {IS_DEMO && (
            <Box sx={{ width: "100%", mb: 3 }}>
              <Button
                fullWidth
                variant="contained"
                size="large"
                startIcon={<PlayArrow />}
                onClick={handleDemoSignIn}
                disabled={isLoading}
              >
                Explore the demo
              </Button>
              <Typography
                variant="caption"
                color="text.secondary"
                align="center"
                component="p"
                sx={{ mt: 1.5 }}
              >
                Signs you in as the shared read-only account. To use the form
                instead: <strong>{DEMO_CREDENTIALS.username}</strong> /{" "}
                <strong>{DEMO_CREDENTIALS.password}</strong>
              </Typography>
              <Divider sx={{ mt: 2 }}>or sign in manually</Divider>
            </Box>
          )}

          {sessionExpired && !error && (
            <Alert severity="info" sx={{ width: "100%", mb: 2 }}>
              Your session expired. Please sign in again.
            </Alert>
          )}

          {error && (
            <Alert severity="error" sx={{ width: "100%", mb: 2 }}>
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit} sx={{ width: "100%" }}>
            <TextField
              margin="normal"
              required
              fullWidth
              id="username"
              label="Username"
              name="username"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isLoading}
            />

            {isRegistering && (
              <TextField
                margin="normal"
                required
                fullWidth
                id="email"
                label="Email Address"
                name="email"
                autoComplete="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
              />
            )}

            <TextField
              margin="normal"
              required
              fullWidth
              name="password"
              label="Password"
              type={showPassword ? "text" : "password"}
              id="password"
              autoComplete={isRegistering ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
            />

            {isRegistering && (
              <TextField
                margin="normal"
                required
                fullWidth
                name="confirmPassword"
                label="Confirm Password"
                type={showPassword ? "text" : "password"}
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                error={password !== confirmPassword && confirmPassword !== ""}
                helperText={
                  password !== confirmPassword && confirmPassword !== ""
                    ? "Passwords do not match"
                    : ""
                }
                disabled={isLoading}
              />
            )}

            <Button
              type="submit"
              fullWidth
              variant="contained"
              sx={{ mt: 3, mb: 2 }}
              disabled={
                isLoading || (isRegistering && password !== confirmPassword)
              }
            >
              {isLoading ? (
                <CircularProgress size={24} color="inherit" />
              ) : isRegistering ? (
                "Register"
              ) : (
                "Sign In"
              )}
            </Button>

            {/* Registration is refused in demo mode, so offering it would
                only lead to a 403. */}
            {!IS_DEMO && (
              <Box sx={{ textAlign: "center" }}>
                <Link
                  component="button"
                  variant="body2"
                  onClick={handleToggleMode}
                  disabled={isLoading}
                  sx={{ textDecoration: "none" }}
                >
                  {isRegistering
                    ? "Already have an account? Sign in"
                    : "Don't have an account? Register"}
                </Link>
              </Box>
            )}
          </Box>
        </Paper>
      </Box>
    </Container>
  );
};

export default LoginPage;
