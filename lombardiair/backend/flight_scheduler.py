"""
=============================================================================
LOMBARDAIR - FLIGHT STATUS AUTOMATION WORKER (flight_scheduler.py)
Torre di Controllo Automatica: avanzamento stati flotta Lun-Ven & Standby Weekend
=============================================================================
"""

import os
import sys
import time
import signal
import asyncio
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv

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
    # Supporta terminazione Z o offset esplicito
    clean_str = iso_str.replace("Z", "+00:00")
    dt = datetime.fromisoformat(clean_str)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


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
        print(f"[{now_utc.strftime('%H:%M:%S UTC')}] [STANDBY WEEKEND ({giorno_str})] Monitoraggio sospeso per risparmio risorse.")
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
    print("  LOMBARDAIR • TORRE DI CONTROLLO FLOTTA AUTOMATICA")
    print("  Controllo stati attivo: Lun-Ven (Imbarco -> In Volo -> Atterrato)")
    print("  Standby automatico: Sabato e Domenica")
    print(f"  Frequenza scansione radar: ogni {CHECK_INTERVAL_SECONDS} secondi")
    print("=" * 70)

    while running:
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