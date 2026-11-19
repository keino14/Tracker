# # HabitFlow — трекер привычек

**Учебная практика · 3 курс · вариант №3**  
Клиент-серверное веб-приложение для личного учёта привычек и ежедневных отметок.

- **Студент:**Бармин Захар Викторович
- **Группа:** ИСиП-1-9-24
- **Тема:** трекер привычек (Привычка, Отметка)

## Возможности

- регистрация, вход, выход и просмотр текущего пользователя;
- создание, просмотр, изменение и удаление привычек;
- ежедневная отметка выполнения и снятие отметки; календарь отметок за последние 7 дней;
- история отметок по датам и подсчёт серии дней подряд;
- поиск по названию, фильтр активных привычек, сортировка и пагинация;
- статистика: число выполнений, активные привычки, выполнение за сегодня;
- адаптивный интерфейс для мобильных устройств от 360 px;
- отдельные данные для каждого пользователя.

## Стек

Python 3.11+, FastAPI, Pydantic v2, SQLAlchemy 2.0, SQLite, Alembic, HTML, CSS и JavaScript без frontend-фреймворков.

## Установка и запуск

```bash
# 1. Создать виртуальное окружение
python -m venv .venv

# Windows PowerShell
.venv\Scripts\Activate.ps1
# macOS / Linux
source .venv/bin/activate

# 2. Установить зависимости
python -m pip install --upgrade pip
pip install -r requirements.txt

# 3. Задать секретный ключ (обязательно для production)
# Скопируйте .env.example в .env и задайте SECRET_KEY случайной строкой.
# Пример генерации: python -c "import secrets; print(secrets.token_urlsafe(48))"
# Приложение читает переменные окружения; .env автоматически не загружается.

# PowerShell (для текущего терминала)
$env:SECRET_KEY = (python -c "import secrets; print(secrets.token_urlsafe(48))")
# macOS / Linux
export SECRET_KEY="$(python -c 'import secrets; print(secrets.token_urlsafe(48))')"

# 4. Создать таблицы миграцией Alembic
alembic upgrade head

# 5. Запустить сервер
uvicorn app.main:app --reload
```

Откройте http://127.0.0.1:8000. Документация API доступна по адресу http://127.0.0.1:8000/docs.

Для production установите `APP_ENV=production`, задайте уникальный `SECRET_KEY`, используйте HTTPS и `COOKIE_SECURE=true`. Не публикуйте секретный ключ.

## Структура проекта

```text
habit-tracker/
├── app/
│   ├── main.py             # приложение, middleware, StaticFiles
│   ├── config.py           # настройки и секретный ключ
│   ├── database.py         # engine, SessionLocal, Base, get_db
│   ├── models.py           # User, Habit, HabitLog
│   ├── schemas.py          # Pydantic Create / Update / Out
│   ├── security.py         # хеширование паролей (scrypt + соль)
│   ├── deps.py             # get_current_user, CSRF
│   └── routers/
│       ├── auth.py         # регистрация, вход, выход, /me
│       └── habits.py       # привычки, отметки, статистика
├── static/
│   ├── index.html
│   ├── login.html
│   ├── register.html
│   ├── css/style.css
│   └── js/{app,auth}.js
├── migrations/
│   ├── env.py
│   └── versions/0001_initial.py
├── tests/
├── alembic.ini
├── requirements.txt
└── README.md
```

## Схема базы данных

```text
User (1) ─────────── (N) Habit (1) ─────────── (N) HabitLog
 id PK                     id PK                       id PK
 username UNIQUE           owner_id FK → User.id       habit_id FK → Habit.id
 password_hash              name                        log_date
 created_at                 description                 note
                            category                     created_at
                            color                        UNIQUE(habit_id, log_date)
                            target_per_week
                            is_active
                            created_at
```

`owner_id` привычки назначается только из авторизованной сессии. У `HabitLog` связь с владельцем проверяется через JOIN с `Habit`. Уникальность пары `habit_id + log_date` не позволяет создать две отметки одной привычки за день.

## API

Все маршруты `/api/habits`, `/api/logs` и `/api/stats` требуют авторизации. Для POST/PATCH/DELETE передаётся `X-CSRF-Token`, полученный через `/api/auth/csrf`.

| Метод | URL | Назначение | Ответы |
|---|---|---|---|
| GET | `/api/auth/csrf` | Получить CSRF-токен | 200 |
| POST | `/api/auth/register` | Регистрация | 201, 409, 422 |
| POST | `/api/auth/login` | Вход | 200, 401, 422 |
| POST | `/api/auth/logout` | Выход | 204, 401, 403 |
| GET | `/api/auth/me` | Текущий пользователь | 200, 401 |
| GET | `/api/habits` | Список, поиск, фильтр, сортировка, пагинация | 200, 401, 422 |
| POST | `/api/habits` | Создать привычку | 201, 401, 422 |
| GET | `/api/habits/{id}` | Получить привычку | 200, 401, 404 |
| PATCH | `/api/habits/{id}` | Изменить привычку | 200, 401, 404, 422 |
| DELETE | `/api/habits/{id}` | Удалить привычку | 204, 401, 404 |
| GET | `/api/habits/{id}/logs` | Список отметок привычки | 200, 401, 404 |
| POST | `/api/habits/{id}/logs` | Создать отметку за дату | 201, 401, 404, 422 |
| DELETE | `/api/logs/{id}` | Удалить свою отметку | 204, 401, 404 |
| GET | `/api/stats` | Статистика и серии дней | 200, 401 |
| GET | `/health` | Проверка доступности | 200 |

Параметры списка привычек: `q`, `active`, `sort` (`newest`, `oldest`, `name`), `limit` (1–100), `offset`.

## Безопасность

- Пароли не хранятся в открытом виде: используется `hashlib.scrypt` с индивидуальной случайной солью и сравнением через `hmac.compare_digest`.
- В подписанной cookie `SessionMiddleware` хранится только идентификатор пользователя и CSRF-токен. JWT не используется.
- Все запросы к данным фильтруются по `owner_id`; чужая привычка/отметка возвращает 404.
- CSRF-токен обязателен для запросов, меняющих состояние; дополнительно проверяется Origin.
- Пользовательский текст отображается через `textContent` / `createElement`, а не через `innerHTML`.
- CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` и `Cache-Control: no-store` для API.
- Секрет берётся из окружения; production запуск с небезопасным/коротким ключом запрещён.
- База данных, окружения и `.env` исключены из Git.

## Проверка

1. Зарегистрируйте два аккаунта в разных браузерах/профилях.
2. На первом аккаунте создайте привычку и отметку.
3. На втором аккаунте убедитесь, что список пуст и запрос к ID первой привычки возвращает 404.
4. Проверьте создание, PATCH и удаление привычки, отметку сегодня и снятие отметки.
5. Проверьте поиск, фильтр, сортировку и `limit`/`offset` через интерфейс или `/docs`.
6. Убедитесь, что без входа API данных отвечает 401.
