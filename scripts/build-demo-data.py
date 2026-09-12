"""Build a small, self-contained dataset for the read-only demo deployment.

The working database and storage directory are far too large to ship in a
container image: storage/experiments is ~2.3 GB, dominated by out_schedule.trace
and multi-megabyte stderr logs, and batsim.db carries ~180 MB of free pages.

This script produces a pruned copy containing a handful of finished experiments
and only the files the API actually serves:

  * out_jobs.csv and out_schedule.csv     - the only result files the analytics
                                            endpoints read
  * the four *.log streams                - truncated to the same 200 KB cap the
                                            log-stream endpoint already applies,
                                            so the demo serves byte-identical
                                            content to a real deployment

Experiments are chosen deterministically and spread across workload sizes so the
Gantt, heatmap, waiting-time CDF and the comparison view all have something
meaningful to show.

Usage:
    python scripts/build-demo-data.py \
        --source-db backend/batsim.db \
        --source-storage backend/storage/experiments \
        --out demo-data
"""

from __future__ import annotations

import argparse
import shutil
import sqlite3
import sys
from pathlib import Path

# Mirrors _STREAM_CAP_BYTES in app/api/experiments.py. Keep the two in step: a
# larger value here ships bytes the API will never return.
LOG_CAP_BYTES = 200 * 1024

RESULT_FILES = ("out_jobs.csv", "out_schedule.csv")
LOG_FILES = (
    "batsim.stdout.log",
    "batsim.stderr.log",
    "pybatsim.stdout.log",
    "pybatsim.stderr.log",
)

DEMO_USER = {
    "id": 1,
    "username": "demo",
    "email": "demo@example.com",
    # bcrypt hash of "demo1234" - published credentials for a read-only demo.
    "role": "USER",
    "is_active": "true",
}


def select_experiments(
    conn: sqlite3.Connection,
    storage: Path,
    count: int,
    min_jobs: int,
    max_jobs: int,
) -> list[int]:
    """Pick finished experiments that still have their result files on disk.

    Candidates are ordered by job count and then sampled at even intervals, so
    the selection spans small, medium and large runs instead of clustering on
    whichever experiments happen to be newest.

    The job-count bounds matter for a demo specifically. Runs with no jobs render
    empty charts, and the largest runs here exceed 200k jobs, whose out_jobs.csv
    alone would dominate the image and make the browser labour over the Gantt.
    """
    rows = conn.execute(
        """
        SELECT e.id, e.total_jobs
        FROM experiments e
        WHERE e.status = 'COMPLETED'
          AND e.total_jobs BETWEEN ? AND ?
          -- EXISTS rather than a join: an experiment may carry several result
          -- rows, and a join would list it once per row.
          AND EXISTS (SELECT 1 FROM results r WHERE r.experiment_id = e.id)
        ORDER BY e.total_jobs, e.id
        """,
        (min_jobs, max_jobs),
    ).fetchall()

    usable = [
        (exp_id, jobs)
        for exp_id, jobs in rows
        if all((storage / str(exp_id) / name).is_file() for name in RESULT_FILES)
    ]
    if not usable:
        sys.exit(
            f"No completed experiments between {min_jobs} and {max_jobs} jobs "
            "have their result files on disk."
        )

    if len(usable) <= count:
        picked = usable
    else:
        step = (len(usable) - 1) / (count - 1) if count > 1 else 0
        taken: set[int] = set()
        for i in range(count):
            idx = round(i * step)
            # Even spacing can land twice on the same row once rounded; walk to
            # the nearest free slot rather than shipping a duplicate.
            while idx in taken and idx < len(usable) - 1:
                idx += 1
            while idx in taken and idx > 0:
                idx -= 1
            taken.add(idx)
        picked = [usable[i] for i in sorted(taken)]

    for exp_id, jobs in picked:
        print(f"  experiment {exp_id:>4}  {jobs:>7} jobs")
    return [exp_id for exp_id, _ in picked]


def copy_experiment_files(src: Path, dst: Path, exp_ids: list[int]) -> None:
    for exp_id in exp_ids:
        src_dir, dst_dir = src / str(exp_id), dst / str(exp_id)
        dst_dir.mkdir(parents=True, exist_ok=True)

        for name in RESULT_FILES:
            shutil.copy2(src_dir / name, dst_dir / name)

        for name in LOG_FILES:
            log = src_dir / name
            if not log.is_file():
                continue
            data = log.read_bytes()[:LOG_CAP_BYTES]
            # Trim the partial trailing line so the viewer never shows a
            # half-written record.
            if len(data) == LOG_CAP_BYTES and b"\n" in data:
                data = data[: data.rindex(b"\n") + 1]
            (dst_dir / name).write_bytes(data)


def prune_database(src_db: Path, dst_db: Path, exp_ids: list[int]) -> None:
    """Copy the database, then delete everything outside the kept experiments.

    Deleting from a copy is simpler and safer than rebuilding the schema by
    hand: it cannot drift from the SQLAlchemy models as they change.
    """
    shutil.copy2(src_db, dst_db)
    conn = sqlite3.connect(dst_db)
    ids = ",".join(str(i) for i in exp_ids)

    conn.executescript(
        f"""
        DELETE FROM results     WHERE experiment_id NOT IN ({ids});
        DELETE FROM experiments WHERE id NOT IN ({ids});
        DELETE FROM scenarios   WHERE id NOT IN (SELECT scenario_id FROM experiments);
        DELETE FROM strategies  WHERE id NOT IN (SELECT strategy_id FROM experiments);
        DELETE FROM workloads   WHERE id NOT IN (SELECT workload_id FROM scenarios);
        DELETE FROM platforms   WHERE id NOT IN (SELECT platform_id FROM scenarios);
        """
    )

    # Replace every account with a single published demo user, and re-own the
    # surviving rows so nothing references a deleted account.
    conn.execute("DELETE FROM users")
    conn.execute(
        "INSERT INTO users (id, username, email, hashed_password, role, is_active, created_at)"
        " SELECT ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP",
        (
            DEMO_USER["id"],
            DEMO_USER["username"],
            DEMO_USER["email"],
            _demo_password_hash(),
            DEMO_USER["role"],
            DEMO_USER["is_active"],
        ),
    )
    for table in ("workloads", "platforms", "scenarios", "strategies", "experiments"):
        conn.execute(f"UPDATE {table} SET created_by = ?", (DEMO_USER["id"],))

    conn.commit()

    violations = conn.execute("PRAGMA foreign_key_check").fetchall()
    if violations:
        sys.exit(f"Pruned database has FK violations: {violations[:5]}")

    # Reclaims the free pages that make the working database ~180 MB.
    conn.execute("VACUUM")
    conn.close()


def _demo_password_hash() -> str:
    from passlib.context import CryptContext

    return CryptContext(schemes=["bcrypt"], deprecated="auto").hash("demo1234")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-db", type=Path, default=Path("backend/batsim.db"))
    parser.add_argument(
        "--source-storage", type=Path, default=Path("backend/storage/experiments")
    )
    parser.add_argument("--out", type=Path, default=Path("demo-data"))
    parser.add_argument("--count", type=int, default=8)
    parser.add_argument(
        "--min-jobs", type=int, default=10, help="skip runs too small to plot"
    )
    parser.add_argument(
        "--max-jobs", type=int, default=20000, help="skip runs too large to ship"
    )
    args = parser.parse_args()

    if not args.source_db.is_file():
        sys.exit(f"Source database not found: {args.source_db}")
    if not args.source_storage.is_dir():
        sys.exit(f"Source storage not found: {args.source_storage}")

    if args.out.exists():
        shutil.rmtree(args.out)
    experiments_out = args.out / "experiments"
    experiments_out.mkdir(parents=True)

    conn = sqlite3.connect(args.source_db)
    print(f"Selecting {args.count} experiments:")
    exp_ids = select_experiments(
        conn, args.source_storage, args.count, args.min_jobs, args.max_jobs
    )
    conn.close()

    copy_experiment_files(args.source_storage, experiments_out, exp_ids)
    prune_database(args.source_db, args.out / "batsim.db", exp_ids)

    total = sum(f.stat().st_size for f in args.out.rglob("*") if f.is_file())
    print(f"\nWrote {args.out} — {total / 1e6:.1f} MB, {len(exp_ids)} experiments")
    print("Demo login: demo / demo1234")


if __name__ == "__main__":
    main()
