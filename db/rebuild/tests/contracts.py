"""Offline contract inventory. Table coverage, not proof of all dynamic columns."""
from pathlib import Path
import re
root=Path(__file__).resolve().parents[3]
schema=(Path(__file__).resolve().parents[1]/'migrations/001_schema.sql').read_text()
tables=set(re.findall(r'CREATE TABLE public\.(\w+)',schema))|{'public_live_feeds','movies'}
refs={}
for folder in ['peep/src','supabase/functions']:
 for p in (root/folder).rglob('*'):
  if p.is_file() and p.suffix in ('.js','.jsx','.ts','.tsx'):
   s=p.read_text()
   for name in re.findall(r'(?<!storage)\.from\(["\']([a-z_]+)["\']\)',s):
    if name not in {'content','avatars','peep-media'}: refs.setdefault(name,[]).append(str(p.relative_to(root)))
missing=set(refs)-tables
assert not missing, f'Missing tables: {missing}'
assert refs, 'Run from repository db/rebuild/tests'
print(f'PASS: {len(refs)} literal table/view contracts covered; {len(tables)-2} base tables. Dynamic columns still require integration checks.')
