import os
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from config import settings
from routers import voli, prenotazioni, admin

# Import sicuro delle funzioni di generazione e monitoraggio flotta
try:
    from flight_scheduler import assicura_voli_del_giorno, elabora_avanzamento_flotta
    HAS_SCHEDULER = True
except ImportError:
    HAS_SCHEDULER = False


async def background_flight_worker():
    """
    Task asincrono in background che gira all'interno del server FastAPI.
    Controlla la generazione dei voli giornalieri (Lun-Ven 14-22) e l'avanzamento
    degli stati (Imbarco -> In Volo -> Atterrato) ogni 60 secondi.
    """
    print("[BACKGROUND WORKER] Inizializzazione Torre di Controllo integrata...")
    # Attesa iniziale di 3 secondi per consentire l'avvio completo del server
    await asyncio.sleep(3)
    
    while True:
        try:
            if HAS_SCHEDULER:
                # 1. Genera i voli di oggi se è un giorno feriale e non esistono ancora
                await assicura_voli_del_giorno()
                # 2. Aggiorna gli stati in tempo reale
                await elabora_avanzamento_flotta()
        except asyncio.CancelledError:
            print("[BACKGROUND WORKER] Arresto task in background.")
            break
        except Exception as e:
            print(f"[BACKGROUND WORKER ERROR]: {str(e)}")
            
        await asyncio.sleep(60)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Gestisce l'avvio e la chiusura pulita dei task in background su Render."""
    worker_task = asyncio.create_task(background_flight_worker())
    yield
    worker_task.cancel()
    try:
        await worker_task
    except asyncio.CancelledError:
        pass


app = FastAPI(
    title="LombardiAIR - Sistema Operativo Voli",
    description="Servizi API per la consultazione delle tratte, emissione titoli di viaggio e amministrazione flotta.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
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