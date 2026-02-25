-- RPC function to walk the parent_id chain from a leaf item back to the root,
-- returning items in chronological order (root first).
CREATE OR REPLACE FUNCTION public.get_conversation_chain(leaf_id UUID)
RETURNS TABLE(id UUID, item JSONB, created_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
AS $$
  WITH RECURSIVE chain AS (
    -- Base case: start at the leaf
    SELECT ci.id, ci.item, ci.created_at, ci.parent_id
    FROM public.conversation_items ci
    WHERE ci.id = leaf_id

    UNION ALL

    -- Recursive case: walk up to the parent
    SELECT ci.id, ci.item, ci.created_at, ci.parent_id
    FROM public.conversation_items ci
    INNER JOIN chain c ON ci.id = c.parent_id
  )
  SELECT id, item, created_at
  FROM chain
  ORDER BY created_at ASC;
$$;
