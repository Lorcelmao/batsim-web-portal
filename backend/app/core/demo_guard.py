"""Read-only request guard for public demo deployments.

The portal normally runs on a trusted network because the orchestrator has full
access to the host Docker daemon and executes user-supplied scheduling
strategies. A public demo exposes only the analysis half of the system, so every
mutating request has to be refused.

The guard filters on HTTP method rather than on a list of write routes. Routers
here mix reads and writes (``GET /experiments/{id}/progress`` and
``POST /experiments/{id}/start`` live in the same module), so a route-based
allow-list would have to enumerate roughly twenty-five endpoints and would let
any newly added route default to writable. Filtering by method inverts that: a
new endpoint is read-only unless it is explicitly listed below.
"""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})

# Sign-in is the one write the demo needs: the SPA exchanges the published demo
# credentials for a token before it can read anything. Registration is
# deliberately absent so the demo cannot accumulate accounts.
ALLOWED_WRITE_PATHS = frozenset(
    {
        "/api/auth/login",
        "/api/auth/login-json",
        "/api/auth/token",
    }
)

DEMO_MESSAGE = (
    "This is a read-only public demo. Uploading workloads, running experiments "
    "and editing data are disabled here, because running a simulation requires "
    "Docker access that cannot be exposed publicly. The full portal runs on a "
    "trusted network — see the repository README."
)


class ReadOnlyDemoMiddleware(BaseHTTPMiddleware):
    """Refuse mutating requests with a message the UI can display verbatim."""

    async def dispatch(self, request: Request, call_next):
        if (
            request.method not in SAFE_METHODS
            and request.url.path not in ALLOWED_WRITE_PATHS
        ):
            # 403 rather than 405: the route exists and the method is valid, the
            # deployment just refuses it. The body matches the API's usual
            # {"detail": ...} shape so the frontend's error snackbar renders it.
            return JSONResponse(status_code=403, content={"detail": DEMO_MESSAGE})
        return await call_next(request)
