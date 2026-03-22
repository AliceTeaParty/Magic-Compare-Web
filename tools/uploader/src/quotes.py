from __future__ import annotations

import random

ACG_QUOTES = [
    "正因为不会发生，所以才叫奇迹。",
    "世界并不温柔，但你可以选择温柔地前进。",
    "旅途的意义，有时只是为了抵达下一页。",
    "再微小的光，也足以照亮下一步。",
    "重要的不是答案，而是愿意继续寻找答案的人。",
    "如果今天还没有结果，那就先把这一格做好。",
    "能传达出去的心意，都会在某处留下回响。",
]


def random_acg_quote() -> str:
    return random.choice(ACG_QUOTES)
