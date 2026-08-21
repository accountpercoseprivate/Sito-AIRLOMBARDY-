from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config import settings
from routers import voli, prenotazioni, admin

app = FastAPI(
    title="LombardiAIR - Sistema Operativo Voli",
    description="Servizi API per la consultazione delle tratte, emissione titoli di viaggio e amministrazione flotta.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Configurazione CORS per abilitare le chiamate dal frontend Vanilla JS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins if settings.cors_origins else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Registrazione dei router modulari
app.include_router(voli.router, prefix="/api/v1/voli", tags=["Tratte e Voli"])
app.include_router(prenotazioni.router, prefix="/api/v1/prenotazioni", tags=["Prenotazioni & Check-in"])
app.include_router(admin.router, prefix="/api/v1/admin", tags=["Amministrazione Flotta"])

@app.get("/", tags=["Health Check"])
async def root():
    return {
        "status": "online",
        "ente": "LombardiAIR - Servizi di Trasporto Aereo Regionale",
        "api_docs": "/docs",
        "versione": "1.0.0"
    }

@app.get("/health", tags=["Health Check"])
async def health():
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)