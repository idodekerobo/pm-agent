-- RPC to atomically update a single key in github_installations.repo_monitoring_config.
-- Using jsonb_set avoids a Python read-modify-write race condition on the JSONB column.
CREATE OR REPLACE FUNCTION public.update_repo_monitoring_config(
    p_user_id UUID,
    p_full_name TEXT,
    p_enabled BOOLEAN
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
AS $$
    UPDATE public.github_installations
    SET repo_monitoring_config = jsonb_set(
        repo_monitoring_config,
        ARRAY[p_full_name],
        to_jsonb(p_enabled)
    )
    WHERE user_id = p_user_id;
$$;
