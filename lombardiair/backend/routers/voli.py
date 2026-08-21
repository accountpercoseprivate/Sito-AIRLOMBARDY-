from fastapi import APIRouter, HTTPException, Query, status
from typing import List, Optional
from datetime import date
from config import supabase
from schemas import VoloResponse

router = APIRouter()

@router.get("/", response_model=List[VoloResponse])
async def cerca_voli(
    origine: Optional[str] = Query(None, min_length=3, max_length=3, description="Codice IATA origine (es. MXP, LIN, BGY)"),
    destinazione: Optional[str] = Query(None, min_length=3, max_length=3, description="Codice IATA destinazione (es. FCO, CDG)"),
    data: Optional[date] = Query(None, description="Data di partenza YYYY-MM-DD")
):
    """
    Ricerca pubblica dei voli attivi in programma con filtri su aeroporti e data.
    """
    try:
        query = supabase.table("voli").select("*").neq("stato", "cancellato")

        if origine:
            query = query.eq("aeroporto_origine", origine.upper())
        if destinazione:
            query = query.eq("aeroporto_destinazione", destinazione.upper())
        if data:
            start_iso = f"{data.isoformat()}T00:00:00+00:00"
            end_iso = f"{data.isoformat()}T23:59:59+00:00"
            query = query.gte("data_ora_partenza", start_iso).lte("data_ora_partenza", end_iso)

        response = query.order("data_ora_partenza", desc=False).execute()
        return response.data
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Errore nel recupero dei voli: {str(e)}"
        )


@router.get("/{volo_id}", response_model=VoloResponse)
async def ottieni_dettaglio_volo(volo_id: str):
    """
    Recupera i dettagli completi di un singolo volo per ID.
    """
    try:
        response = supabase.table("voli").select("*").eq("id", volo_id).single().execute()
        if not response.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Volo non trovato")
        return response.data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Errore nel caricamento del volo: {str(e)}"
        )


@router.get("/{volo_id}/posti-occupati", response_model=List[str])
async def ottieni_posti_occupati(volo_id: str):
    """
    Restituisce l'elenco dei codici posto già prenotati per un dato volo (es. ['1A', '12C', '14F']).
    Utilizzato dal frontend per disabilitare i sedili già venduti.
    """
    try:
        # Verifica preventiva esistenza volo
        volo = supabase.table("voli").select("id").eq("id", volo_id).execute()
        if not volo.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Volo non trovato")

        # Recupera i posti già assegnati per prenotazioni valide
        prenotazioni = (
            supabase.table("prenotazioni")
            .select("posto_assegnato")
            .eq("volo_id", volo_id)
            .neq("stato", "annullata")
            .execute()
        )

        posti_occupati = [p["posto_assegnato"] for p in prenotazioni.data]
        return posti_occupati
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Errore nel recupero della mappa posti: {str(e)}"
        )