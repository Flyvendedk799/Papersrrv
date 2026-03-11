"""
Export service for MyMetaView 4.0 — AIL-123 (P7)

Builds on P3 batch API. Validates preview URLs belong to tenant; generates PDF/ZIP; streams PNG.
Copy to: backend/services/export_service.py

Dependencies: pip install requests img2pdf Pillow
"""
import io
import re
import zipfile
from typing import Callable, List, Optional

import requests

try:
    import img2pdf
except ImportError:
    img2pdf = None
try:
    from PIL import Image
except ImportError:
    Image = None

MAX_PDF_PAGES = 50
MAX_ZIP_FILES = 50
PNG_FILENAME = "mymetaview-preview.png"
PDF_DEFAULT_FILENAME = "mymetaview-previews.pdf"
ZIP_DEFAULT_FILENAME = "mymetaview-previews.zip"


def validate_preview_url_ownership(
    preview_url: str,
    tenant_id: str,
    validator: Optional[Callable[[str, str], bool]] = None,
) -> bool:
    """
    Validate that preview_url was generated for the tenant (via job ownership).

    Integrator must provide validator(url, tenant_id) that:
    - Returns True if preview_url appears in result_urls of any job owned by tenant_id
    - Returns False otherwise

    If validator is None, returns True (bypass for dev; implement in production).
    """
    if validator is not None:
        return validator(preview_url, tenant_id)
    return True


def validate_urls_ownership(
    preview_urls: List[str],
    tenant_id: str,
    validator: Optional[Callable[[str, str], bool]] = None,
) -> tuple[bool, Optional[str]]:
    """
    Validate all URLs belong to tenant. Returns (True, None) or (False, error_message).
    """
    if not preview_urls:
        return False, "preview_urls cannot be empty"
    if len(preview_urls) > MAX_PDF_PAGES:
        return False, f"Maximum {MAX_PDF_PAGES} URLs allowed"
    for url in preview_urls:
        if not url or not isinstance(url, str):
            return False, "Invalid URL in preview_urls"
        if not _is_safe_url(url):
            return False, f"Invalid or disallowed URL: {url[:80]}..."
        if not validate_preview_url_ownership(url, tenant_id, validator):
            return False, f"URL not owned by tenant: {url[:80]}..."
    return True, None


def _is_safe_url(url: str) -> bool:
    """Reject file://, javascript:, data:, etc."""
    u = url.strip().lower()
    if not u.startswith(("http://", "https://")):
        return False
    return True


def _safe_filename(idx: int, total: int) -> str:
    """Generate safe filename for ZIP entries."""
    return f"preview_{idx + 1}.png"


def fetch_image_bytes(url: str, timeout: int = 30) -> bytes:
    """
    Fetch image bytes from preview URL. Raises requests.RequestException on failure.
    """
    r = requests.get(url, timeout=timeout, stream=True)
    r.raise_for_status()
    return r.content


def build_pdf(
    preview_urls: List[str],
    filename: str = PDF_DEFAULT_FILENAME,
    timeout: int = 30,
) -> tuple[bytes, str]:
    """
    Build PDF from preview images (one per page). Returns (pdf_bytes, filename).
    Uses img2pdf if available, else Pillow fallback.
    """
    images_data = [fetch_image_bytes(url, timeout=timeout) for url in preview_urls]
    if img2pdf:
        pdf_bytes = img2pdf.convert(images_data)
    elif Image:
        imgs = [Image.open(io.BytesIO(d)).convert("RGB") for d in images_data]
        buf = io.BytesIO()
        imgs[0].save(buf, "PDF", save_all=True, append_images=imgs[1:])
        pdf_bytes = buf.getvalue()
    else:
        raise RuntimeError("Install img2pdf or Pillow: pip install img2pdf pillow")
    return pdf_bytes, _sanitize_filename(filename, ".pdf")


def build_zip(
    preview_urls: List[str],
    filename: str = ZIP_DEFAULT_FILENAME,
    timeout: int = 30,
) -> tuple[bytes, str]:
    """
    Build ZIP archive of PNG images. Returns (zip_bytes, filename).
    """
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for i, url in enumerate(preview_urls):
            data = fetch_image_bytes(url, timeout=timeout)
            name = _safe_filename(i, len(preview_urls))
            zf.writestr(name, data)
    return buf.getvalue(), _sanitize_filename(filename, ".zip")


def _sanitize_filename(name: str, suffix: str) -> str:
    """Ensure filename is safe and has correct extension."""
    base = re.sub(r"[^\w\-.]", "_", name)[:80]
    if not base:
        base = "mymetaview-previews"
    if not base.endswith(suffix):
        base += suffix
    return base
