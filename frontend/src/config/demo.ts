/**
 * Public read-only demo configuration.
 *
 * Set at build time by Dockerfile.demo, not at runtime, so the demo affordances
 * (the one-click sign in, the credential hint, the app bar badge) are compiled
 * out of a normal build entirely. A lab deployment stays byte-for-byte the
 * system it always was.
 *
 * The backend has its own DEMO_MODE flag guarding writes. This one is purely
 * presentational: it never grants access, it only explains it.
 */

export const IS_DEMO = import.meta.env.VITE_DEMO_MODE === "true";

/**
 * Credentials seeded into the demo dataset by scripts/build-demo-data.py.
 * Published on purpose: the account is read-only and the demo is public.
 */
export const DEMO_CREDENTIALS = {
  username: "demo",
  password: "demo1234",
} as const;

export const DEMO_BLURB =
  "A public, read-only demo of BatSim Web Portal, a platform for running and " +
  "analysing HPC job scheduling simulations. Browsing, results and analytics " +
  "all work. Uploading files and launching experiments are switched off here, " +
  "because a real run needs Docker access that cannot be exposed publicly.";
