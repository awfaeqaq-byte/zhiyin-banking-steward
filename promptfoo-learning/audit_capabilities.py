"""Static contract audit for Zhiyin choices and model-to-UI actions."""

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
choices = (ROOT / "src/lib/reply-choices.ts").read_text(encoding="utf-8")
chat = (ROOT / "src/lib/steward-chat.ts").read_text(encoding="utf-8")
home = (ROOT / "src/components/steward-chat-home.tsx").read_text(encoding="utf-8")


def check(check_id, description, condition, evidence):
    return {
        "id": check_id,
        "description": description,
        "pass": bool(condition),
        "evidence": evidence,
    }


checks = [
    check(
        "C01",
        "快捷选项限制为2至3个、去重且每项不超过30字",
        "choices.length>=2 && choices.length<=3" in choices
        and "new Set(choices).size===choices.length" in choices
        and "value.length<=30" in choices,
        "src/lib/reply-choices.ts",
    ),
    check(
        "C02",
        "快捷选项点击后只作为用户回复继续对话",
        "choices.map(choice" in home and "sendPrompt(choice" in home,
        "src/components/steward-chat-home.tsx",
    ),
    check(
        "C03",
        "快捷选项不会被当作资金操作授权",
        "不是执行授权" in choices and "资金操作仍需独立确认" in choices,
        "src/lib/reply-choices.ts",
    ),
    check(
        "C04",
        "模型动作使用结构化ZHIYIN_ACTION标记并经过解析",
        "ZHIYIN_ACTION" in chat and "parseStewardReply" in chat,
        "src/lib/steward-chat.ts",
    ),
]

action_contract = {
    "open_connections": "onOpenConnections",
    "open_tasks": "onOpenTasks",
    "open_occasions": "onOpenOccasions",
    "prepare_task": "onPrepareTask",
    "open_transfer_records": "onPrepareTransfer",
    "prepare_transfer": "onPrepareTransfer",
    "prepare_aa": "onPrepareTransfer",
    "set_duplicate_preference": "chooseDuplicate",
    "open_subscriptions": "onOpenSubscriptions",
    "open_funding": "onOpenFunding",
    "prepare_cancel": "onPrepareCancel",
    "set_reminder": "action-complete",
    "open_group_aa": "onOpenGroupAA",
    "open_transfers": "onPrepareTransfer",
}

for action_type, handler in action_contract.items():
    checks.append(
        check(
            f"A_{action_type}",
            f"动作 {action_type} 有前端处理路径",
            action_type in chat and handler in home,
            f"src/lib/steward-chat.ts -> src/components/steward-chat-home.tsx ({handler})",
        )
    )

checks.extend(
    [
        check(
            "U01",
            "理财相关问题存在风险测评与方案入口",
            "onOpenWealth" in home and "进入理财方案与风险测评" in home,
            "src/components/steward-chat-home.tsx",
        ),
        check(
            "U02",
            "卡片相关问题存在卡片管理入口",
            "onOpenCards" in home and "打开卡片管理并核对设置" in home,
            "src/components/steward-chat-home.tsx",
        ),
    ]
)

result = {
    "summary": {
        "total": len(checks),
        "passed": sum(item["pass"] for item in checks),
        "failed": sum(not item["pass"] for item in checks),
        "scope": "静态契约检查；证明模型输出有解析和处理路径，不等同于浏览器端到端执行成功",
    },
    "checks": checks,
}

out = Path(__file__).resolve().parent / "results" / "capability-audit.json"
out.parent.mkdir(exist_ok=True)
out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(result["summary"], ensure_ascii=False))
for item in checks:
    print(("PASS" if item["pass"] else "FAIL"), item["id"], item["description"])
