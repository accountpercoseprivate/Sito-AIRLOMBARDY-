import secrets
import string
from fastapi import APIRouter, HTTPException, status
from typing import List, Optional
from config import supabase_admin
from schemas import PrenotazioneCreate, PrenotazioneResponse, CartaImbarcoData

router = APIRouter()

def genera_codice_pnr() -> str:
    """Genera un codice PNR univoco nel formato LM-XXXXX (es. LM-8K9F2)."""
    caratteri = string.ascii_uppercase + string.digits
    codice_random = ''.join(secrets.choice(caratteri) for _ in range(5))
    return f"LM-{codice_random}"


@router.post("/", response_model=PrenotazioneResponse, status_code=status.HTTP_201_CREATED)
async def crea_prenotazione(dati: PrenotazioneCreate):
    """
    Emette una nuova prenotazione in modo transazionale e atomico:
    utilizza la funzione PostgreSQL crea_prenotazione_atomica per prevenire doppi acquisti.
    """
    try:
        pnr = genera_codice_pnr()

        # Invoca la funzione RPC atomica su Supabase
        rpc_params = {
            "p_volo_id": dati.volo_id,
            "p_utente_id": dati.utente_id if dati.utente_id else None,
            "p_nome": dati.nome_passeggero.strip().title(),
            "p_cognome": dati.cognome_passeggero.strip().upper(),
            "p_documento": dati.documento_identita.strip().upper(),
            "p_posto": dati.posto_assegnato,
            "p_pnr": pnr
        }

        rpc_res = supabase_admin.rpc("crea_prenotazione_atomica", rpc_params).execute()

        if not rpc_res.data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, 
                detail="Impossibile completare la prenotazione del posto selezionato."
            )

        prenotazione = rpc_res.data

        # Recupera dati volo per la risposta
        volo_res = supabase_admin.table("voli").select("*").eq("id", dati.volo_id).single().execute()
        prenotazione["volo"] = volo_res.data

        return prenotazione

    except Exception as e:
        err_msg = str(e)
        if "già occupato" in err_msg:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=err_msg)
        if "Nessun posto disponibile" in err_msg or "non è prenotabile" in err_msg:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=err_msg)
        if "Volo non trovato" in err_msg:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=err_msg)
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Errore durante l'elaborazione della prenotazione: {err_msg}"
        )


@router.get("/pnr/{codice_pnr}", response_model=PrenotazioneResponse)
async def ottieni_prenotazione_da_pnr(codice_pnr: str):
    """Recupera i dettagli di una prenotazione tramite codice PNR."""
    try:
        res = (
            supabase_admin.table("prenotazioni")
            .select("*, voli(*)")
            .eq("codice_prenotazione", codice_pnr.upper().strip())
            .execute()
        )
        if not res.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nessuna prenotazione trovata con questo PNR.")
        
        dati = res.data[0]
        dati["volo"] = dati.pop("voli")
        return dati
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/{codice_pnr}/carta-imbarco", response_model=CartaImbarcoData)
async def ottieni_dati_carta_imbarco(codice_pnr: str):
    """Restituisce i dati aggregati per il render 3D e la stampa della carta d'imbarco."""
    try:
        res = (
            supabase_admin.table("prenotazioni")
            .select("*, voli(*)")
            .eq("codice_prenotazione", codice_pnr.upper().strip())
            .execute()
        )
        if not res.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Titolo di viaggio non trovato.")

        p = res.data[0]
        v = p["voli"]

        return CartaImbarcoData(
            codice_prenotazione=p["codice_prenotazione"],
            passeggero=f"{p['nome_passeggero']} {p['cognome_passeggero']}",
            documento_identita=p["documento_identita"],
            codice_volo=v["codice_volo"],
            aeroporto_origine=v["aeroporto_origine"],
            aeroporto_destinazione=v["aeroporto_destinazione"],
            data_ora_partenza=v["data_ora_partenza"],
            data_ora_arrivo=v["data_ora_arrivo"],
            posto=p["posto_assegnato"],
            gate="GATE 04",
            gruppo_imbarco="GRUPPO 1" if int(p["posto_assegnato"][:-1]) <= 10 else "GRUPPO 2",
            prezzo_pagato=p["prezzo_finale"]
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))