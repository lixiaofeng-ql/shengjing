import json
import os
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEST = os.path.join(ROOT, "data", "cuv.json")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) BibleReader/1.0"


def fetch_book(n: int) -> dict:
    url = f"https://api.getbible.net/v2/cus/{n}.json"
    last = None
    for attempt in range(4):
        try:
            req = urllib.request.Request(
                url, headers={"User-Agent": UA, "Accept": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as exc:
            last = exc
            time.sleep(0.6 * (attempt + 1))
    raise RuntimeError(f"fail book {n}: {last}")


def compact(raw: dict) -> dict:
    chapters = {}
    for ch in raw.get("chapters") or []:
        verses = {}
        for verse in ch.get("verses") or []:
            text = (verse.get("text") or "").strip()
            if text:
                verses[str(verse.get("verse"))] = text
        chapters[str(ch.get("chapter"))] = verses
    return {"name": raw.get("name"), "chapters": chapters}


def main() -> None:
    os.makedirs(os.path.dirname(DEST), exist_ok=True)
    out = {}
    for n in range(1, 67):
        raw = fetch_book(n)
        book = compact(raw)
        verse_count = sum(len(ch) for ch in book["chapters"].values())
        print(f"{n:02d} {book['name']} verses={verse_count}", flush=True)
        out[str(n)] = book
        time.sleep(0.08)
    with open(DEST, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    print("wrote", DEST, "bytes", os.path.getsize(DEST))


if __name__ == "__main__":
    main()
