import os
from fastapi import FastAPI, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from config import settings
from routers import voli, prenotazioni, admin

app = FastAPI(
    title="LombardiAIR - Sistema Operativo Voli",
    description="Servizi API per la consultazione delle tratte, emissione titoli di viaggio e amministrazione flotta.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Configurazione CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =============================================================================
# ENDPOINT PER UPTIMEROBOT & HEALTH CHECK (Supporta sia GET che HEAD)
# =============================================================================
@app.api_route("/health", methods=["GET", "HEAD"], tags=["Health Check"], status_code=status.HTTP_200_OK)
@app.api_route("/healthz", methods=["GET", "HEAD"], include_in_schema=False, status_code=status.HTTP_200_OK)
async def health():
    """Risponde a UptimeRobot e ai controlli di integrità di Render."""
    return {"status": "healthy", "service": "LombardiAIR"}


# =============================================================================
# REGISTRAZIONE DEI ROUTER API
# =============================================================================
app.include_router(voli.router, prefix="/api/v1/voli", tags=["Tratte e Voli"])
app.include_router(prenotazioni.router, prefix="/api/v1/prenotazioni", tags=["Prenotazioni & Check-in"])
app.include_router(admin.router, prefix="/api/v1/admin", tags=["Amministrazione Flotta"])


# =============================================================================
# SERVE IL FRONTEND STATIC FILES SULLA ROOT "/"
# =============================================================================
current_dir = os.path.dirname(os.path.abspath(__file__))
frontend_dir = os.path.abspath(os.path.join(current_dir, "..", "frontend"))

if not os.path.exists(frontend_dir):
    frontend_dir = os.path.abspath(os.path.join(current_dir, "frontend"))

if os.path.exists(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")