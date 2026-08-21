import os
from functools import lru_cache
from pydantic_settings import BaseSettings
from supabase import create_client, Client
from dotenv import load_dotenv

# Carica il file .env se presente
load_dotenv()

class Settings(BaseSettings):
    supabase_url: str = os.getenv("SUPABASE_URL", "")
    supabase_anon_key: str = os.getenv("SUPABASE_ANON_KEY", "")
    supabase_service_role_key: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    allowed_origins: str = os.getenv(
        "ALLOWED_ORIGINS", 
        "http://localhost:3000,http://localhost:5500,http://127.0.0.1:5500,http://localhost:8000"
    )

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]

@lru_cache()
def get_settings() -> Settings:
    settings = Settings()
    if not settings.supabase_url or not settings.supabase_anon_key:
        print("[WARNING] SUPABASE_URL o SUPABASE_ANON_KEY non trovate in .env")
    return settings

settings = get_settings()

# Client standard (rispetta RLS)
supabase: Client = create_client(settings.supabase_url, settings.supabase_anon_key)

# Client con privilegi elevati (usato dal backend per logiche di acquisto, validazioni e controllo disponibilità)
supabase_admin: Client = create_client(
    settings.supabase_url,
    settings.supabase_service_role_key if settings.supabase_service_role_key else settings.supabase_anon_key
)