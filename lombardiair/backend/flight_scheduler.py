"""
=============================================================================
LOMBARDAIR - FLIGHT STATUS AUTOMATION WORKER & DYNAMIC DAILY SCHEDULER
Torre di Controllo Automatica:
- Generazione automatica voli giornalieri (Lun-Ven, 14:00 - 22:00, LIN <-> MNZ)
- Avanzamento stati flotta in tempo reale (Imbarco -> In Volo -> Atterrato)
- Standby automatico nel Weekend (Sabato e Domenica)
=============================================================================
"""

import os
import sys
import time
import signal
import asyncio
import random
from datetime import datetime, timezone, timedelta, date
from dotenv import load_dotenv

# Gestione fuso orario italiano (CET / CEST)
try:
    from zoneinfo import ZoneInfo
    ROME_TZ = ZoneInfo("Europe/Rome")
except Exception:
    ROME_TZ = timezone(timedelta(hours=1))

# Carica variabili d'ambiente
load_dotenv()

# Import del client Supabase Admin dal file config esistente
try:
    from config import supabase_admin
except ImportError:
    from supabase import create_client
    url = os.getenv("SUPABASE_URL", "")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "") or os.getenv("SUPABASE_ANON_KEY", "")
    supabase_admin = create_client(url, key)

# Intervallo di controllo del radar (in secondi)
CHECK_INTERVAL_SECONDS = 60
running = True


def segnale_interruzione(sig, frame):
    """Gestione arresto pulito del worker."""
    global running
    print("\n[TORRE DI CONTROLLO] Ricevuto segnale di arresto. Spegnimento worker...")
    running = False


signal.signal(signal.SIGINT, segnale_interruzione)
signal.signal(signal.SIGTERM, segnale_interruzione)


def parse_iso_datetime(iso_str: str) -> datetime:
    """Converte una stringa ISO 8601 da Supabase in oggetto datetime con timezone UTC."""
    if not iso_str:
        return None
    clean_str = iso_str.replace("Z", "+00:00")
    dt = datetime.fromisoformat(clean_str)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def genera_voli_giornata(data_riferimento: date):
    """
    Crea la lista dei 9 voli giornalieri (14:00 - 22:00) a tratte alterne sincrone:
    14:xx LIN -> MNZ (LM-140)
    15:xx MNZ -> LIN (LM-150)
    16:xx LIN -> MNZ (LM-160)
    ... fino alle 22:xx LIN -> MNZ (LM-220)
    con minuti di decollo variabili e realistici.
    """
    if data_riferimento.weekday() >= 5:
        return []

    # Seme basato sul giorno dell'anno per avere orari misti ma determinati e coerenti nella giornata
    rng = random.Random(data_riferimento.toordinal())
    
    orari_base = list(range(14, 23))  # 14, 15, 16, 17, 18, 19, 20, 21, 22
    voli = []
    
    origine = "LIN"
    destinazione = "MNZ"
    
    for ora in orari_base:
        # Minuti di partenza variabili
        minuto_partenza = rng.choice([0, 5, 8, 10, 12, 15])
        # Durata tratta tra 20 e 25 minuti
        durata_volo_min = rng.choice([20, 22, 25])
        
        dt_partenza_locale = datetime(
            data_riferimento.year, data_riferimento.month, data_riferimento.day,
            ora, minuto_partenza, tzinfo=ROME_TZ
        )
        dt_arrivo_locale = dt_partenza_locale + timedelta(minutes=durata_volo_min)
        
        # Conversione in UTC per il salvataggio su Supabase (TIMESTAMPTZ)
        dt_partenza_utc = dt_partenza_locale.astimezone(timezone.utc)
        dt_arrivo_utc = dt_arrivo_locale.astimezone(timezone.utc)
        
        codice_volo = f"LM-{ora:02d}0"
        
        voli.append({
            "codice_volo": codice_volo,
            "aeroporto_origine": origine,
            "aeroporto_destinazione": destinazione,
            "data_ora_partenza": dt_partenza_utc.isoformat(),
            "data_ora_arrivo": dt_arrivo_utc.isoformat(),
            "posti_totali": 100,
            "posti_disponibili": 100,
            "prezzo_base": 10.00,
            "stato": "programmato",
            "ritardo_minuti": 0,
            "is_private_charter": False
        })
        
        # Inversione sincrona della rotta per il volo successivo
        origine, destinazione = destinazione, origine
        
    return voli


async def assicura_voli_del_giorno():
    """
    Verifica se per la data odierna (Lun-Ven) i voli sono già stati inseriti.
    Se mancano, provvede a generarli automaticamente su Supabase.
    """
    now_locale = datetime.now(ROME_TZ)
    data_oggi = now_locale.date()

    # 1. Se è weekend, nessun volo da generare
    if data_oggi.weekday() >= 5:
        return

    try:
        # Finestra temporale di oggi in UTC
        dt_inizio_giorno_utc = datetime(data_oggi.year, data_oggi.month, data_oggi.day, 0, 0, 0, tzinfo=ROME_TZ).astimezone(timezone.utc)
        dt_fine_giorno_utc = datetime(data_oggi.year, data_oggi.month, data_oggi.day, 23, 59, 59, tzinfo=ROME_TZ).astimezone(timezone.utc)

        # 2. Controlla se esistono già voli programmati o registrati per oggi
        res = (
            supabase_admin.table("voli")
            .select("id, codice_volo")
            .gte("data_ora_partenza", dt_inizio_giorno_utc.isoformat())
            .lte("data_ora_partenza", dt_fine_giorno_utc.isoformat())
            .execute()
        )

        voli_esistenti = res.data or []

        # Se ci sono già voli per oggi, non duplicarli
        if len(voli_esistenti) > 0:
            return

        # 3. Genera la tabella oraria mista per la giornata
        nuovi_voli = genera_voli_giornata(data_oggi)
        if not nuovi_voli:
            return

        # Pulisce eventuali vecchi voli atterrati di giorni passati con lo stesso codice per evitare conflitti UNIQUE
        for v in nuovi_voli:
            try:
                supabase_admin.table("voli").delete().eq("codice_volo", v["codice_volo"]).lt("data_ora_partenza", dt_inizio_giorno_utc.isoformat()).execute()
            except Exception:
                pass

        # 4. Inserimento nel database Supabase
        insert_res = supabase_admin.table("voli").insert(nuovi_voli).execute()
        if insert_res.data:
            print(f"✨ [AUTO-SCHEDULER] Generati con successo {len(insert_res.data)} voli per oggi ({data_oggi.strftime('%d/%m/%Y')}) tra le 14:00 e le 22:00.")

    except Exception as e:
        print(f"⚠️  [ERRORE GENERAZIONE VOLI GIORNALIERI]: {str(e)}")


async def elabora_avanzamento_flotta():
    """
    Scansiona tutti i voli attivi e aggiorna gli stati operativi:
    programmato -> in_imbarco (-25m) -> in_volo (partenza) -> atterrato (arrivo).
    """
    now_utc = datetime.now(timezone.utc)
    is_weekend = now_utc.weekday() >= 5  # 5 = Sabato, 6 = Domenica

    # =========================================================================
    # GESTIONE STANDBY OPERATIVO NEL WEEKEND
    # =========================================================================
    if is_weekend:
        giorno_str = "Sabato" if now_utc.weekday() == 5 else "Domenica"
        print(f"[{now_utc.strftime('%H:%M:%S UTC')}] [STANDBY WEEKEND ({giorno_str})] Monitoraggio sospeso per giorno festivo.")
        return

    # =========================================================================
    # MODALITÀ OPERATIVA ATTIVA (LUNEDÌ - VENERDÌ)
    # =========================================================================
    try:
        # Recupera tutti i voli non conclusi e non cancellati
        res = (
            supabase_admin.table("voli")
            .select("*")
            .not_.in_("stato", ["atterrato", "cancellato"])
            .execute()
        )

        voli_attivi = res.data or []
        if not voli_attivi:
            print(f"[{now_utc.strftime('%H:%M:%S UTC')}] [RADAR OK] Nessun volo in transito al momento.")
            return

        for volo in voli_attivi:
            volo_id = volo["id"]
            codice = volo["codice_volo"]
            stato_attuale = volo.get("stato", "programmato")
            ritardo_minuti = volo.get("ritardo_minuti", 0)

            dt_partenza = parse_iso_datetime(volo.get("data_ora_partenza"))
            dt_arrivo = parse_iso_datetime(volo.get("data_ora_arrivo"))

            if not dt_partenza or not dt_arrivo:
                continue

            # Applica eventuale ritardo registrato dall'Admin
            dt_partenza_effettiva = dt_partenza + timedelta(minutes=ritardo_minuti)
            dt_arrivo_effettivo = dt_arrivo + timedelta(minutes=ritardo_minuti)
            dt_apertura_imbarco = dt_partenza_effettiva - timedelta(minutes=25)

            nuovo_stato = None

            # 1. Volo ATTERRATO: l'orario attuale ha superato l'orario di arrivo
            if now_utc >= dt_arrivo_effettivo:
                if stato_attuale != "atterrato":
                    nuovo_stato = "atterrato"

            # 2. Volo IN VOLO: l'orario attuale ha superato l'orario di decollo ma è prima dell'atterraggio
            elif now_utc >= dt_partenza_effettiva:
                if stato_attuale not in ["in_volo", "atterrato"]:
                    nuovo_stato = "in_volo"

            # 3. Volo IN IMBARCO: siamo nella finestra dei 25 minuti prima del decollo
            elif now_utc >= dt_apertura_imbarco:
                if stato_attuale in ["programmato", "in_ritardo"]:
                    nuovo_stato = "in_imbarco"

            # Esegui l'aggiornamento se lo stato è cambiato
            if nuovo_stato and nuovo_stato != stato_attuale:
                update_res = (
                    supabase_admin.table("voli")
                    .update({"stato": nuovo_stato})
                    .eq("id", volo_id)
                    .execute()
                )

                if update_res.data:
                    print(
                        f"✈️  [STATUS UPDATE] Volo {codice} ({volo['aeroporto_origine']} ➔ {volo['aeroporto_destinazione']}): "
                        f"'{stato_attuale}' ➜ '{nuovo_stato.upper()}'"
                    )

    except Exception as e:
        print(f"❌ [ERRORE RADAR WORKER]: {str(e)}")


async def main():
    """Ciclo principale di esecuzione del worker."""
    print("=" * 70)
    print("  LOMBARDAIR • TORRE DI CONTROLLO FLOTTA & SCHEDULER AUTOMATICO")
    print("  Orari operativi: Lun-Ven (dalle 14:00 alle 22:00, tratte LIN <-> MNZ)")
    print("  Standby automatico: Sabato e Domenica (Festivi)")
    print(f"  Frequenza scansione radar: ogni {CHECK_INTERVAL_SECONDS} secondi")
    print("=" * 70)

    while running:
        # 1. Assicura che i voli del giorno siano generati se è un giorno feriale
        await assicura_voli_del_giorno()

        # 2. Aggiorna in tempo reale gli stati dei voli in corso
        await elabora_avanzamento_flotta()

        for _ in range(CHECK_INTERVAL_SECONDS):
            if not running:
                break
            await asyncio.sleep(1)

    print("[TORRE DI CONTROLLO] Worker terminato con successo.")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        pass