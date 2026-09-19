"""Regenerates src/schema-uniques.json (UNIQUE constraints per model) from apps/api/prisma/schema.prisma.
Run after changing the Prisma schema:  python apps/gateway/tools/gen-uniques.py
The Worker's in-memory store has no database to enforce UNIQUE, so edge-prisma.ts enforces these itself."""
import json, re, pathlib
root = pathlib.Path(__file__).resolve().parents[2]
text = (root / 'api' / 'prisma' / 'schema.prisma').read_text(encoding='utf-8')
out = {}
for m in re.finditer(r'^model\s+(\w+)\s*\{(.*?)^\}', text, re.S | re.M):
    name, body = m.group(1), m.group(2)
    uniques = []
    for line in body.split('\n'):
        line = line.strip()
        if line.startswith('//') or not line:
            continue
        g = re.match(r'(\w+)\s+\S+.*@unique\b', line)
        if g and not line.startswith('@@'):
            uniques.append([g.group(1)])
        h = re.match(r'@@unique\(\[([^\]]+)\]', line)
        if h:
            uniques.append([x.strip() for x in h.group(1).split(',')])
    if uniques:
        out[name] = uniques
(root / 'gateway' / 'src' / 'schema-uniques.json').write_text(json.dumps(out, indent=1), encoding='utf-8')
print(sum(len(v) for v in out.values()), 'unique constraints in', len(out), 'models')
