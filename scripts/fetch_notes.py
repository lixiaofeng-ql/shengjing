import json
import os
import re
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEST_DIR = os.path.join(ROOT, "data", "notes")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) BibleReader/1.0"
BASE = "https://raw.githubusercontent.com/BibleAquifer/AquiferOpenStudyNotes/main/zht/json"


def parse_ref(code: str):
    code = re.sub(r"\D", "", str(code or ""))
    if len(code) < 8:
        return None
    return int(code[:2]), int(code[2:5]), int(code[5:8])


def clean_html(raw: str) -> str:
    text = raw or ""
    text = re.sub(r"</?data[^>]*>", "", text, flags=re.I)
    text = re.sub(r"</?(script|iframe|object|style)[^>]*>", "", text, flags=re.I)
    text = re.sub(r" on\w+=\"[^\"]*\"", "", text, flags=re.I)
    return text.strip()


def compact_book(items: list) -> dict:
    chapters = {}
    for item in items:
        passage = ((item.get("associations") or {}).get("passage") or [{}])[0]
        start = parse_ref(passage.get("start_ref") or item.get("index_reference", "").split("-")[0])
        end = parse_ref(passage.get("end_ref") or (item.get("index_reference", "").split("-")[-1]))
        if not start:
            continue
        end = end or start
        rec = {
            "s": start[2],
            "e": end[2] if end[0] == start[0] and end[1] == start[1] else 999,
            "t": item.get("title") or "",
            "h": clean_html(item.get("content") or ""),
        }
        if not rec["h"]:
            continue
        chapters.setdefault(str(start[1]), []).append(rec)
        if end[0] == start[0] and end[1] != start[1]:
            for ch in range(start[1] + 1, end[1] + 1):
                chapters.setdefault(str(ch), []).append(
                    {**rec, "s": 1, "e": rec["e"] if ch == end[1] else 999}
                )
    return {"lang": "zht", "source": "Aquifer Open Study Notes", "chapters": chapters}


def fetch(n: int) -> list:
    url = f"{BASE}/{n:02d}.content.json"
    last = None
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=90) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as exc:
            last = exc
            time.sleep(0.8 * (attempt + 1))
    raise RuntimeError(f"book {n}: {last}")


def main() -> None:
    os.makedirs(DEST_DIR, exist_ok=True)
    local_genesis = os.path.join(ROOT, "data", "_sample_notes.json")
    for n in range(1, 67):
        dest = os.path.join(DEST_DIR, f"{n}.json")
        if os.path.exists(dest) and os.path.getsize(dest) > 100:
            print(f"{n:02d} skip existing", flush=True)
            continue
        if n == 1 and os.path.exists(local_genesis):
            items = json.load(open(local_genesis, encoding="utf-8"))
        else:
            items = fetch(n)
            time.sleep(0.1)
        data = compact_book(items)
        with open(dest, "w", encoding="utf-8") as fh:
            json.dump(data, fh, ensure_ascii=False, separators=(",", ":"))
        notes = sum(len(v) for v in data["chapters"].values())
        print(f"{n:02d} notes={notes} bytes={os.path.getsize(dest)}", flush=True)


if __name__ == "__main__":
    main()
