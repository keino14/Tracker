from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, require_csrf
from app.models import Habit, HabitLog, User
from app.schemas import HabitCreate, HabitOut, HabitUpdate, LogCreate, LogOut

router = APIRouter(prefix="/api", tags=["Привычки и отметки"])


def owned_habit(db: Session, habit_id: int, user_id: int) -> Habit:
    habit = db.scalar(select(Habit).where(Habit.id == habit_id, Habit.owner_id == user_id))
    if habit is None:
        raise HTTPException(status_code=404, detail="Привычка не найдена")
    return habit


def current_streak(days: set[date], today: date) -> int:
    cursor = today if today in days else today - timedelta(days=1)
    count = 0
    while cursor in days:
        count += 1
        cursor -= timedelta(days=1)
    return count


@router.get("/habits", response_model=list[HabitOut])
def list_habits(
    q: str | None = Query(default=None, max_length=80),
    active: bool | None = None,
    sort: str = Query(default="newest", pattern="^(newest|oldest|name)$"),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user), db: Session = Depends(get_db),
):
    stmt = select(Habit).where(Habit.owner_id == user.id)
    if q and q.strip():
        stmt = stmt.where(Habit.name.ilike(f"%{q.strip()}%"))
    if active is not None:
        stmt = stmt.where(Habit.is_active.is_(active))
    ordering = {"newest": Habit.created_at.desc(), "oldest": Habit.created_at.asc(), "name": Habit.name.asc()}[sort]
    return list(db.scalars(stmt.order_by(ordering, Habit.id.desc()).limit(limit).offset(offset)).all())


@router.post("/habits", response_model=HabitOut, status_code=status.HTTP_201_CREATED)
def create_habit(payload: HabitCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db), _: None = Depends(require_csrf)):
    habit = Habit(**payload.model_dump(), owner_id=user.id)
    db.add(habit)
    db.commit()
    db.refresh(habit)
    return habit


@router.get("/habits/{habit_id}", response_model=HabitOut)
def get_habit(habit_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return owned_habit(db, habit_id, user.id)


@router.patch("/habits/{habit_id}", response_model=HabitOut)
def update_habit(habit_id: int, payload: HabitUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db), _: None = Depends(require_csrf)):
    habit = owned_habit(db, habit_id, user.id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(habit, key, value.strip() if isinstance(value, str) else value)
    db.commit()
    db.refresh(habit)
    return habit


@router.delete("/habits/{habit_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_habit(habit_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db), _: None = Depends(require_csrf)):
    habit = owned_habit(db, habit_id, user.id)
    db.delete(habit)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/habits/{habit_id}/logs", response_model=list[LogOut])
def list_logs(habit_id: int, from_date: date | None = None, to_date: date | None = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    owned_habit(db, habit_id, user.id)
    stmt = select(HabitLog).join(Habit).where(Habit.id == habit_id, Habit.owner_id == user.id)
    if from_date:
        stmt = stmt.where(HabitLog.log_date >= from_date)
    if to_date:
        stmt = stmt.where(HabitLog.log_date <= to_date)
    return list(db.scalars(stmt.order_by(HabitLog.log_date.desc())).all())


@router.post("/habits/{habit_id}/logs", response_model=LogOut, status_code=status.HTTP_201_CREATED)
def create_log(habit_id: int, payload: LogCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db), _: None = Depends(require_csrf)):
    owned_habit(db, habit_id, user.id)
    existing = db.scalar(select(HabitLog).where(HabitLog.habit_id == habit_id, HabitLog.log_date == payload.log_date))
    if existing:
        return existing
    log = HabitLog(habit_id=habit_id, **payload.model_dump())
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


@router.delete("/logs/{log_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_log(log_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db), _: None = Depends(require_csrf)):
    log = db.scalar(select(HabitLog).join(Habit).where(HabitLog.id == log_id, Habit.owner_id == user.id))
    if log is None:
        raise HTTPException(status_code=404, detail="Отметка не найдена")
    db.delete(log)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/stats")
def statistics(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    habits = list(db.scalars(select(Habit).where(Habit.owner_id == user.id, Habit.is_active.is_(True))).all())
    grouped = db.execute(
        select(HabitLog.habit_id, func.count(HabitLog.id).label("completed"))
        .join(Habit, Habit.id == HabitLog.habit_id)
        .where(Habit.owner_id == user.id)
        .group_by(HabitLog.habit_id)
    ).all()
    counts = {habit_id: int(count) for habit_id, count in grouped}
    today = date.today()
    result = []
    for habit in habits:
        dates = set(db.scalars(select(HabitLog.log_date).where(HabitLog.habit_id == habit.id)).all())
        recent = [(today - timedelta(days=6 - index)).isoformat() for index in range(7)]
        result.append({"habit_id": habit.id, "completed_total": counts.get(habit.id, 0), "streak": current_streak(dates, today), "done_today": today in dates, "recent_days": [day in {item.isoformat() for item in dates} for day in recent]})
    total = sum(1 for item in result if item["done_today"])
    return {"total_habits": len(habits), "done_today": total, "completion_percent": round(total / len(habits) * 100) if habits else 0, "habits": result}
