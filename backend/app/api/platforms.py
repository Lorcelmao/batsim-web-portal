from typing import List
from fastapi import APIRouter, Depends, HTTPException, Response, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
import os
import shutil
from app.core.database import get_db
from app.core.config import settings
from app.core.list_helpers import apply_sort, set_total_count
from app.models.user import User
from app.models.platform import Platform
from app.schemas.platform import (
    Platform as PlatformSchema,
    PlatformUpdate,
    PlatformWithCreator,
)
from app.api.auth import get_current_user
from app.services.validators import validate_platform
from app.services.file_utils import sanitize_filename, safe_file_path

router = APIRouter()

STORAGE_DIR = os.path.join(settings.STORAGE_PATH, "platforms")

PLATFORM_SORT_FIELDS = {"id", "name", "created_at", "updated_at", "file_size"}


def ensure_storage_directory():
    os.makedirs(STORAGE_DIR, exist_ok=True)


def _parse_and_validate_platform(file_path: str):
    """Validate platform file and return validation result."""
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()
    return validate_platform(content), content


@router.get("/", response_model=List[PlatformWithCreator])
def get_platforms(
    response: Response,
    skip: int = 0,
    limit: int = 20,
    sort_by: str = "created_at",
    order: str = "desc",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    base = db.query(Platform)
    set_total_count(response, base.count())
    sorted_q = apply_sort(base, Platform, sort_by, order, PLATFORM_SORT_FIELDS)
    platforms = sorted_q.offset(skip).limit(limit).all()
    result = []
    for platform in platforms:
        platform_dict = PlatformWithCreator.from_orm(platform)
        if platform.creator:
            platform_dict.creator_username = platform.creator.username
        result.append(platform_dict)
    return result


@router.get("/{platform_id}", response_model=PlatformWithCreator)
def get_platform(
    platform_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    platform = db.query(Platform).filter(Platform.id == platform_id).first()
    if platform is None:
        raise HTTPException(status_code=404, detail="Platform not found")
    platform_dict = PlatformWithCreator.from_orm(platform)
    if platform.creator:
        platform_dict.creator_username = platform.creator.username
    return platform_dict


@router.post("/", response_model=PlatformSchema)
async def create_platform(
    name: str = Form(...),
    description: str = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ensure_storage_directory()

    if db.query(Platform).filter(Platform.name == name).first():
        raise HTTPException(status_code=400, detail="Platform with this name already exists")

    if not (file.content_type == "application/xml" or file.filename.endswith(".xml")):
        raise HTTPException(status_code=422, detail={
            "valid": False,
            "errors": [{"field": "file", "error": "Platform must be an XML file (.xml)",
                        "suggestion": "Upload a SimGrid XML platform file"}],
            "warnings": [],
        })

    # Save file (sanitize filename to prevent path traversal)
    safe_name = sanitize_filename(f"{name}_{file.filename}")
    file_path = safe_file_path(STORAGE_DIR, safe_name)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Validate
    try:
        validation, content = _parse_and_validate_platform(file_path)
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

    platform = Platform(
        name=name,
        description=description,
        file_path=file_path,
        file_size=file.size,
        file_type=file.content_type,
        created_by=current_user.id,
        # Schedulable host count (cluster radical expanded, master excluded) —
        # falls back to raw <host> tag count for pre-fix validator results
        nb_hosts=validation.metadata.get(
            "nb_compute_hosts", validation.metadata.get("nb_hosts")
        ),
        nb_clusters=validation.metadata.get("nb_clusters"),
        platform_config=content,
        version=1,
    )
    db.add(platform)
    db.commit()
    db.refresh(platform)
    return platform


@router.put("/{platform_id}", response_model=PlatformSchema)
def update_platform(
    platform_id: int,
    platform_update: PlatformUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    platform = db.query(Platform).filter(Platform.id == platform_id).first()
    if platform is None:
        raise HTTPException(status_code=404, detail="Platform not found")
    if platform.created_by != current_user.id and current_user.role.value != "admin":
        raise HTTPException(status_code=403, detail="Not enough permissions")
    for field, value in platform_update.dict(exclude_unset=True).items():
        setattr(platform, field, value)
    db.commit()
    db.refresh(platform)
    return platform


@router.put("/{platform_id}/file", response_model=PlatformSchema)
async def update_platform_file(
    platform_id: int,
    name: str = Form(None),
    description: str = Form(None),
    file: UploadFile = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    platform = db.query(Platform).filter(Platform.id == platform_id).first()
    if platform is None:
        raise HTTPException(status_code=404, detail="Platform not found")

    if platform.created_by != current_user.id and current_user.role.value != "admin":
        raise HTTPException(status_code=403, detail="Not enough permissions")

    if name is not None:
        platform.name = name
    if description is not None:
        platform.description = description

    if file is not None:
        ensure_storage_directory()
        safe_name = sanitize_filename(f"{platform.name}_{file.filename}")
        new_path = safe_file_path(STORAGE_DIR, safe_name)
        with open(new_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        if file.content_type == "application/xml" or file.filename.endswith(".xml"):
            try:
                validation, content = _parse_and_validate_platform(new_path)
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

            platform.nb_hosts = validation.metadata.get(
                "nb_compute_hosts", validation.metadata.get("nb_hosts")
            )
            platform.nb_clusters = validation.metadata.get("nb_clusters")
            platform.platform_config = content

        # Guard old != new: same name + same filename map to the SAME path -
        # removing it would delete the file just written (silent data loss)
        if platform.file_path and platform.file_path != new_path and os.path.exists(platform.file_path):
            os.remove(platform.file_path)
        platform.file_path = new_path
        platform.file_size = file.size
        platform.file_type = file.content_type
        platform.version = (platform.version or 0) + 1

    db.commit()
    db.refresh(platform)
    return platform


@router.delete("/{platform_id}")
def delete_platform(
    platform_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    platform = db.query(Platform).filter(Platform.id == platform_id).first()
    if platform is None:
        raise HTTPException(status_code=404, detail="Platform not found")
    if platform.created_by != current_user.id and current_user.role.value != "admin":
        raise HTTPException(status_code=403, detail="Not enough permissions")
    if os.path.exists(platform.file_path):
        os.remove(platform.file_path)
    db.delete(platform)
    db.commit()
    return {"message": "Platform deleted successfully"}


@router.get("/{platform_id}/download")
def download_platform(
    platform_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    platform = db.query(Platform).filter(Platform.id == platform_id).first()
    if platform is None:
        raise HTTPException(status_code=404, detail="Platform not found")
    if not os.path.exists(platform.file_path):
        raise HTTPException(status_code=404, detail="Platform file not found")
    # Return the file itself rather than its server-side path. The previous
    # JSON {file_path, file_name} response left the client with an absolute
    # container path it could not fetch, and leaked the server layout.
    return FileResponse(
        path=platform.file_path,
        filename=os.path.basename(platform.file_path),
        media_type="application/xml",
    )
