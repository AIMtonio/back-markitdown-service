import logging
import os
import tempfile
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, FastAPI, File, HTTPException, Query, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response
from markitdown import MarkItDown

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("markitdown-service")

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".pptx", ".xlsx", ".xls"}
MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "25"))
MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024
CHUNK_SIZE = 1024 * 1024

app = FastAPI(title="MarkItDown Service", docs_url="/api/docs", openapi_url="/api/openapi.json")
router = APIRouter(prefix="/api")
converter = MarkItDown(enable_plugins=False)


@router.get("/health")
def health():
    return {"status": "ok"}


@router.get("/formats")
def formats():
    return {"extensions": sorted(ALLOWED_EXTENSIONS), "max_upload_mb": MAX_UPLOAD_MB}


@router.post("/convert")
async def convert(
    file: UploadFile = File(...),
    download: bool = Query(False, description="Regresa el .md como archivo adjunto en lugar de JSON"),
):
    filename = Path(file.filename or "documento").name
    extension = Path(filename).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=415,
            detail=f"Formato no soportado: '{extension or 'sin extensión'}'. Permitidos: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    # Se guarda en disco por bloques para no cargar archivos grandes en memoria y cortar si exceden el límite.
    with tempfile.NamedTemporaryFile(suffix=extension, delete=False) as tmp:
        tmp_path = Path(tmp.name)
        size = 0
        while chunk := await file.read(CHUNK_SIZE):
            size += len(chunk)
            if size > MAX_UPLOAD_BYTES:
                tmp.close()
                tmp_path.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail=f"El archivo excede el límite de {MAX_UPLOAD_MB} MB")
            tmp.write(chunk)

    try:
        result = await run_in_threadpool(converter.convert, str(tmp_path))
    except Exception as exc:
        logger.exception("Error convirtiendo %s", filename)
        raise HTTPException(status_code=422, detail=f"No se pudo convertir el archivo: {exc}") from exc
    finally:
        tmp_path.unlink(missing_ok=True)

    markdown = result.text_content or ""
    md_filename = f"{Path(filename).stem}.md"
    logger.info("Convertido %s (%d bytes) -> %d caracteres", filename, size, len(markdown))

    if download:
        return Response(
            content=markdown.encode("utf-8"),
            media_type="text/markdown; charset=utf-8",
            headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(md_filename)}"},
        )

    return {"filename": md_filename, "source": filename, "size_bytes": size, "markdown": markdown}


app.include_router(router)
