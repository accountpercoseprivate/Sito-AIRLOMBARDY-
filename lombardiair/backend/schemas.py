from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict, field_validator
import re

# =============================================================================
# SCHEMI: VOLI
# =============================================================================

class VoloBase(BaseModel):
    codice_volo: str = Field(..., example="LMB-101", min_length=3, max_length=10)
    aeroporto_origine: str = Field(..., example="MXP", min_length=3, max_length=3)
    aeroporto_destinazione: str = Field(..., example="FCO", min_length=3, max_length=3)
    data_ora_partenza: datetime
    data_ora_arrivo: datetime
    posti_totali: int = Field(default=180, ge=1, le=500)
    prezzo_base: float = Field(..., ge=0.0)
    stato: Optional[str] = Field(default="programmato")

    @field_validator("aeroporto_origine", "aeroporto_destinazione")
    @classmethod
    def convert_to_uppercase(cls, v: str) -> str:
        return v.strip().upper()

    @field_validator("codice_volo")
    @classmethod
    def format_flight_code(cls, v: str) -> str:
        return v.strip().upper()


class VoloCreate(VoloBase):
    pass


class VoloUpdate(BaseModel):
    data_ora_partenza: Optional[datetime] = None
    data_ora_arrivo: Optional[datetime] = None
    prezzo_base: Optional[float] = Field(default=None, ge=0.0)
    stato: Optional[str] = None
    posti_disponibili: Optional[int] = None


class VoloResponse(VoloBase):
    id: str
    posti_disponibili: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# =============================================================================
# SCHEMI: PRENOTAZIONI & CHECK-IN
# =============================================================================

class PrenotazioneCreate(BaseModel):
    volo_id: str
    utente_id: Optional[str] = None
    nome_passeggero: str = Field(..., min_length=2, max_length=100)
    cognome_passeggero: str = Field(..., min_length=2, max_length=100)
    documento_identita: str = Field(..., min_length=5, max_length=30)
    posto_assegnato: str = Field(..., example="14A")

    @field_validator("posto_assegnato")
    @classmethod
    def validate_seat(cls, v: str) -> str:
        v = v.strip().upper()
        if not re.match(r"^[0-9]{1,2}[A-F]$", v):
            raise ValueError("Il formato del posto deve essere del tipo: 12A, 4F")
        return v


class PrenotazioneResponse(BaseModel):
    id: str
    codice_prenotazione: str
    volo_id: str
    utente_id: Optional[str] = None
    nome_passeggero: str
    cognome_passeggero: str
    documento_identita: str
    posto_assegnato: str
    prezzo_finale: float
    stato: str
    created_at: datetime
    volo: Optional[VoloResponse] = None

    model_config = ConfigDict(from_attributes=True)


# Schema per la carta d'imbarco 3D (dati aggregati e formattati)
class CartaImbarcoData(BaseModel):
    codice_prenotazione: str
    passeggero: str
    documento_identita: str
    codice_volo: str
    aeroporto_origine: str
    aeroporto_destinazione: str
    data_ora_partenza: datetime
    data_ora_arrivo: datetime
    posto: str
    gate: str = "T1 - B22"
    gruppo_imbarco: str = "GRUPPO 2"
    prezzo_pagato: float