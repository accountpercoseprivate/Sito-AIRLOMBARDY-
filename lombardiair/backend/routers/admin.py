from fastapi import APIRouter, HTTPException, Header, status
from typing import List, Optional
from config import supabase_admin, supabase
from schemas import VoloCreate, VoloUpdate, VoloResponse, PrenotazioneResponse

router = APIRouter()

async def verifica_ruolo_admin(authorization: Optional[str] = Header(None)):
    """
    Dependency per validare il JWT Supabase e accertare che
    l'utente possieda il ruolo 'admin' nella tabella utenti_profili.
    """
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token di autenticazione mancante nell'header Authorization."
        )

    token = authorization.replace("Bearer ", "").strip()
    try:
        user_res = supabase.auth.get_user(token)
        if not user_res or not user_res.user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sessione scaduta o non valida.")

        user_id = user_res.user.id
        profilo = supabase_admin.table("utenti_profili").select("ruolo").eq("id", user_id).single().execute()
        
        if not profilo.data or profilo.data.get("ruolo") != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Accesso negato. Questa operazione richiede privilegi di Amministratore."
            )

        return user_res.user
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Errore durante la verifica dell'identità: {str(e)}"
        )


# =============================================================================
# GESTIONE VOLI
# =============================================================================

@router.post("/voli", response_model=VoloResponse, status_code=status.HTTP_201_CREATED)
async def crea_nuovo_volo(dati_volo: VoloCreate, authorization: Optional[str] = Header(None)):
    """Aggiunge una nuova tratta/volo al tabellone operativo."""
    await verifica_ruolo_admin(authorization)
    try:
        payload = dati_volo.model_dump()
        payload["posti_disponibili"] = payload["posti_totali"]
        payload["data_ora_partenza"] = payload["data_ora_partenza"].isoformat()
        payload["data_ora_arrivo"] = payload["data_ora_arrivo"].isoformat()

        res = supabase_admin.table("voli").insert(payload).execute()
        if not res.data:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Impossibile creare il volo.")
        return res.data[0]
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.patch("/voli/{volo_id}", response_model=VoloResponse)
async def modifica_volo(volo_id: str, dati: VoloUpdate, authorization: Optional[str] = Header(None)):
    """Modifica orari, tariffe o stato operativo di un volo."""
    await verifica_ruolo_admin(authorization)
    try:
        update_data = {k: v for k, v in dati.model_dump().items() if v is not None}
        if "data_ora_partenza" in update_data:
            update_data["data_ora_partenza"] = update_data["data_ora_partenza"].isoformat()
        if "data_ora_arrivo" in update_data:
            update_data["data_ora_arrivo"] = update_data["data_ora_arrivo"].isoformat()

        res = supabase_admin.table("voli").update(update_data).eq("id", volo_id).execute()
        if not res.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Volo non trovato.")
        return res.data[0]
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.delete("/voli/{volo_id}", status_code=status.HTTP_200_OK)
async def cancella_volo(volo_id: str, authorization: Optional[str] = Header(None)):
    """Imposta il volo su 'cancellato'."""
    await verifica_ruolo_admin(authorization)
    try:
        res = supabase_admin.table("voli").update({"stato": "cancellato"}).eq("id", volo_id).execute()
        if not res.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Volo non trovato.")
        return {"messaggio": f"Volo {volo_id} contrassegnato come cancellato con successo."}
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


# =============================================================================
# MANIFEST PASSEGGERI & STATISTICHE
# =============================================================================

@router.get("/prenotazioni", response_model=List[PrenotazioneResponse])
async def visualizza_manifest_prenotazioni(
    volo_id: Optional[str] = None,
    authorization: Optional[str] = Header(None)
):
    """Visualizza l'elenco completo dei biglietti emessi, filtrabile per singolo volo."""
    await verifica_ruolo_admin(authorization)
    try:
        query = supabase_admin.table("prenotazioni").select("*, voli(*)")
        if volo_id:
            query = query.eq("volo_id", volo_id)

        res = query.order("created_at", desc=True).execute()
        
        prenotazioni_formattate = []
        for row in res.data:
            row["volo"] = row.pop("voli", None)
            prenotazioni_formattate.append(row)

        return prenotazioni_formattate
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/statistiche")
async def statistiche_flotta(authorization: Optional[str] = Header(None)):
    """Restituisce indicatori chiave di performance (KPI) per il cruscotto direzionale."""
    await verifica_ruolo_admin(authorization)
    try:
        voli_res = supabase_admin.table("voli").select("id, posti_totali, posti_disponibili, stato").execute()
        prenotazioni_res = supabase_admin.table("prenotazioni").select("id, prezzo_finale, stato").execute()

        totale_voli = len(voli_res.data)
        voli_attivi = sum(1 for v in voli_res.data if v["stato"] == "programmato")
        
        prenotazioni_valide = [p for p in prenotazioni_res.data if p["stato"] != "annullata"]
        totale_biglietti = len(prenotazioni_valide)
        totale_incassi = sum(float(p["prezzo_finale"]) for p in prenotazioni_valide)

        return {
            "totale_voli_registrati": totale_voli,
            "voli_programmati": voli_attivi,
            "biglietti_emessi": totale_biglietti,
            "incasso_complessivo_eur": round(totale_incassi, 2)
        }
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))