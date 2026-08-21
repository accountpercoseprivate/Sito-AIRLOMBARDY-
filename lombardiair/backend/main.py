import os
from fastapi import FastAPI
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

# Registrazione dei router API
app.include_router(voli.router, prefix="/api/v1/voli", tags=["Tratte e Voli"])
app.include_router(prenotazioni.router, prefix="/api/v1/prenotazioni", tags=["Prenotazioni & Check-in"])
app.include_router(admin.router, prefix="/api/v1/admin", tags=["Amministrazione Flotta"])

# Endpoint per UptimeRobot
@app.get("/health", tags=["Health Check"])
async def health():
    return {"status": "healthy"}

# Serve automaticamente il Frontend HTML/JS/CSS sulla radice "/"
current_dir = os.path.dirname(os.path.abspath(__file__))
frontend_dir = os.path.abspath(os.path.join(current_dir, "..", "frontend"))

if not os.path.exists(frontend_dir):
    frontend_dir = os.path.abspath(os.path.join(current_dir, "frontend"))

if os.path.exists(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")