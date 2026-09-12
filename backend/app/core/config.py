from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database — default keeps the SQLite file at the CWD (backend/batsim.db in
    # native dev, /app/batsim.db in-container). VM deploy overrides this via env
    # to sqlite:///./storage/batsim.db so the DB lives under the persisted
    # storage/ mount (survives re-clone, captured by a storage/ backup).
    DATABASE_URL: str = "sqlite:///./batsim.db"

    # JWT
    SECRET_KEY: str = "your-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # File Storage
    STORAGE_PATH: str = "./storage"
    MAX_FILE_SIZE: int = 100 * 1024 * 1024  # 100MB

    # Docker — BatSim images
    # PYBATSIM_IMAGE defaults to the extended image (numpy/scipy/networkx/pandas pre-installed).
    # Build with: docker build -t batsim-portal/pybatsim-extended:1.0 docker/pybatsim-extended/
    # Override via .env to use upstream tanaxer/pybatsim:latest if the extended build is unavailable.
    BATSIM_IMAGE: str = "oarteam/batsim:latest"
    PYBATSIM_IMAGE: str = "batsim-portal/pybatsim-extended:1.0"
    # Path to the runtime manifest (libs available inside PyBatSim container).
    # Backend reads this to expose /system/runtime so the UI can show "Available libraries: ..."
    PYBATSIM_RUNTIME_INFO_PATH: str = "./docker/pybatsim-extended/runtime-info.json"

    # Simulation
    MAX_CONCURRENT_SIMULATIONS: int = 3
    SIMULATION_TIMEOUT_SECONDS: int = 3600
    SIMULATION_DATA_PATH: str = "./storage/experiments"

    # Container stats collector
    STATS_POLL_INTERVAL_SECONDS: int = 1
    STATS_KEY_TTL_SECONDS: int = 30

    # Monitoring
    GRAFANA_URL: str = "http://localhost:3000"

    # Read-only public demo. Enabling this serves the portal on an untrusted
    # network, so the API refuses every mutating request, skips the
    # Docker-dependent startup work (orphan cleanup, container stats collector)
    # and does not expose /metrics. The orchestrator is unusable in this mode.
    DEMO_MODE: bool = False

    # Directory holding a production frontend build. When it exists the API
    # also serves the SPA, so a demo deployment is a single container rather
    # than a separate API host and static host.
    FRONTEND_DIST_PATH: str = "./frontend_dist"

    # CORS
    BACKEND_CORS_ORIGINS: list = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:8080",
    ]

    class Config:
        env_file = ".env"


settings = Settings()
