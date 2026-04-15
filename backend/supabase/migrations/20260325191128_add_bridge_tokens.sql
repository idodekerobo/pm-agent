-- Bridge tokens: long-lived opaque tokens for authenticating the local bridge daemon.
-- One token per user (revoke-and-reissue on re-auth). Stored as SHA-256 hash.
create table if not exists bridge_tokens (
    id            uuid        primary key default gen_random_uuid(),
    user_id       uuid        not null references auth.users(id) on delete cascade,
    token_hash    text        not null unique,
    created_at    timestamptz not null default now(),
    last_used_at  timestamptz,
    revoked       boolean     not null default false
);

create index bridge_tokens_user_id_idx    on bridge_tokens(user_id);
create index bridge_tokens_token_hash_idx on bridge_tokens(token_hash);
