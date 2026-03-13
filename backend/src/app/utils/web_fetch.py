import httpx

DEFAULT_MAX_CHARS = 8_000


async def fetch_url(url: str, max_chars: int = DEFAULT_MAX_CHARS) -> str:
    """
    Fetch the content of a URL via Jina.ai Reader and return clean markdown.

    Args:
        url: The URL to fetch (must include https://).
        max_chars: Truncate output to this many characters.
    """
    from app.config import settings

    headers = {"Accept": "text/markdown"}
    if settings.jina_api_key:
        headers["Authorization"] = f"Bearer {settings.jina_api_key}"

    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        response = await client.get(f"https://r.jina.ai/{url}", headers=headers)
        response.raise_for_status()
    return response.text[:max_chars]
