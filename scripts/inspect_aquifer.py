import json
import re

listing = json.load(
    open(
        r"C:\Users\lxf\.cursor\projects\c-Users-lxf-Projects-shengjing\agent-tools\df186eba-ed5f-4a21-87f3-a6c5c70810fb.txt",
        encoding="utf-8",
    )
)
print("files", len(listing))
for item in listing[:10]:
    print(item["name"], item.get("size"), (item.get("download_url") or "")[:100])
print("last", listing[-1]["name"], listing[-1].get("size"))

rel = open(
    r"C:\Users\lxf\.cursor\projects\c-Users-lxf-Projects-shengjing\agent-tools\14881473-00c0-40cf-8bcf-d41dce3f31b1.txt",
    encoding="utf-8",
).read()
urls = re.findall(
    r"https://github.com/BibleAquifer/AquiferOpenStudyNotes/releases/download/[^\"\\s]+",
    rel,
)
print("assets", len(urls))
for url in urls:
    low = url.lower()
    if "zht" in low or "chinese" in low or "zh" in low:
        print("ZH", url)
print("ALL")
for url in urls:
    print(url)
