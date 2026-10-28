# Promptfoo adapter for production-faithful Zhiyin financial-coach tests.

import http.client
import json
import re
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
PROMPT_FILE = ROOT / "src" / "prompts" / "financial-coach.v1.md"
CHOICES_FILE = ROOT / "src" / "lib" / "reply-choices.ts"

PROMPT_TEMPLATE = PROMPT_FILE.read_text(encoding="utf-8").strip()
choices_source = CHOICES_FILE.read_text(encoding="utf-8")
choices_match = re.search(r"export const choiceInstructions='([^']*)';", choices_source)
if not choices_match:
    raise RuntimeError("Unable to load Zhiyin choice instructions")
CHOICE_INSTRUCTIONS = choices_match.group(1)

DEFAULT_DATA = {
    "bank": {
        "availableCents": 4_230_000,
        "readFrom": "本机银行沙箱",
        "frozen": False,
    },
    "bill": None,
    "upcomingPayments": [],
    "wealth": {"assessment": None, "activeHoldingCount": 0},
    "savedGoal": None,
    "missing": [
        "债务本金、利率和最低还款额",
        "稳定月收入与固定支出",
        "住房、保险及其他未授权账户",
        "完整资产负债与净资产",
    ],
}


def build_instructions(case):
    data = case.get("data", DEFAULT_DATA)
    memory = case.get(
        "memoryContext",
        "长期记忆未启用；只使用本轮对话和下面提供的数据。",
    )
    return (
        PROMPT_TEMPLATE.replace("{{stewardName}}", "宁宁")
        .replace("{{memoryContext}}", str(memory)[:450])
        .replace("{{choiceInstructions}}", CHOICE_INSTRUCTIONS)
        .replace("{{data}}", json.dumps(data, ensure_ascii=False))
    )


def request_reply(instructions, messages):
    payload = json.dumps(
        {"instructions": instructions, "input": messages[-24:]},
        ensure_ascii=False,
    ).encode("utf-8")
    # The upstream model proxy occasionally times out. Retry only transport and
    # 5xx failures; this adapter makes read-only model calls, never bank actions.
    for attempt in range(3):
        conn = http.client.HTTPConnection("127.0.0.1", 3000, timeout=90)
        try:
            conn.request(
                "POST",
                "/api/zhiyin/steward-reply",
                body=payload,
                headers={"Content-Type": "application/json; charset=utf-8"},
            )
            response = conn.getresponse()
            body = response.read().decode("utf-8")
            if response.status < 500 or attempt == 2:
                break
        except (OSError, TimeoutError, http.client.HTTPException):
            if attempt == 2:
                raise
        finally:
            conn.close()
        time.sleep(attempt + 1)

    if response.status >= 400:
        raise RuntimeError(f"Zhiyin returned HTTP {response.status}: {body}")
    data = json.loads(body)
    output = data.get("output_text")
    if not isinstance(output, str) or not output.strip():
        raise RuntimeError(f"Zhiyin returned an invalid response: {body}")
    return output.strip()


def parse_case(prompt):
    try:
        parsed = json.loads(prompt)
    except (json.JSONDecodeError, TypeError):
        return {"turns": [str(prompt)]}, False
    if not isinstance(parsed, dict) or not isinstance(parsed.get("turns"), list):
        return {"turns": [str(prompt)]}, False
    turns = parsed["turns"]
    if not turns or not all(isinstance(turn, str) and turn.strip() for turn in turns):
        raise ValueError("A multi-turn case requires a non-empty string array named turns")
    return parsed, True


def call_api(prompt, options, context):
    case, is_multi_turn = parse_case(prompt)
    instructions = build_instructions(case)
    messages = []
    transcript = []

    for index, user_text in enumerate(case["turns"], start=1):
        messages.append({"role": "user", "content": user_text.strip()})
        assistant_text = request_reply(instructions, messages)
        messages.append({"role": "assistant", "content": assistant_text})
        transcript.append(
            f"=== TURN {index} USER ===\n{user_text.strip()}\n"
            f"=== TURN {index} ASSISTANT ===\n{assistant_text}"
        )

    output = "\n\n".join(transcript) if is_multi_turn else messages[-1]["content"]
    return {"output": output}
