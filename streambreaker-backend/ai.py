"""
ai.py — Movie/series recommendations from an LLM (NVIDIA if configured, then a rotated
Gemini key pool). Shared by the API (/api/ai) and the bot (/recommend); no web framework needed.
"""
import json
import logging
import os

import aiohttp

# Comma-separated keys, rotated round-robin to spread quota
GEMINI_KEYS = [k.strip() for k in
               (os.getenv("GEMINI_API_KEYS") or os.getenv("GEMINI_API_KEY") or "").split(",") if k.strip()]
GEMINI_MODELS = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-2.5-flash-lite", "gemini-flash-latest"]
_key_index = 0


async def ask(prompt: str) -> str:
    """Return the model's answer, or a friendly message when no provider is available."""
    global _key_index
    if not prompt:
        return "Empty prompt."
    prompt = f"{prompt}\n\nIMPORTANT: You must write the response strictly in English language."

    async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=60)) as session:
        # 1. NVIDIA (optional)
        nvidia_key = os.getenv("NVIDIA_API_KEY", "").strip()
        if nvidia_key:
            try:
                async with session.post(
                    "https://integrate.api.nvidia.com/v1/chat/completions",
                    json={"model": os.getenv("NVIDIA_MODEL", "nvidia/nemotron-3-ultra-550b-a55b"),
                          "messages": [{"role": "user", "content": prompt}],
                          "temperature": 1, "top_p": 0.95, "max_tokens": 4096},
                    headers={"Authorization": f"Bearer {nvidia_key}"},
                ) as resp:
                    if resp.status == 200:
                        text = ((await resp.json()).get("choices") or [{}])[0].get("message", {}).get("content", "").strip()
                        if text:
                            return text
            except Exception as e:
                logging.warning(f"[NVIDIA] {e}")

        # 2. Gemini key pool
        if not GEMINI_KEYS:
            return "AI is not configured."
        last_error = ""
        for model in GEMINI_MODELS:
            for _ in range(len(GEMINI_KEYS)):
                key = GEMINI_KEYS[_key_index % len(GEMINI_KEYS)]
                _key_index += 1
                payload = {"contents": [{"parts": [{"text": prompt}]}],
                           "generationConfig": {"maxOutputTokens": 500, "temperature": 0.9}}
                # Thinking models: disable thinking so the answer fits the token budget
                if any(v in model for v in ("2.5", "3.1", "3.5")):
                    payload["generationConfig"]["thinkingConfig"] = {"thinkingBudget": 0}
                try:
                    async with session.post(
                        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}",
                        json=payload, timeout=aiohttp.ClientTimeout(total=15),
                    ) as resp:
                        result = json.loads(await resp.text())
                except Exception as e:
                    last_error = str(e)[:100]
                    continue
                if "error" in result:
                    code = result["error"].get("code", 0)
                    last_error = "quota" if code == 429 else "model" if code == 404 else "error"
                    if code == 404:
                        break  # model gone; try the next one
                    continue
                text = ((result.get("candidates") or [{}])[0].get("content", {}).get("parts") or [{}])[0].get("text", "")
                if text:
                    return text
    if last_error == "quota":
        return "⏳ AI is resting. All keys hit their daily limit. Try again tomorrow!"
    return "AI is temporarily unavailable. Try again later!"
