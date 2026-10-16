#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

python3 - "$PROJECT_ROOT" <<'PY'
import os
import re
import sqlite3
import sys
import tempfile
from contextlib import closing
from datetime import datetime
from pathlib import Path
from urllib.parse import unquote


def database_path(root):
    # 读取配置而不 source .env，避免执行其中的 shell 内容。
    value = None
    for line in (root / ".env").read_text(encoding="utf-8-sig").splitlines():
        match = re.match(r"^\s*(?:export\s+)?DATABASE_URL\s*=\s*(.*)$", line)
        if not match:
            continue
        raw = match.group(1).strip()
        if raw.startswith(("'", '"')):
            quoted = re.fullmatch(r"(['\"])(.*?)\1\s*(?:#.*)?", raw)
            if not quoted:
                raise ValueError(".env 中 DATABASE_URL 的引号格式无效")
            value = quoted.group(2)
        else:
            value = raw.split("#", 1)[0].strip()

    if not value or not value.startswith("file:"):
        raise ValueError(".env 中 DATABASE_URL 必须是 file: SQLite 路径")
    raw_path = unquote(value[5:].split("?", 1)[0])
    if not raw_path or raw_path == ":memory:":
        raise ValueError("DATABASE_URL 必须指向磁盘数据库")
    path = Path(raw_path)
    # Prisma 6 的相对 SQLite 路径以 schema 所在的 prisma/ 目录为基准。
    path = (path if path.is_absolute() else root / "prisma" / path).resolve()
    if not path.is_file():
        raise FileNotFoundError(f"数据库不存在，拒绝创建空库：{path}")
    return path


def main():
    root = Path(sys.argv[1])
    source_path = database_path(root)
    backup_dir = Path(os.environ.get("BACKUP_DIR", "~/okr-backups")).expanduser().resolve()
    os.umask(0o077)
    backup_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    output = backup_dir / f"okr-{datetime.now():%Y%m%d-%H%M%S}.db"
    fd, temporary_name = tempfile.mkstemp(prefix=".okr-backup-", suffix=".db", dir=backup_dir)
    os.close(fd)
    temporary = Path(temporary_name)
    try:
        # 只读打开源库；backup API 能一致地备份运行中含 WAL 的数据库。
        with closing(sqlite3.connect(source_path.as_uri() + "?mode=ro", uri=True, timeout=30)) as source:
            with closing(sqlite3.connect(temporary)) as destination:
                source.backup(destination, pages=256, sleep=0.1)
                result = destination.execute("PRAGMA integrity_check").fetchall()
                if result != [("ok",)]:
                    raise RuntimeError(f"备份完整性检查失败：{result}")
        # 校验成功后原子发布；同一秒重跑报错而不覆盖已有备份。
        os.link(temporary, output)
    finally:
        temporary.unlink(missing_ok=True)

    # 仅清理本脚本的备份命名，且成功备份和校验后才做轮换。
    backups = sorted(
        (path for path in backup_dir.iterdir()
         if re.fullmatch(r"okr-\d{8}-\d{6}\.db", path.name) and path.is_file()),
        key=lambda path: path.name,
        reverse=True,
    )
    for old in backups[30:]:
        old.unlink()
    print(f"备份成功：{output}")
    print("PRAGMA integrity_check: ok；仅保留最近 30 份备份")


try:
    main()
except Exception as error:
    print(f"备份失败：{error}", file=sys.stderr)
    sys.exit(1)
PY
