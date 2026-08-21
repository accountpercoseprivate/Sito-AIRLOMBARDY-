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
    Emette una nuova prenotazione:
    1. Verifica che il volo esista e abbia posti disponibili.
    2. Controlla che il posto scelto non sia già occupato.
    3. Registra il passeggero e aggiorna i posti disponibili del volo.
    """
    try:
        # 1. Recupero dati volo
        volo_res = supabase_admin.table("voli").select("*").eq("id", dati.volo_id).execute()
        if not volo_res.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Volo selezionato non valido.")
        
        volo = volo_res.data[0]
        if volo["stato"] != "programmato":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Il volo non è più prenotabile.")
        
        if volo["posti_disponibili"] <= 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Volo al completo. Nessun posto disponibile.")

        # 2. Controllo duplicazione posto
        posto_check = (
            supabase_admin.table("prenotazioni")
            .select("id")
            .eq("volo_id", dati.volo_id)
            .eq("posto_assegnato", dati.posto_assegnato)
            .neq("stato", "annullata")
            .execute()
        )
        if posto_check.data:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Il posto {dati.posto_assegnato} è già stato occupato. Scegli un altro sedile."
            )

        # 3. Creazione record prenotazione
        pnr = genera_codice_pnr()
        nuova_prenotazione = {
            "codice_prenotazione": pnr,
            "utente_id": dati.utente_id if dati.utente_id else None,
            "volo_id": dati.volo_id,
            "nome_passeggero": dati.nome_passeggero.strip().title(),
            "cognome_passeggero": dati.cognome_passeggero.strip().upper(),
            "documento_identita": dati.documento_identita.strip().upper(),
            "posto_assegnato": dati.posto_assegnato,
            "prezzo_finale": volo["prezzo_base"],
            "stato": "confermata"
        }

        res_insert = supabase_admin.table("prenotazioni").insert(nuova_prenotazione).execute()
        if not res_insert.data:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Impossibile completare la prenotazione.")

        prenotazione_creata = res_insert.data[0]

        # 4. Decremento atomico dei posti disponibili sul volo
        supabase_admin.table("voli").update({
            "posti_disponibili": volo["posti_disponibili"] - 1
        }).eq("id", dati.volo_id).execute()

        # Includi l'oggetto volo nella risposta
        prenotazione_creata["volo"] = volo
        return prenotazione_creata

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Errore durante l'elaborazione della prenotazione: {str(e)}"
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
    """
    Restituisce il set di dati aggregati necessari al rendering 3D
    e alla stampa istituzionale della carta d'imbarco.
    """
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