from datetime import date, datetime
from pydantic import BaseModel, ConfigDict, Field, field_validator


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=30, pattern=r"^[A-Za-zА-Яа-яЁё0-9_.-]+$")
    password: str = Field(min_length=10, max_length=128)


class UserOut(BaseModel):
    id: int
    username: str
    model_config = ConfigDict(from_attributes=True)


class HabitCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=240)
    category: str = Field(default="Личное", min_length=1, max_length=40)
    color: str = Field(default="#6b8afd", pattern=r"^#[0-9a-fA-F]{6}$")
    target_per_week: int = Field(default=7, ge=1, le=7)
    is_active: bool = True

    @field_validator("name", "category")
    @classmethod
    def strip_required(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Поле не может быть пустым")
        return value


class HabitUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=240)
    category: str | None = Field(default=None, min_length=1, max_length=40)
    color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    target_per_week: int | None = Field(default=None, ge=1, le=7)
    is_active: bool | None = None


class HabitOut(BaseModel):
    id: int
    name: str
    description: str
    category: str
    color: str
    target_per_week: int
    is_active: bool
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class LogCreate(BaseModel):
    log_date: date = Field(default_factory=date.today)
    note: str = Field(default="", max_length=240)


class LogOut(BaseModel):
    id: int
    habit_id: int
    log_date: date
    note: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)
