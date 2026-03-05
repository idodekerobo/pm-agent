"""Model pricing tables and cost computation."""

# All prices are USD per 1,000,000 tokens.
MODEL_PRICING: dict[str, dict[str, dict[str, float]]] = {
    "openai": {
        "gpt-4o":      {"input": 2.50,  "cached_input": 1.25,  "output": 10.00},
        "gpt-4o-mini": {"input": 0.15,  "cached_input": 0.08, "output": 0.60},
        "gpt-4.1":     {"input": 2.00,  "cached_input": 0.50, "output": 8.00},
        "gpt-5.2":     {"input": 1.75,  "cached_input": 0.18,  "output": 14.00},
        "gpt-5.4":     {"input": 2.50,  "cached_input": 0.25,  "output": 15.00},
    },
}


def compute_cost(
    provider: str,
    model: str,
    input_tokens: int,
    output_tokens: int,
    cached_input_tokens: int = 0,
) -> tuple[float, float, float]:
    """
    Returns (input_price_per_token, output_price_per_token, total_cost_usd).

    Prices are per single token (not per MTok).
    Cached input tokens are billed at the discounted cached_input rate.
    Returns (0.0, 0.0, 0.0) if the provider/model is not in the pricing table.
    """
    prices = MODEL_PRICING.get(provider, {}).get(model)
    if not prices:
        return 0.0, 0.0, 0.0

    input_price_per_token = prices["input"] / 1_000_000
    output_price_per_token = prices["output"] / 1_000_000
    cached_price_per_token = prices.get("cached_input", prices["input"]) / 1_000_000

    billable_input = max(0, input_tokens - cached_input_tokens)
    total = (
        billable_input * input_price_per_token
        + cached_input_tokens * cached_price_per_token
        + output_tokens * output_price_per_token
    )
    return input_price_per_token, output_price_per_token, total
