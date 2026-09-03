import os

from fastapi import FastAPI

app = FastAPI(title="Lyf9 AI API", version="0.1.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "api"}


@app.get("/health/deep")
def deep_health() -> dict[str, object]:
    ai_provider = os.getenv("AI_PROVIDER", "mock").strip().lower()
    ai_provider_supported = ai_provider in ("gemini", "mock", "openai")
    ai_prefix = ai_provider.upper()
    local_like = os.getenv("APP_ENV", "development").lower() in ("local", "development", "test")
    ai_configured = ai_provider_supported and (
        local_like if ai_provider == "mock" else bool(
            os.getenv(f"{ai_prefix}_API_KEY")
            and os.getenv(f"{ai_prefix}_MODEL_EXTRACTION")
            and os.getenv(f"{ai_prefix}_MODEL_EXPLANATION")
        )
    )
    return {
        "status": "ok",
        "service": "api",
        "checks": {
            "database_configured": bool(os.getenv("DATABASE_URL")),
            "redis_configured": bool(os.getenv("REDIS_URL")),
            "storage_configured": bool(os.getenv("S3_REPORT_BUCKET") or os.getenv("STORAGE_PROVIDER") == "local"),
            "supabase_url_configured": bool(os.getenv("SUPABASE_URL")),
            "supabase_service_role_configured": bool(os.getenv("SUPABASE_SERVICE_ROLE_KEY")),
            "beta_invite_required": os.getenv("BETA_INVITE_REQUIRED", "true").lower() == "true",
            "admin_allowlist_configured": bool(os.getenv("ADMIN_ALLOWLIST")),
            "ai_configured": ai_configured,
            "ai_provider": ai_provider,
            "email_configured": bool(os.getenv("EMAIL_PROVIDER")),
            "sentry_configured": bool(os.getenv("SENTRY_DSN")),
        },
    }


if __name__ == "__main__":
    print(health())
