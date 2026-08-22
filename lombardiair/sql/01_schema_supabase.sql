-- =============================================================================
-- PROGETTO: LombardiAIR - Schema Definitivo & RPC
-- =============================================================================

-- 1. TABELLA: utenti_profili
CREATE TABLE IF NOT EXISTS public.utenti_profili (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nome TEXT,
    cognome TEXT,
    codice_fiscale VARCHAR(16),
    ruolo TEXT NOT NULL DEFAULT 'passeggero' CHECK (ruolo IN ('passeggero', 'admin')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. TABELLA: voli
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
    stato TEXT NOT NULL DEFAULT 'programmato' CHECK (stato IN ('programmato', 'in_volo', 'atterrato', 'cancellato')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT check_date_congrue CHECK (data_ora_arrivo > data_ora_partenza),
    CONSTRAINT check_posti_congrui CHECK (posti_disponibili <= posti_totali)
);

-- 3. TABELLA: prenotazioni
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
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Rimuove il vecchio vincolo rigido se già presente ed applica l'Indice Parziale
ALTER TABLE public.prenotazioni DROP CONSTRAINT IF EXISTS unique_posto_per_volo;

CREATE UNIQUE INDEX IF NOT EXISTS unique_posto_attivo_per_volo 
ON public.prenotazioni (volo_id, posto_assegnato) 
WHERE stato != 'annullata';

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
-- TRIGGER 2: Creazione Profilo & Assegnazione Admin
-- =============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.utenti_profili (id, nome, cognome, ruolo)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)),
        COALESCE(NEW.raw_user_meta_data->>'cognome', ''),
        CASE 
            WHEN LOWER(NEW.email) = 'dibiasioalessandro56@gmail.com' THEN 'admin'
            ELSE COALESCE(NEW.raw_user_meta_data->>'ruolo', 'passeggero')
        END
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
-- FUNZIONE RPC: Emissione Biglietto Atomica con Lock Concorrenza
-- =============================================================================
CREATE OR REPLACE FUNCTION public.crea_prenotazione_atomica(
    p_volo_id UUID,
    p_utente_id UUID,
    p_nome TEXT,
    p_cognome TEXT,
    p_documento TEXT,
    p_posto VARCHAR(4),
    p_pnr VARCHAR(8)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_volo RECORD;
    v_prenotazione RECORD;
BEGIN
    -- Lock riga volo
    SELECT * INTO v_volo
    FROM public.voli
    WHERE id = p_volo_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Volo non trovato.';
    END IF;

    IF v_volo.stato != 'programmato' THEN
        RAISE EXCEPTION 'Il volo non è prenotabile.';
    END IF;

    IF v_volo.posti_disponibili <= 0 THEN
        RAISE EXCEPTION 'Nessun posto disponibile su questo volo.';
    END IF;

    -- Controllo posto già occupato
    IF EXISTS (
        SELECT 1 FROM public.prenotazioni
        WHERE volo_id = p_volo_id 
          AND posto_assegnato = p_posto
          AND stato != 'annullata'
    ) THEN
        RAISE EXCEPTION 'Il posto % è già stato occupato. Scegli un altro sedile.', p_posto;
    END IF;

    -- Inserimento prenotazione
    INSERT INTO public.prenotazioni (
        codice_prenotazione, utente_id, volo_id,
        nome_passeggero, cognome_passeggero, documento_identita,
        posto_assegnato, prezzo_finale, stato
    )
    VALUES (
        p_pnr, p_utente_id, p_volo_id,
        p_nome, p_cognome, p_documento,
        p_posto, v_volo.prezzo_base, 'confermata'
    )
    RETURNING * INTO v_prenotazione;

    -- Decremento posti disponibili
    UPDATE public.voli
    SET posti_disponibili = posti_disponibili - 1
    WHERE id = p_volo_id;

    RETURN to_jsonb(v_prenotazione);
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

DROP POLICY IF EXISTS "Profili: visualizzazione proprietario o admin" ON public.utenti_profili;
CREATE POLICY "Profili: visualizzazione proprietario o admin"
    ON public.utenti_profili FOR SELECT
    USING (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS "Profili: aggiornamento proprio profilo" ON public.utenti_profili;
CREATE POLICY "Profili: aggiornamento proprio profilo"
    ON public.utenti_profili FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Voli: visibili a tutti" ON public.voli;
CREATE POLICY "Voli: visibili a tutti"
    ON public.voli FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Voli: gestione riservata admin" ON public.voli;
CREATE POLICY "Voli: gestione riservata admin"
    ON public.voli FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Prenotazioni: lettura per proprietario o admin" ON public.prenotazioni;
CREATE POLICY "Prenotazioni: lettura per proprietario o admin"
    ON public.prenotazioni FOR SELECT
    USING (auth.uid() = utente_id OR public.is_admin());

DROP POLICY IF EXISTS "Prenotazioni: inserimento consentito" ON public.prenotazioni;
CREATE POLICY "Prenotazioni: inserimento consentito"
    ON public.prenotazioni FOR INSERT
    WITH CHECK (true);

DROP POLICY IF EXISTS "Prenotazioni: gestione riservata admin" ON public.prenotazioni;
CREATE POLICY "Prenotazioni: gestione riservata admin"
    ON public.prenotazioni FOR UPDATE
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- Sblocco admin
UPDATE auth.users SET email_confirmed_at = now() WHERE email_confirmed_at IS NULL;
UPDATE public.utenti_profili SET ruolo = 'admin' 
WHERE id IN (SELECT id FROM auth.users WHERE LOWER(email) = 'dibiasioalessandro56@gmail.com');