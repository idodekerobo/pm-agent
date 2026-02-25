-- Add parent_id to conversation_items for conversation branching support
ALTER TABLE public.conversation_items
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.conversation_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_conversation_items_parent_id ON public.conversation_items(parent_id);
