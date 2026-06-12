import os
from dataclasses import dataclass
from typing import Iterable, Optional

import httpx
from fastapi import Header, HTTPException

ROLES = {"user", "admin", "doctor", "superadmin"}

OWNED_RESOURCE_TABLES = {
    "feedback_event": "feedback_events",
    "lab_report": "lab_reports",
    "processing_job": "processing_jobs",
    "questionnaire_response": "questionnaire_responses",
    "report_file": "report_files",
    "user_health_profile": "user_health_profiles",
    "user_profile": "user_profiles",
}


@dataclass(frozen=True)
class CurrentUser:
    user_id: str
    email: str
    role: str


async def get_current_user(authorization: Optional[str] = Header(default=None)) -> CurrentUser:
    token = _bearer_token(authorization)
    if token is None:
        raise HTTPException(status_code=401, detail="Authentication required.")

    supabase_url = os.getenv("SUPABASE_URL")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not service_key:
        raise HTTPException(status_code=503, detail="Supabase auth is not configured.")

    async with httpx.AsyncClient(timeout=10) as client:
        user_response = await client.get(
            f"{supabase_url.rstrip('/')}/auth/v1/user",
            headers={"apikey": service_key, "Authorization": f"Bearer {token}"},
        )
        if user_response.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid authentication token.")

        payload = user_response.json()
        user_id = payload.get("id")
        email = payload.get("email")
        if not isinstance(user_id, str) or not isinstance(email, str):
            raise HTTPException(status_code=401, detail="Invalid authentication token.")

        role = await _fetch_role(client, supabase_url, service_key, user_id)
        return CurrentUser(user_id=user_id, email=email, role=role)


def require_authenticated_user(user: CurrentUser) -> CurrentUser:
    return user


def require_role(user: CurrentUser, role: str) -> CurrentUser:
    if user.role != role and user.role != "superadmin":
        raise HTTPException(status_code=403, detail="Role not allowed.")
    return user


def require_any_role(user: CurrentUser, roles: Iterable[str]) -> CurrentUser:
    allowed = set(roles)
    if user.role not in allowed and user.role != "superadmin":
        raise HTTPException(status_code=403, detail="Role not allowed.")
    return user


def require_admin_or_superadmin(user: CurrentUser) -> CurrentUser:
    return require_any_role(user, ["admin", "superadmin"])


async def require_doctor_assigned_to_report(user: CurrentUser, report_id: str) -> CurrentUser:
    if user.role == "superadmin" or user.role == "admin":
        return user
    if user.role != "doctor":
        raise HTTPException(status_code=403, detail="Doctor role required.")

    supabase_url = os.getenv("SUPABASE_URL")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not service_key:
        raise HTTPException(status_code=503, detail="Supabase auth is not configured.")

    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get(
            f"{supabase_url.rstrip('/')}/rest/v1/doctor_reviews",
            headers={"apikey": service_key, "Authorization": f"Bearer {service_key}"},
            params={
                "assigned_doctor_id": f"eq.{user.user_id}",
                "lab_report_id": f"eq.{report_id}",
                "select": "id",
            },
        )
        if response.status_code != 200 or not response.json():
            raise HTTPException(status_code=403, detail="Doctor is not assigned to this report.")

    return user


async def require_user_owns_resource(user: CurrentUser, resource_type: str, resource_id: str) -> CurrentUser:
    if user.role in {"admin", "superadmin"}:
        return user

    table = OWNED_RESOURCE_TABLES.get(resource_type)
    if table is None:
        raise HTTPException(status_code=400, detail="Unsupported resource type.")

    supabase_url = os.getenv("SUPABASE_URL")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not service_key:
        raise HTTPException(status_code=503, detail="Supabase auth is not configured.")

    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get(
            f"{supabase_url.rstrip('/')}/rest/v1/{table}",
            headers={"apikey": service_key, "Authorization": f"Bearer {service_key}"},
            params={
                "id": f"eq.{resource_id}",
                "select": "id,user_id",
                "user_id": f"eq.{user.user_id}",
            },
        )
        if response.status_code != 200 or not response.json():
            raise HTTPException(status_code=403, detail="Resource is not owned by this user.")

    return user


async def write_audit_log(
    *,
    action: str,
    actor_user: CurrentUser,
    metadata: dict[str, object],
    resource_id: Optional[str],
    resource_type: str,
) -> None:
    supabase_url = os.getenv("SUPABASE_URL")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not service_key:
        raise HTTPException(status_code=503, detail="Supabase auth is not configured.")

    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.post(
            f"{supabase_url.rstrip('/')}/rest/v1/audit_logs",
            headers={
                "apikey": service_key,
                "Authorization": f"Bearer {service_key}",
                "Content-Type": "application/json",
                "Prefer": "return=minimal",
            },
            json={
                "action": action,
                "actor_role": actor_user.role,
                "actor_user_id": actor_user.user_id,
                "entity_id": resource_id,
                "entity_type": resource_type,
                "metadata": metadata,
                "resource_id": resource_id,
                "resource_type": resource_type,
                "safe_metadata": metadata,
            },
        )
        if response.status_code not in {200, 201, 204}:
            raise HTTPException(status_code=503, detail="Unable to write audit log.")


def _bearer_token(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    prefix = "Bearer "
    if not authorization.startswith(prefix):
        return None
    token = authorization[len(prefix) :].strip()
    return token or None


async def _fetch_role(client: httpx.AsyncClient, supabase_url: str, service_key: str, user_id: str) -> str:
    response = await client.get(
        f"{supabase_url.rstrip('/')}/rest/v1/user_roles",
        headers={"apikey": service_key, "Authorization": f"Bearer {service_key}"},
        params={
            "user_id": f"eq.{user_id}",
            "revoked_at": "is.null",
            "select": "role,granted_at",
            "order": "granted_at.desc",
            "limit": "1",
        },
    )
    if response.status_code != 200:
        raise HTTPException(status_code=503, detail="Unable to resolve user role.")

    rows = response.json()
    role = rows[0].get("role") if rows else "user"
    return role if role in ROLES else "user"
