from fastapi import APIRouter, Depends

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.database import get_session

router = APIRouter(tags=["graph"])


@router.get("/graph")
async def get_graph(db: AsyncSession = Depends(get_session)):
    """Возвращает граф связей: узлы (карточки) и рёбра (связи родитель → потомок)."""
    edges_res = await db.execute(text("SELECT parent_id, child_id FROM task_relations"))
    edge_rows = edges_res.fetchall()

    edges = []
    degree = {}
    for r in edge_rows:
        pid, cid = r[0], r[1]
        edges.append({"source": pid, "target": cid})
        degree[pid] = degree.get(pid, 0) + 1
        degree[cid] = degree.get(cid, 0) + 1

    # Берём ВСЕ карточки (а не только участвующие в связях),
    # чтобы одиночные карточки показывались отдельными точками (degree = 0).
    nodes = []
    nodes_res = await db.execute(text("""
        SELECT t.id, t.title, t.column_id, c.workspace_id
        FROM tasks t
        JOIN columns c ON t.column_id = c.id
    """))
    for row in nodes_res.fetchall():
        nodes.append({
            "id": row[0],
            "title": row[1],
            "column_id": row[2],
            "workspace_id": row[3],
            "degree": degree.get(row[0], 0)
        })

    return {"nodes": nodes, "edges": edges}
