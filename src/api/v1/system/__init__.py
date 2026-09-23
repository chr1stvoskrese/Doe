"""Системные роутеры: vault, security, settings, attachments, stats, reminders, search, graph, calendar, fonts."""
from fastapi import APIRouter

from src.api.v1.system import vault, security, settings, attachments, stats
from src.api.v1.system import reminders, search, graph, calendar, fonts
from src.api.v1.system.attachments import get_pdfjs_dir, PDFJS_FILES

router = APIRouter(prefix="/system", tags=["system"])
router.include_router(vault.router)
router.include_router(security.router)
router.include_router(settings.router)
router.include_router(attachments.router)
router.include_router(stats.router)
router.include_router(reminders.router)
router.include_router(search.router)
router.include_router(graph.router)
router.include_router(calendar.router)
router.include_router(fonts.router)

__all__ = ["router", "get_pdfjs_dir", "PDFJS_FILES"]
