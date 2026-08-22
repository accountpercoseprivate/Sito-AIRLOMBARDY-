-- =============================================================================
-- PROGETTO: LombardiAIR (Schema V3 - Supporto Worker Voli, Ritardi & Nuovi Extra)
-- =============================================================================

-- 1. ENUM: Tier Fedeltà "Flying Lomb"
DO $$ BEGIN
    CREATE TYPE public.loyalty_tier_enum AS ENUM ('Explorer', 'Silver', 'Gold', 'Platinum');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. TABELLA: utenti_profili
CREATE TABLE IF NOT EXISTS public.utenti_profili (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nome TEXT,
    cognome TEXT,
    codice_fiscale VARCHAR(16),
    ruolo TEXT NOT NULL DEFAULT 'passeggero' CHECK (ruolo IN ('passeggero', 'admin')),
    loyalty_tier public.loyalty_tier_enum NOT NULL DEFAULT 'Explorer',
    miles_balance INTEGER NOT NULL DEFAULT 0 CHECK (miles_balance >= 0),
    xp_balance INTEGER NOT NULL DEFAULT 0 CHECK (xp_balance >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.utenti_profili
    ADD COLUMN IF NOT EXISTS loyalty_tier public.loyalty_tier_enum NOT NULL DEFAULT 'Explorer',
    ADD COLUMN IF NOT EXISTS miles_balance INTEGER NOT NULL DEFAULT 0 CHECK (miles_balance >= 0),
    ADD COLUMN IF NOT EXISTS xp_balance INTEGER NOT NULL DEFAULT 0 CHECK (xp_balance >= 0);

-- 3. TABELLA: voli (Aggiornamento stati operativi e ritardi)
CREATE TABLE IF NOT EXISTS public.voli (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codice_volo VARCHAR(10) NOT NULL UNIQUE,
    aeroporto_origine VARCHAR(3) NOT NULL,
    aeroporto_destinazione VARCHAR(3) NOT NULL,
    data_ora_partenza TIMESTAMPTZ NOT NULL,
    data_ora_arrivo TIMESTAMPTZ NOT NULL,
    posti_totali INTEGER NOT NULL DEFAULT 180 CHECK (posti_totali > 0),
    posti_disponibili INTEGER NOT NULL DEFAULT 180 CHECK (posti_disponibili >= 0),
    prezzo_base NUMERIC(10, 2) NOT NULL CHECK (prezzo_base >= 0),
    stato TEXT NOT NULL DEFAULT 'programmato',
    ritardo_minuti INTEGER NOT NULL DEFAULT 0 CHECK (ritardo_minuti >= 0),
    is_private_charter BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT check_date_congrue CHECK (data_ora_arrivo > data_ora_partenza),
    CONSTRAINT check_posti_congrui CHECK (posti_disponibili <= posti_totali)
);

ALTER TABLE public.voli
    ADD COLUMN IF NOT EXISTS ritardo_minuti INTEGER NOT NULL DEFAULT 0 CHECK (ritardo_minuti >= 0),
    ADD COLUMN IF NOT EXISTS is_private_charter BOOLEAN NOT NULL DEFAULT false;

-- Aggiorna il vincolo sugli stati operativi del volo (inclusi boarding, ritardi e charter)
ALTER TABLE public.voli DROP CONSTRAINT IF EXISTS voli_stato_check;
ALTER TABLE public.voli DROP CONSTRAINT IF EXISTS check_stato_valido;

ALTER TABLE public.voli 
    ADD CONSTRAINT check_stato_valido 
    CHECK (stato IN ('programmato', 'in_imbarco', 'in_volo', 'atterrato', 'in_ritardo', 'cancellato'));

-- 4. TABELLA: prenotazioni (Nuovi Servizi Accessori Integrati)
CREATE TABLE IF NOT EXISTS public.prenotazioni (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codice_prenotazione VARCHAR(8) NOT NULL UNIQUE,
    utente_id UUID REFERENCES public.utenti_profili(id) ON DELETE SET NULL,
    volo_id UUID NOT NULL REFERENCES public.voli(id) ON DELETE RESTRICT,
    nome_passeggero TEXT NOT NULL,
    cognome_passeggero TEXT NOT NULL,
    documento_identita TEXT NOT NULL,
    posto_assegnato VARCHAR(4) NOT NULL,
    prezzo_finale NUMERIC(10, 2) NOT NULL CHECK (prezzo_finale >= 0),
    stato TEXT NOT NULL DEFAULT 'confermata' CHECK (stato IN ('confermata', 'imbarcato', 'annullata')),
    check_in_status BOOLEAN NOT NULL DEFAULT false,
    extra_baggage BOOLEAN NOT NULL DEFAULT false,
    fast_track BOOLEAN NOT NULL DEFAULT false,
    lounge_access BOOLEAN NOT NULL DEFAULT false,
    in_flight_meal BOOLEAN NOT NULL DEFAULT false,
    priority_boarding BOOLEAN NOT NULL DEFAULT false,
    pet_in_cabin BOOLEAN NOT NULL DEFAULT false,
    seat_selection_fee NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (seat_selection_fee >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.prenotazioni
    ADD COLUMN IF NOT EXISTS check_in_status BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS extra_baggage BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS fast_track BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS lounge_access BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS in_flight_meal BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS priority_boarding BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS pet_in_cabin BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS seat_selection_fee NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (seat_selection_fee >= 0);

-- Indice Parziale sui sedili attivi
ALTER TABLE public.prenotazioni DROP CONSTRAINT IF EXISTS unique_posto_per_volo;

CREATE UNIQUE INDEX IF NOT EXISTS unique_posto_attivo_per_volo 
ON public.prenotazioni (volo_id, posto_assegnato) 
WHERE stato != 'annullata';

-- 5. TABELLA: richieste_premi (Store Riscatto Miglia)
CREATE TABLE IF NOT EXISTS public.richieste_premi (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    utente_id UUID NOT NULL REFERENCES public.utenti_profili(id) ON DELETE CASCADE,
    tipo_premio TEXT NOT NULL,
    costo_miglia INTEGER NOT NULL CHECK (costo_miglia > 0),
    stato TEXT NOT NULL DEFAULT 'in_attesa' CHECK (stato IN ('in_attesa', 'approvato', 'rifiutato')),
    note_admin TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- =============================================================================
-- TRIGGER 1: Auto-conferma Email
-- =============================================================================
CREATE OR REPLACE FUNCTION public.auto_confirm_user_email()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.email_confirmed_at = COALESCE(NEW.email_confirmed_at, now());
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_auto_confirm ON auth.users;
CREATE TRIGGER on_auth_user_auto_confirm
    BEFORE INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.auto_confirm_user_email();

-- =============================================================================
-- TRIGGER 2: Creazione Profilo & Assegnazione Super Admin
-- =============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.utenti_profili (id, nome, cognome, ruolo, loyalty_tier, miles_balance, xp_balance)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)),
        COALESCE(NEW.raw_user_meta_data->>'cognome', ''),
        CASE 
            WHEN LOWER(NEW.email) = 'dibiasioalessandro56@gmail.com' THEN 'admin'
            ELSE COALESCE(NEW.raw_user_meta_data->>'ruolo', 'passeggero')
        END,
        'Explorer',
        0,
        0
    )
    ON CONFLICT (id) DO UPDATE
    SET ruolo = EXCLUDED.ruolo;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================================================
-- TRIGGER 3: Calcolo Automatico Tier "Flying Lomb"
-- =============================================================================
CREATE OR REPLACE FUNCTION public.calcola_loyalty_tier()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public
AS $$
BEGIN
    IF NEW.xp_balance >= 300 THEN
        NEW.loyalty_tier = 'Platinum';
    ELSIF NEW.xp_balance >= 180 THEN
        NEW.loyalty_tier = 'Gold';
    ELSIF NEW.xp_balance >= 100 THEN
        NEW.loyalty_tier = 'Silver';
    ELSE
        NEW.loyalty_tier = 'Explorer';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_aggiorna_loyalty_tier ON public.utenti_profili;
CREATE TRIGGER tr_aggiorna_loyalty_tier
    BEFORE INSERT OR UPDATE OF xp_balance ON public.utenti_profili
    FOR EACH ROW
    EXECUTE FUNCTION public.calcola_loyalty_tier();

-- =============================================================================
-- RPC 1: Prenotazione Volo Atomica
-- =============================================================================
CREATE OR REPLACE FUNCTION public.crea_prenotazione_atomica(
    p_volo_id UUID,
    p_utente_id UUID,
    p_nome TEXT,
    p_cognome TEXT,
    p_documento TEXT,
    p_posto VARCHAR(4),
    p_pnr VARCHAR(8),
    p_extra_baggage BOOLEAN DEFAULT false,
    p_fast_track BOOLEAN DEFAULT false,
    p_lounge_access BOOLEAN DEFAULT false,
    p_in_flight_meal BOOLEAN DEFAULT false,
    p_priority_boarding BOOLEAN DEFAULT false,
    p_pet_in_cabin BOOLEAN DEFAULT false,
    p_seat_fee NUMERIC(10, 2) DEFAULT 0.00
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_volo RECORD;
    v_prenotazione RECORD;
    v_prezzo_totale NUMERIC(10, 2);
BEGIN
    SELECT * INTO v_volo
    FROM public.voli
    WHERE id = p_volo_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Volo non trovato.';
    END IF;

    IF v_volo.stato NOT IN ('programmato', 'in_imbarco', 'in_ritardo') THEN
        RAISE EXCEPTION 'Il volo non è più prenotabile (Stato: %).', v_volo.stato;
    END IF;

    IF v_volo.posti_disponibili <= 0 THEN
        RAISE EXCEPTION 'Nessun posto disponibile su questo volo.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.prenotazioni
        WHERE volo_id = p_volo_id 
          AND posto_assegnato = p_posto
          AND stato != 'annullata'
    ) THEN
        RAISE EXCEPTION 'Il posto % è già occupato. Seleziona un altro sedile.', p_posto;
    END IF;

    -- Calcolo totale finale con eventuali extra iniziali
    v_prezzo_totale := v_volo.prezzo_base + COALESCE(p_seat_fee, 0.00);

    INSERT INTO public.prenotazioni (
        codice_prenotazione, utente_id, volo_id,
        nome_passeggero, cognome_passeggero, documento_identita,
        posto_assegnato, prezzo_finale, stato,
        check_in_status, extra_baggage, fast_track, lounge_access,
        in_flight_meal, priority_boarding, pet_in_cabin, seat_selection_fee
    )
    VALUES (
        p_pnr, p_utente_id, p_volo_id,
        p_nome, p_cognome, p_documento,
        p_posto, v_prezzo_totale, 'confermata',
        false, p_extra_baggage, p_fast_track, p_lounge_access,
        p_in_flight_meal, p_priority_boarding, p_pet_in_cabin, p_seat_fee
    )
    RETURNING * INTO v_prenotazione;

    UPDATE public.voli
    SET posti_disponibili = posti_disponibili - 1
    WHERE id = p_volo_id;

    RETURN to_jsonb(v_prenotazione);
END;
$$;

-- =============================================================================
-- RPC 2: Esecuzione Check-in Online (+5 XP e +50 Miglia)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.esegui_checkin_online(p_pnr VARCHAR(8))
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_prenotazione RECORD;
BEGIN
    SELECT * INTO v_prenotazione
    FROM public.prenotazioni
    WHERE UPPER(codice_prenotazione) = UPPER(p_pnr)
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Nessuna prenotazione trovata con PNR %', p_pnr;
    END IF;

    IF v_prenotazione.stato = 'annullata' THEN
        RAISE EXCEPTION 'Impossibile eseguire il check-in su un biglietto annullato.';
    END IF;

    IF v_prenotazione.check_in_status = false THEN
        UPDATE public.prenotazioni
        SET check_in_status = true
        WHERE id = v_prenotazione.id;

        IF v_prenotazione.utente_id IS NOT NULL THEN
            UPDATE public.utenti_profili
            SET xp_balance = xp_balance + 5,
                miles_balance = miles_balance + 50
            WHERE id = v_prenotazione.utente_id;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'codice_prenotazione', v_prenotazione.codice_prenotazione,
        'check_in_status', true
    );
END;
$$;

-- =============================================================================
-- RPC 3: Richiesta Riscatto Premio da parte del Cittadino (Scala Miglia)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.richiedi_riscatto_premio(
    p_tipo_premio TEXT,
    p_costo_miglia INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_utente RECORD;
    v_richiesta RECORD;
BEGIN
    SELECT * INTO v_utente
    FROM public.utenti_profili
    WHERE id = auth.uid()
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Profilo utente non trovato.';
    END IF;

    IF v_utente.miles_balance < p_costo_miglia THEN
        RAISE EXCEPTION 'Saldo miglia insufficiente. Ti mancano % miglia per questo premio.', (p_costo_miglia - v_utente.miles_balance);
    END IF;

    UPDATE public.utenti_profili
    SET miles_balance = miles_balance - p_costo_miglia
    WHERE id = auth.uid();

    INSERT INTO public.richieste_premi (utente_id, tipo_premio, costo_miglia, stato)
    VALUES (auth.uid(), p_tipo_premio, p_costo_miglia, 'in_attesa')
    RETURNING * INTO v_richiesta;

    RETURN to_jsonb(v_richiesta);
END;
$$;

-- =============================================================================
-- RPC 4: Gestione Riscatto Admin (con Rimborso se Rifiutato)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.gestisci_richiesta_premio_admin(
    p_richiesta_id UUID,
    p_nuovo_stato TEXT,
    p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_richiesta RECORD;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Accesso negato: operazione riservata agli amministratori.';
    END IF;

    SELECT * INTO v_richiesta
    FROM public.richieste_premi
    WHERE id = p_richiesta_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Richiesta non trovata.';
    END IF;

    IF v_richiesta.stato != 'in_attesa' THEN
        RAISE EXCEPTION 'Questa richiesta è già stata elaborata (Stato: %).', v_richiesta.stato;
    END IF;

    IF p_nuovo_stato = 'rifiutato' THEN
        UPDATE public.utenti_profili
        SET miles_balance = miles_balance + v_richiesta.costo_miglia
        WHERE id = v_richiesta.utente_id;
    END IF;

    UPDATE public.richieste_premi
    SET stato = p_nuovo_stato,
        note_admin = p_note
    WHERE id = p_richiesta_id;

    RETURN jsonb_build_object(
        'success', true,
        'richiesta_id', p_richiesta_id,
        'stato', p_nuovo_stato
    );
END;
$$;

-- =============================================================================
-- RPC 5: Modifica Punteggi/Miglia da parte dell'Admin
-- =============================================================================
CREATE OR REPLACE FUNCTION public.modifica_punteggio_utente_admin(
    p_utente_id UUID,
    p_xp_delta INTEGER,
    p_miglia_delta INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_utente RECORD;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Accesso negato: operazione riservata agli amministratori.';
    END IF;

    UPDATE public.utenti_profili
    SET xp_balance = GREATEST(0, xp_balance + p_xp_delta),
        miles_balance = GREATEST(0, miles_balance + p_miglia_delta)
    WHERE id = p_utente_id
    RETURNING * INTO v_utente;

    RETURN to_jsonb(v_utente);
END;
$$;

-- =============================================================================
-- RPC 6: Azione Rapida Ritardo / Imprevisto Volo (Admin)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.imposta_ritardo_volo_admin(
    p_volo_id UUID,
    p_minuti_ritardo INTEGER,
    p_nuovo_stato TEXT DEFAULT 'in_ritardo'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_volo RECORD;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Accesso negato: operazione riservata agli amministratori.';
    END IF;

    UPDATE public.voli
    SET ritardo_minuti = p_minuti_ritardo,
        stato = p_nuovo_stato
    WHERE id = p_volo_id
    RETURNING * INTO v_volo;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Volo non trovato.';
    END IF;

    RETURN to_jsonb(v_volo);
END;
$$;

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.utenti_profili
        WHERE id = auth.uid() AND ruolo = 'admin'
    );
END;
$$;

ALTER TABLE public.utenti_profili ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voli ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prenotazioni ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.richieste_premi ENABLE ROW LEVEL SECURITY;

-- Policy Profili
DROP POLICY IF EXISTS "Profili: visualizzazione proprietario o admin" ON public.utenti_profili;
CREATE POLICY "Profili: visualizzazione proprietario o admin"
    ON public.utenti_profili FOR SELECT
    USING (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS "Profili: aggiornamento proprio profilo o admin" ON public.utenti_profili;
CREATE POLICY "Profili: aggiornamento proprio profilo o admin"
    ON public.utenti_profili FOR UPDATE
    USING (auth.uid() = id OR public.is_admin())
    WITH CHECK (auth.uid() = id OR public.is_admin());

-- Policy Voli
DROP POLICY IF EXISTS "Voli: visibili a tutti" ON public.voli;
CREATE POLICY "Voli: visibili a tutti"
    ON public.voli FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Voli: gestione riservata admin" ON public.voli;
CREATE POLICY "Voli: gestione riservata admin"
    ON public.voli FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- Policy Prenotazioni
DROP POLICY IF EXISTS "Prenotazioni: lettura per proprietario o admin" ON public.prenotazioni;
CREATE POLICY "Prenotazioni: lettura per proprietario o admin"
    ON public.prenotazioni FOR SELECT
    USING (auth.uid() = utente_id OR public.is_admin());

DROP POLICY IF EXISTS "Prenotazioni: inserimento consentito" ON public.prenotazioni;
CREATE POLICY "Prenotazioni: inserimento consentito"
    ON public.prenotazioni FOR INSERT
    WITH CHECK (true);

DROP POLICY IF EXISTS "Prenotazioni: aggiornamento proprietario o admin" ON public.prenotazioni;
CREATE POLICY "Prenotazioni: aggiornamento proprietario o admin"
    ON public.prenotazioni FOR UPDATE
    USING (auth.uid() = utente_id OR public.is_admin())
    WITH CHECK (auth.uid() = utente_id OR public.is_admin());

-- Policy Richieste Premi
DROP POLICY IF EXISTS "Richieste Premi: lettura proprietario o admin" ON public.richieste_premi;
CREATE POLICY "Richieste Premi: lettura proprietario o admin"
    ON public.richieste_premi FOR SELECT
    USING (auth.uid() = utente_id OR public.is_admin());

DROP POLICY IF EXISTS "Richieste Premi: inserimento proprietario" ON public.richieste_premi;
CREATE POLICY "Richieste Premi: inserimento proprietario"
    ON public.richieste_premi FOR INSERT
    WITH CHECK (auth.uid() = utente_id);

DROP POLICY IF EXISTS "Richieste Premi: gestione riservata admin" ON public.richieste_premi;
CREATE POLICY "Richieste Premi: gestione riservata admin"
    ON public.richieste_premi FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- Promozione Super Admin
UPDATE public.utenti_profili SET ruolo = 'admin' 
WHERE id IN (SELECT id FROM auth.users WHERE LOWER(email) = 'dibiasioalessandro56@gmail.com');