from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, require_csrf
from app.models import User
from app.schemas import UserCreate, UserOut
from app.security import hash_password, new_csrf_token, verify_password

router = APIRouter(prefix="/api/auth", tags=["Авторизация"])


@router.get("/csrf")
def csrf(request: Request):
    token = request.session.get("csrf_token")
    if not token:
        token = new_csrf_token()
        request.session["csrf_token"] = token
    return {"csrf_token": token}


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(payload: UserCreate, request: Request, db: Session = Depends(get_db), _: None = Depends(require_csrf)):
    username = payload.username.strip()
    if db.scalar(select(User).where(User.username == username)):
        raise HTTPException(status_code=409, detail="Такой логин уже занят")
    user = User(username=username, password_hash=hash_password(payload.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    request.session.clear()
    request.session["user_id"] = user.id
    request.session["csrf_token"] = new_csrf_token()
    return user


@router.post("/login", response_model=UserOut)
def login(payload: UserCreate, request: Request, db: Session = Depends(get_db), _: None = Depends(require_csrf)):
    user = db.scalar(select(User).where(User.username == payload.username.strip()))
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")
    request.session.clear()
    request.session["user_id"] = user.id
    request.session["csrf_token"] = new_csrf_token()
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, _: User = Depends(get_current_user), __: None = Depends(require_csrf)):
    request.session.clear()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user
