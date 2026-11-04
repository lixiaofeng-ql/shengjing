import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "icons"


def png(width: int, height: int, pixels: bytes, path: Path) -> None:
    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    raw = b"".join(b"\x00" + pixels[y * width * 4 : (y + 1) * width * 4] for y in range(height))
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    path.write_bytes(data)


def mix(a, b, t):
    return tuple(int(a[i] * (1 - t) + b[i] * t) for i in range(3)) + (255,)


def draw(size: int) -> bytes:
    bg = (42, 30, 22)
    gold = (196, 165, 116)
    ink = (139, 61, 47)
    out = bytearray(size * size * 4)

    def setp(x, y, c):
        if 0 <= x < size and 0 <= y < size:
            i = (y * size + x) * 4
            out[i : i + 4] = bytes(c)

    def fill_rect(x0, y0, x1, y1, c):
        for y in range(y0, y1):
            for x in range(x0, x1):
                setp(x, y, c)

    def in_round_rect(x, y, pad, rad):
        x0, y0, x1, y1 = pad, pad, size - pad, size - pad
        if x0 + rad <= x <= x1 - rad and y0 <= y <= y1:
            return True
        if y0 + rad <= y <= y1 - rad and x0 <= x <= x1:
            return True
        corners = ((x0 + rad, y0 + rad), (x1 - rad, y0 + rad), (x0 + rad, y1 - rad), (x1 - rad, y1 - rad))
        return any((x - cx) ** 2 + (y - cy) ** 2 <= rad ** 2 for cx, cy in corners)

    pad = max(2, size // 18)
    rad = size // 7
    for y in range(size):
        for x in range(size):
            setp(x, y, (0, 0, 0, 0) if not in_round_rect(x, y, pad, rad) else (*bg, 255))

    m = size // 5
    fill_rect(m, m, size - m, size - m, (*gold, 255))
    inner = m + max(2, size // 28)
    fill_rect(inner, inner, size - inner, size - inner, (*bg, 255))
    cx = cy = size // 2
    bar = max(6, size // 14)
    fill_rect(cx - bar // 2, m + size // 8, cx + bar // 2, size - m - size // 8, (*gold, 255))
    fill_rect(m + size // 7, cy - bar // 2 - size // 18, size - m - size // 7, cy + bar // 2 - size // 18, (*gold, 255))
    fill_rect(cx - bar // 4, cy - bar, cx + bar // 4, cy + bar * 2, (*ink, 255))
    return bytes(out)


def main() -> None:
    ROOT.mkdir(exist_ok=True)
    for name, size in (("icon-192.png", 192), ("icon-512.png", 512), ("apple-touch-icon.png", 180)):
        png(size, size, draw(size), ROOT / name)
        print("wrote", ROOT / name)


if __name__ == "__main__":
    main()
