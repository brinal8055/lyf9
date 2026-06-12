import asyncio

import pytest
from fastapi import HTTPException

from app.auth import (
    CurrentUser,
    get_current_user,
    require_admin_or_superadmin,
    require_user_owns_resource,
    write_audit_log,
)


def test_get_current_user_rejects_missing_token() -> None:
    with pytest.raises(HTTPException) as caught:
        asyncio.run(get_current_user(None))

    assert caught.value.status_code == 401


def test_require_admin_or_superadmin_rejects_user() -> None:
    user = CurrentUser(user_id="user-1", email="beta@example.com", role="user")

    with pytest.raises(HTTPException) as caught:
        require_admin_or_superadmin(user)

    assert caught.value.status_code == 403


def test_get_current_user_fails_closed_without_supabase_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)

    with pytest.raises(HTTPException) as caught:
        asyncio.run(get_current_user("Bearer token"))

    assert caught.value.status_code == 503


def test_get_current_user_resolves_role_from_trusted_db(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-role")
    calls: list[str] = []

    class FakeResponse:
        def __init__(self, status_code: int, payload: object) -> None:
            self.status_code = status_code
            self._payload = payload

        def json(self) -> object:
            return self._payload

    class FakeAsyncClient:
        def __init__(self, timeout: int) -> None:
            self.timeout = timeout

        async def __aenter__(self) -> "FakeAsyncClient":
            return self

        async def __aexit__(self, *args: object) -> None:
            return None

        async def get(self, url: str, **kwargs: object) -> FakeResponse:
            calls.append(url)
            if url.endswith("/auth/v1/user"):
                return FakeResponse(
                    200,
                    {
                        "app_metadata": {"role": "admin"},
                        "email": "doctor@example.com",
                        "id": "doctor-1",
                    },
                )
            return FakeResponse(200, [{"granted_at": "2026-06-06T00:00:00Z", "role": "doctor"}])

    monkeypatch.setattr("app.auth.httpx.AsyncClient", FakeAsyncClient)

    user = asyncio.run(get_current_user("Bearer user-jwt"))

    assert user.role == "doctor"
    assert calls == [
        "https://example.supabase.co/auth/v1/user",
        "https://example.supabase.co/rest/v1/user_roles",
    ]


def test_require_user_owns_resource_rejects_cross_user_access(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-role")
    user = CurrentUser(user_id="user-a", email="user-a@example.com", role="user")

    class FakeResponse:
        status_code = 200

        def json(self) -> list[object]:
            return []

    class FakeAsyncClient:
        def __init__(self, timeout: int) -> None:
            self.timeout = timeout

        async def __aenter__(self) -> "FakeAsyncClient":
            return self

        async def __aexit__(self, *args: object) -> None:
            return None

        async def get(self, url: str, **kwargs: object) -> FakeResponse:
            return FakeResponse()

    monkeypatch.setattr("app.auth.httpx.AsyncClient", FakeAsyncClient)

    with pytest.raises(HTTPException) as caught:
        asyncio.run(require_user_owns_resource(user, "report_file", "report-b"))

    assert caught.value.status_code == 403


def test_write_audit_log_uses_safe_metadata(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-role")
    captured: dict[str, object] = {}

    class FakeResponse:
        status_code = 201

    class FakeAsyncClient:
        def __init__(self, timeout: int) -> None:
            self.timeout = timeout

        async def __aenter__(self) -> "FakeAsyncClient":
            return self

        async def __aexit__(self, *args: object) -> None:
            return None

        async def post(self, url: str, **kwargs: object) -> FakeResponse:
            captured["url"] = url
            captured["json"] = kwargs["json"]
            return FakeResponse()

    monkeypatch.setattr("app.auth.httpx.AsyncClient", FakeAsyncClient)
    user = CurrentUser(user_id="admin-1", email="admin@example.com", role="admin")

    asyncio.run(
        write_audit_log(
            action="admin_privileged_action",
            actor_user=user,
            metadata={"reportFileId": "report-1"},
            resource_id="report-1",
            resource_type="report_file",
        )
    )

    payload = captured["json"]
    assert isinstance(payload, dict)
    assert payload["safe_metadata"] == {"reportFileId": "report-1"}
    assert payload["metadata"] == {"reportFileId": "report-1"}
