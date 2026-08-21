-- =============================================================================
-- PROGETTO: LombardiAIR
-- MODULO: Schema DDL, Trigger di Auth e Row Level Security (RLS)
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
    aeroporto_origine VARCHAR(3) NOT NULL,       -- Es: MXP, LIN, BGY
    aeroporto_destinazione VARCHAR(3) NOT NULL,  -- Es: FCO, CDG, LHR
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
    codice_prenotazione VARCHAR(8) NOT NULL UNIQUE, -- Es: LM-8K9F2
    utente_id UUID REFERENCES public.utenti_profili(id) ON DELETE SET NULL,
    volo_id UUID NOT NULL REFERENCES public.voli(id) ON DELETE RESTRICT,
    nome_passeggero TEXT NOT NULL,
    cognome_passeggero TEXT NOT NULL,
    documento_identita TEXT NOT NULL,
    posto_assegnato VARCHAR(4) NOT NULL,            -- Es: 12A, 4F
    prezzo_finale NUMERIC(10, 2) NOT NULL CHECK (prezzo_finale >= 0),
    stato TEXT NOT NULL DEFAULT 'confermata' CHECK (stato IN ('confermata', 'imbarcato', 'annullata')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT unique_posto_per_volo UNIQUE (volo_id, posto_assegnato)
);

-- =============================================================================
-- TRIGGER: Creazione automatica profilo utente alla registrazione Auth
-- =============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.utenti_profili (id, nome, cognome, ruolo)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'nome', ''),
        COALESCE(NEW.raw_user_meta_data->>'cognome', ''),
        COALESCE(NEW.raw_user_meta_data->>'ruolo', 'passeggero')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================================================
-- HELPER FUNCTIONS & ROW LEVEL SECURITY (RLS)
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

-- Policy Utenti
CREATE POLICY "Profili: visualizzazione proprietario o admin"
    ON public.utenti_profili FOR SELECT
    USING (auth.uid() = id OR public.is_admin());

CREATE POLICY "Profili: aggiornamento proprio profilo"
    ON public.utenti_profili FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Policy Voli
CREATE POLICY "Voli: visibili a tutti"
    ON public.voli FOR SELECT
    USING (true);

CREATE POLICY "Voli: gestione riservata admin"
    ON public.voli FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- Policy Prenotazioni
CREATE POLICY "Prenotazioni: lettura per proprietario o admin"
    ON public.prenotazioni FOR SELECT
    USING (auth.uid() = utente_id OR public.is_admin());

CREATE POLICY "Prenotazioni: inserimento proprietario"
    ON public.prenotazioni FOR INSERT
    WITH CHECK (auth.uid() = utente_id);

CREATE POLICY "Prenotazioni: gestione riservata admin"
    ON public.prenotazioni FOR UPDATE
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- =============================================================================
-- DATI INIZIALI DI TEST (SEEDING)
-- =============================================================================
INSERT INTO public.voli (codice_volo, aeroporto_origine, aeroporto_destinazione, data_ora_partenza, data_ora_arrivo, posti_totali, posti_disponibili, prezzo_base, stato)
VALUES 
    ('LMB-101', 'MXP', 'FCO', NOW() + INTERVAL '2 days 08 hours', NOW() + INTERVAL '2 days 09 hours 15 minutes', 180, 178, 89.00, 'programmato'),
    ('LMB-204', 'LIN', 'CDG', NOW() + INTERVAL '3 days 11 hours', NOW() + INTERVAL '3 days 12 hours 40 minutes', 150, 142, 125.50, 'programmato'),
    ('LMB-305', 'BGY', 'LHR', NOW() + INTERVAL '4 days 06 hours', NOW() + INTERVAL '4 days 08 hours 05 minutes', 180, 180, 99.90, 'programmato')
ON CONFLICT (codice_volo) DO NOTHING;