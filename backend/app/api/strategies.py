from typing import List
from fastapi import APIRouter, Depends, HTTPException, Response, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
import os
import shutil
import json
from app.core.database import get_db
from app.core.config import settings
from app.core.list_helpers import apply_sort, set_total_count
from app.models.user import User
from app.models.strategy import Strategy
from app.schemas.strategy import (
    Strategy as StrategySchema,
    StrategyUpdate,
    StrategyWithCreator,
)
from app.api.auth import get_current_user
from app.services.validators import validate_strategy
from app.services.file_utils import sanitize_filename, safe_file_path

router = APIRouter()

STORAGE_DIR = os.path.join(settings.STORAGE_PATH, "strategies")

STRATEGY_SORT_FIELDS = {"id", "name", "created_at", "updated_at", "file_size"}


def ensure_storage_directory():
    os.makedirs(STORAGE_DIR, exist_ok=True)


def _parse_and_validate_strategy(file_path: str, filename: str):
    """Validate strategy file and return (result, content)."""
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()
    result = validate_strategy(content, filename)
    return result, content


def _detect_main_entry(filename: str, metadata: dict) -> str | None:
    """Return filename if it qualifies as the strategy entry, else None.

    A Python file is treated as the entry when the validator detects any of:
    a scheduler class, a scheduler function, a main() definition, or an
    `if __name__ == "__main__":` guard. PyBatsim discovers schedulers via the
    first three; the guard covers stand-alone runnable schedulers.
    """
    if any(metadata.get(k) for k in ("scheduler_class", "scheduler_function",
                                     "has_main", "has_name_guard")):
        return filename
    return None


@router.get("/", response_model=List[StrategyWithCreator])
def get_strategies(
    response: Response,
    skip: int = 0,
    limit: int = 20,
    sort_by: str = "created_at",
    order: str = "desc",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    base = db.query(Strategy)
    set_total_count(response, base.count())
    sorted_q = apply_sort(base, Strategy, sort_by, order, STRATEGY_SORT_FIELDS)
    strategies = sorted_q.offset(skip).limit(limit).all()
    result = []
    for strategy in strategies:
        strategy_dict = StrategyWithCreator.from_orm(strategy)
        if strategy.creator:
            strategy_dict.creator_username = strategy.creator.username
        result.append(strategy_dict)
    return result


@router.get("/{strategy_id}", response_model=StrategyWithCreator)
def get_strategy(
    strategy_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    strategy = db.query(Strategy).filter(Strategy.id == strategy_id).first()
    if strategy is None:
        raise HTTPException(status_code=404, detail="Strategy not found")
    strategy_dict = StrategyWithCreator.from_orm(strategy)
    if strategy.creator:
        strategy_dict.creator_username = strategy.creator.username
    return strategy_dict


@router.post("/", response_model=StrategySchema)
async def create_strategy(
    name: str = Form(...),
    description: str = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ensure_storage_directory()

    if db.query(Strategy).filter(Strategy.name == name).first():
        raise HTTPException(status_code=400, detail="Strategy with this name already exists")

    if not (file.content_type == "text/x-python" or file.filename.endswith(".py")):
        raise HTTPException(status_code=422, detail={
            "valid": False,
            "errors": [{"field": "file", "error": "Strategy must be a Python file (.py)",
                        "suggestion": "Upload a PyBatsim scheduler Python file"}],
            "warnings": [],
        })

    # Save file (sanitize filename to prevent path traversal)
    safe_name = sanitize_filename(f"{name}_{file.filename}")
    file_path = safe_file_path(STORAGE_DIR, safe_name)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Validate
    try:
        validation, content = _parse_and_validate_strategy(file_path, file.filename)
    except Exception as e:
        os.remove(file_path)
        raise HTTPException(status_code=422, detail={
            "valid": False,
            "errors": [{"field": "file", "error": f"Failed to read file: {e}", "suggestion": ""}],
            "warnings": [],
        })

    if not validation.valid:
        os.remove(file_path)
        raise HTTPException(status_code=422, detail=validation.to_dict())

    # Extract metadata. A file qualifies as the strategy entry point if it
    # contains a scheduler class, scheduler function, main(), or __name__ guard.
    main_entry = _detect_main_entry(file.filename, validation.metadata)
    strategy_files = json.dumps([{
        "filename": file.filename,
        "size": file.size,
        "is_main": main_entry == file.filename,
    }])

    strategy = Strategy(
        name=name,
        description=description,
        file_path=file_path,
        file_size=file.size,
        file_type=file.content_type or "python",
        created_by=current_user.id,
        nb_files=1,
        main_entry=main_entry,
        strategy_files=strategy_files,
        version=1,
    )
    db.add(strategy)
    db.commit()
    db.refresh(strategy)
    return strategy


@router.put("/{strategy_id}", response_model=StrategySchema)
def update_strategy(
    strategy_id: int,
    strategy_update: StrategyUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    strategy = db.query(Strategy).filter(Strategy.id == strategy_id).first()
    if strategy is None:
        raise HTTPException(status_code=404, detail="Strategy not found")
    if strategy.created_by != current_user.id and current_user.role.value != "admin":
        raise HTTPException(status_code=403, detail="Not enough permissions")
    for field, value in strategy_update.dict(exclude_unset=True).items():
        setattr(strategy, field, value)
    db.commit()
    db.refresh(strategy)
    return strategy


@router.put("/{strategy_id}/file", response_model=StrategySchema)
async def update_strategy_file(
    strategy_id: int,
    name: str = Form(None),
    description: str = Form(None),
    file: UploadFile = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    strategy = db.query(Strategy).filter(Strategy.id == strategy_id).first()
    if strategy is None:
        raise HTTPException(status_code=404, detail="Strategy not found")

    if strategy.created_by != current_user.id and current_user.role.value != "admin":
        raise HTTPException(status_code=403, detail="Not enough permissions")

    if name is not None:
        strategy.name = name
    if description is not None:
        strategy.description = description

    if file is not None:
        ensure_storage_directory()
        safe_name = sanitize_filename(f"{strategy.name}_{file.filename}")
        new_path = safe_file_path(STORAGE_DIR, safe_name)
        with open(new_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        if file.content_type == "text/x-python" or file.filename.endswith(".py"):
            try:
                validation, content = _parse_and_validate_strategy(new_path, file.filename)
            except Exception:
                os.remove(new_path)
                raise HTTPException(status_code=422, detail={
                    "valid": False,
                    "errors": [{"field": "file", "error": "Failed to read file", "suggestion": ""}],
                    "warnings": [],
                })

            if not validation.valid:
                os.remove(new_path)
                raise HTTPException(status_code=422, detail=validation.to_dict())

            main_entry = _detect_main_entry(file.filename, validation.metadata)
            strategy.main_entry = main_entry
            strategy.strategy_files = json.dumps([{
                "filename": file.filename,
                "size": file.size,
                "is_main": main_entry == file.filename,
            }])

        # Guard old != new: same entity name + same filename produce the SAME
        # path, and removing it here would delete the file just written
        # (silent data loss on the most common "edit my strategy" flow).
        if strategy.file_path and strategy.file_path != new_path and os.path.exists(strategy.file_path):
            os.remove(strategy.file_path)
        strategy.file_path = new_path
        strategy.file_size = file.size
        strategy.file_type = file.content_type
        strategy.nb_files = 1
        strategy.version = (strategy.version or 0) + 1

    db.commit()
    db.refresh(strategy)
    return strategy


@router.delete("/{strategy_id}")
def delete_strategy(
    strategy_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    strategy = db.query(Strategy).filter(Strategy.id == strategy_id).first()
    if strategy is None:
        raise HTTPException(status_code=404, detail="Strategy not found")
    if strategy.created_by != current_user.id and current_user.role.value != "admin":
        raise HTTPException(status_code=403, detail="Not enough permissions")
    if os.path.exists(strategy.file_path):
        os.remove(strategy.file_path)
    db.delete(strategy)
    db.commit()
    return {"message": "Strategy deleted successfully"}


@router.get("/{strategy_id}/download")
def download_strategy(
    strategy_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    strategy = db.query(Strategy).filter(Strategy.id == strategy_id).first()
    if strategy is None:
        raise HTTPException(status_code=404, detail="Strategy not found")
    if not os.path.exists(strategy.file_path):
        raise HTTPException(status_code=404, detail="Strategy file not found")
    # Return the file itself rather than its server-side path. The previous
    # JSON {file_path, file_name} response left the client with an absolute
    # container path it could not fetch, and leaked the server layout.
    return FileResponse(
        path=strategy.file_path,
        filename=os.path.basename(strategy.file_path),
        media_type="text/x-python",
    )


CONTENT_PREVIEW_LIMIT = 100 * 1024  # 100 KB


@router.get("/{strategy_id}/content")
def get_strategy_content(
    strategy_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return strategy source for read-only preview. Truncates above 100 KB."""
    strategy = db.query(Strategy).filter(Strategy.id == strategy_id).first()
    if strategy is None:
        raise HTTPException(status_code=404, detail="Strategy not found")
    if not strategy.file_path or not os.path.exists(strategy.file_path):
        raise HTTPException(status_code=404, detail="Strategy file not found on disk")

    size = os.path.getsize(strategy.file_path)
    truncated = size > CONTENT_PREVIEW_LIMIT
    try:
        with open(strategy.file_path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read(CONTENT_PREVIEW_LIMIT)
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"Failed to read file: {e}")

    filename = os.path.basename(strategy.file_path)
    language = "python" if filename.endswith(".py") else "text"
    return {
        "filename": filename,
        "content": content,
        "language": language,
        "size": size,
        "truncated": truncated,
    }
