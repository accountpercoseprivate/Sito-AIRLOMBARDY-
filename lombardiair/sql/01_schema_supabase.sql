-- =============================================================================
-- PROGETTO: LombardiAIR
-- MODULO: Schema Pulito (Nessun volo fittizio - Gestione 100% via Admin Dashboard)
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

-- 2. TABELLA: voli (Gestita esclusivamente dall'Admin)
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
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT unique_posto_per_volo UNIQUE (volo_id, posto_assegnato)
);

-- =============================================================================
-- TRIGGER 1: Auto-convalida email (Zero blocchi per i cittadini)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.auto_confirm_user_email()
RETURNS TRIGGER AS $$
BEGIN
    NEW.email_confirmed_at = COALESCE(NEW.email_confirmed_at, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_auto_confirm ON auth.users;
CREATE TRIGGER on_auth_user_auto_confirm
    BEFORE INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.auto_confirm_user_email();

-- =============================================================================
-- TRIGGER 2: Assegnazione automatica Super Admin a dibiasioalessandro56@gmail.com
-- =============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.utenti_profili (id, nome, cognome, ruolo)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'nome', 'Alessandro'),
        COALESCE(NEW.raw_user_meta_data->>'cognome', 'Di Blasio'),
        CASE 
            WHEN LOWER(NEW.email) = 'dibiasioalessandro56@gmail.com' THEN 'admin'
            ELSE COALESCE(NEW.raw_user_meta_data->>'ruolo', 'passeggero')
        END
    )
    ON CONFLICT (id) DO UPDATE
    SET ruolo = EXCLUDED.ruolo;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================================================
-- SBLOCCO E PROMOZIONE ACCOUNT ADMIN
-- =============================================================================
UPDATE auth.users
SET email_confirmed_at = now()
WHERE email_confirmed_at IS NULL;

UPDATE public.utenti_profili
SET ruolo = 'admin'
WHERE id IN (
    SELECT id FROM auth.users WHERE LOWER(email) = 'dibiasioalessandro56@gmail.com'
);

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.utenti_profili
        WHERE id = auth.uid() AND ruolo = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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

DROP POLICY IF EXISTS "Prenotazioni: inserimento proprietario" ON public.prenotazioni;
CREATE POLICY "Prenotazioni: inserimento proprietario"
    ON public.prenotazioni FOR INSERT
    WITH CHECK (auth.uid() = utente_id);

DROP POLICY IF EXISTS "Prenotazioni: gestione riservata admin" ON public.prenotazioni;
CREATE POLICY "Prenotazioni: gestione riservata admin"
    ON public.prenotazioni FOR UPDATE
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- Pulizia preventiva dei voli di test precedenti
DELETE FROM public.prenotazioni;
DELETE FROM public.voli;