"""Text extraction for indexed documents.

Tries native PDF text first (pypdf). Falls back to OCR (pytesseract) for
scanned pages / image files, since a large fraction of the DOJ disclosures
are scanned paper records with no embedded text layer.
"""
from pathlib import Path

from pypdf import PdfReader

IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp"}


def _ocr_image(path: Path) -> str:
    try:
        import pytesseract
        from PIL import Image
    except ImportError:
        return ""
    try:
        return pytesseract.image_to_string(Image.open(path))
    except Exception:
        # Tesseract binary may not be installed; OCR is best-effort.
        return ""


def _extract_pdf(path: Path) -> str:
    try:
        reader = PdfReader(str(path))
    except Exception:
        return ""

    chunks = []
    for page in reader.pages:
        try:
            text = page.extract_text() or ""
        except Exception:
            text = ""
        chunks.append(text)

    joined = "\n".join(chunks).strip()
    if joined:
        return joined

    # No embedded text layer -> likely a scanned document. OCR each page
    # image if pdf2image/poppler is available; otherwise give up quietly.
    try:
        from pdf2image import convert_from_path
        import pytesseract
    except ImportError:
        return ""
    try:
        pages = convert_from_path(str(path))
    except Exception:
        return ""
    return "\n".join(pytesseract.image_to_string(p) for p in pages)


def extract_text(path: Path) -> str:
    path = Path(path)
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        return _extract_pdf(path)
    if suffix in IMAGE_SUFFIXES:
        return _ocr_image(path)
    if suffix in {".txt", ".md"}:
        return path.read_text(errors="ignore")
    return ""
