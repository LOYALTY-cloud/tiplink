-- Create cards table for Stripe Issuing virtual cards
create table if not exists cards (
    id uuid primary key default gen_random_uuid(),

    user_id uuid not null
        references profiles(id)
        on delete cascade,

    stripe_cardholder_id text,
    stripe_card_id text unique not null,

    brand text,
    last4 text,
    exp_month int,
    exp_year int,

    status text default 'active',

    created_at timestamptz default now()
);

create index if not exists idx_cards_user_id on cards(user_id);
create index if not exists idx_cards_stripe_card_id on cards(stripe_card_id);

-- Enforce one card per user at DB level
create unique index if not exists idx_cards_user_unique on cards(user_id);
