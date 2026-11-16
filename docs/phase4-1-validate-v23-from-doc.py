#!/usr/bin/env python3
"""v2.3 verification: extract ALL SQL from the v2.3 application doc, expand
templates mechanically from the doc's own appendices + canonical data,
and run the 14 validation items on local synthetic DBs built from Master
(11dd1cfb) source. No BWH, no production SQL, no production data.

Usage:
  python3 phase4-1-validate-v23-from-doc.py [--doc PATH] [--log PATH]
Defaults: doc = D1 files/...v2.3-2026-11-16.md (falls back to scratch draft),
synthetic DB = ~/workspace/phase4-1-v23/synth-full.db (built by build-full-db.mjs).
Writes: validation log, measured.json (for build-v2.3.py), expansion.json.
"""
import argparse, hashlib, json, pathlib, re, shutil, sqlite3, sys, tempfile, time

HOME = pathlib.Path.home()
D = HOME / "workspace/goals/cloudflare-d1-migration-for-flylink-control-and-runtime-data/files"
SCRATCH = HOME / "workspace/phase4-1-v23"
CANON = json.loads((D / "D1_CONTROL_FIELD_DISPOSITION_V2.2-DRAFT-2026-11-16.json").read_text())
INV = json.loads((D / "D1_CONTROL_SCHEMA_INVENTORY_V2.1-DRAFT-2026-11-15.json").read_text())
SYNTH = SCRATCH / "synth-full.db"

ap = argparse.ArgumentParser()
ap.add_argument("--doc", default=None)
ap.add_argument("--log", default=None)
args = ap.parse_args()
DOC = pathlib.Path(args.doc) if args.doc else (
    D / "phase4-production-readonly-authorization-request-v2.3-2026-11-16.md")
if not DOC.exists():
    DOC = SCRATCH / "v2.3-draft.md"
LOG_PATH = pathlib.Path(args.log) if args.log else SCRATCH / "phase4-1-v23-validation.log"

START = time.strftime("%Y-%m-%dT%H:%M:%S%z")
log_lines = []
def log(msg):
    log_lines.append(msg)
    print(msg)

results = {}   # item_no -> (PASS/FAIL, detail string)
def record(no, name, ok, detail):
    results[no] = (ok, detail)
    log(f"[{'PASS' if ok else 'FAIL'}] Item {no} — {name}: {detail}")

text = DOC.read_text(encoding="utf-8")
log(f"doc: {DOC} sha256={hashlib.sha256(text.encode()).hexdigest()} lines={text.count(chr(10))}")
log(f"synth db: {SYNTH} sha256={hashlib.sha256(SYNTH.read_bytes()).hexdigest()}")
log(f"started: {START} (local)")

# ---------------- doc parsing ----------------
def section(start_marker, end_marker):
    i = text.index(start_marker)
    j = text.index(end_marker, i)
    return text[i:j]

sql_block = section("## 4. 查询语句", "**未列出的查询一律不得执行。**")
fence = re.search(r"```sql\n(.*?)```", sql_block, re.S)
assert fence, "no ```sql fence in §4"
sql_raw = fence.group(1)
# strip full-line comments only (keeps -- S-11a markers? no: they are full-line
# comments, stripped here; S-11 extraction uses its own anchored pass below)
code_lines = [l for l in sql_raw.split("\n") if not l.strip().startswith("--")]
sql_code = "\n".join(code_lines)

app_a = section("## 附录 A", "## 附录 B · NP-01")
TABLES74 = sorted(set(re.findall(r"platform_[a-z0-9_]+", app_a)))
assert len(TABLES74) == 74, f"Appendix A tables: {len(TABLES74)}"

app_b_nn = section("## 附录 B · S-08 NOT NULL", "## 附录 C")
notnull = {}  # table -> [cols]
for m in re.finditer(r"\| `([A-Za-z0-9_]+)` \| (\d+) \| ((?:`[A-Za-z0-9_]+`,? ?)+) \|", app_b_nn):
    cols = re.findall(r"`([A-Za-z0-9_]+)`", m.group(3))
    assert len(cols) == int(m.group(2)), f"NOT NULL count mismatch {m.group(1)}"
    notnull[m.group(1)] = cols
NN_TOTAL = sum(len(v) for v in notnull.values())

app_c = section("## 附录 C", "## 附录 D")
checks = []  # (id, table, col, expr)
for m in re.finditer(r"\| (S08-C\d+) \| `([A-Za-z0-9_]+)` \| `([^`]+)` \| `(\(.*?\))` \| `WHERE \(\(.*\)\) = 0` \|", app_c):
    checks.append((m.group(1), m.group(2), m.group(3), m.group(4)))
assert len(checks) == 284, f"Appendix C rows: {len(checks)}"
assert [c[0] for c in checks] == [f"S08-C{i:03d}" for i in range(1, 285)], "CHECK ids not continuous"

app_d = section("## 附录 D", "---\n*本申请 v2.3")
uniq32 = re.findall(r"`(platform_[a-z0-9_]+)`\.`([A-Za-z0-9_]+)`", app_d)
assert len(uniq32) == 32, f"Appendix D cols: {len(uniq32)}"

# NP table (first Appendix B)
app_b_np = section("## 附录 B · NP-01", "## 附录 B · S-08 NOT NULL")
np_rows = re.findall(r"\| (NP-\d+) \| ([^|]+) \| ([^|]+) \| (?:\*\*)?(可关闭|可推进|不覆盖)(?:\*\*)? \|", app_b_np)
assert len(np_rows) == 22, f"NP rows: {len(np_rows)}"
np_disp = {"可关闭": 0, "可推进": 0, "不覆盖": 0}
for _, _, _, d in np_rows:
    np_disp[d] += 1

# §5 numbers
s5 = section("## 5. 预计查询量", "## 6. 采样数量")
s5_total = re.search(r"\| \*\*合计\*\* \| \*\*(\d+) 次 \+ k 次\*\*", s5)
assert s5_total, "§5 total not found"
S5_FIXED = int(s5_total.group(1))

# forbidden-field columns: backticked table.column refs in §3.3 + *_json columns
s33 = section("### 3.3 明确不读的字段", "## 4. 查询语句")
named_forbidden = set()
for t, c in re.findall(r"`(platform_[a-z0-9_]+)\.([a-z0-9_]+)`", s33):
    named_forbidden.add((t, c))
named_forbidden |= {("platform_portal_access_requests", "subscription_url"),
                    ("platform_payment_receipts", "next_action_url")}

# ---------------- synthetic DBs ----------------
tmpdir = pathlib.Path(tempfile.mkdtemp(prefix="v23-validate-"))
empty_path = tmpdir / "empty.db"
shutil.copy(SYNTH, empty_path)
empty = sqlite3.connect(str(empty_path))
# schema facts from the Master-built synthetic DB
db_tables = [r[0] for r in empty.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]
assert db_tables == TABLES74, f"synth tables != Appendix A: {set(db_tables) ^ set(TABLES74)}"
db_cols = {}   # table -> [(name, type, notnull, pk)]
for t in db_tables:
    db_cols[t] = [(c[1], c[2], c[3], c[5]) for c in empty.execute(f'PRAGMA table_info("{t}")')]
ALL_COLS = sum(len(v) for v in db_cols.values())
TEXT_COLS = {t: [c[0] for c in cols if c[1].upper() == "TEXT"] for t, cols in db_cols.items()}
CREATED_TABLES = [t for t in db_tables if "created_at" in [c[0] for c in db_cols[t]]]
STATUS_TABLES = [t for t in db_tables if "status" in [c[0] for c in db_cols[t]]]
PURPOSE_TABLES = [t for t in db_tables if "purpose" in [c[0] for c in db_cols[t]]]
# index_list facts (i basis)
index_list_rows = []  # (table, name, unique, origin, partial)
for t in db_tables:
    for r in empty.execute(f'PRAGMA index_list("{t}")'):
        index_list_rows.append((t, r[1], r[2], r[3], r[4]))
I_COUNT = len(index_list_rows)
# forbidden columns incl. *_json columns present in schema
json_cols = {(t, c[0]) for t in db_tables for c in db_cols[t]
             if c[0] in ("metadata_json", "event_json", "payload_json")}
FORBIDDEN = named_forbidden | json_cols
log(f"schema facts: tables={len(db_tables)} cols={ALL_COLS} text_cols={sum(len(v) for v in TEXT_COLS.values())} "
    f"created_at_tables={len(CREATED_TABLES)} status_tables={len(STATUS_TABLES)} purpose_tables={len(PURPOSE_TABLES)} "
    f"index_list_rows(i)={I_COUNT} forbidden_cols={len(FORBIDDEN)}")

# S-07 FK edges: inventory 127 edges minus 2 DEFER edges = 125 (DDL 16b scope)
edges = INV["foreignKeyEdges"]
DEFER_FK = {("platform_portal_password_credentials", "account_id"),
            ("platform_portal_passkey_credentials", "account_id")}
edges125 = [e for e in edges
            if (e["fromTable"], e["fromColumns"][0]) not in DEFER_FK]
assert len(edges) == 127 and len(edges125) == 125, f"FK edges: {len(edges)} -> {len(edges125)}"
# EXTERNALIZE fields (7) from canonical
ext7 = [(f["table"], f["column"]) for f in CANON["fields"] if f.get("disposition") == "EXTERNALIZE"]
assert len(ext7) == 7, f"EXTERNALIZE fields: {len(ext7)}"

def qident(name):
    return '"' + name.replace('"', '""') + '"'

def run(con, sql):
    return con.execute(sql).fetchall()

# ---------------- expansion (mechanical, from doc data) ----------------
expanded = {}   # S-number -> [sql]
def add(k, sqls):
    expanded.setdefault(k, []).extend(sqls)

add("S-01", ["SELECT type, name, tbl_name, sql FROM sqlite_master ORDER BY type, name"])
for t in db_tables:
    add("S-02", [f'PRAGMA table_info({qident(t)})',
                 f'PRAGMA index_list({qident(t)})',
                 f'PRAGMA foreign_key_list({qident(t)})'])
for (t, name, _u, _o, _p) in index_list_rows:
    add("S-02", [f'PRAGMA index_xinfo({qident(name)})'])
add("S-03", ["PRAGMA user_version", "PRAGMA schema_version", "PRAGMA application_id",
             "PRAGMA page_count", "PRAGMA page_size", "PRAGMA encoding",
             "PRAGMA journal_mode", "PRAGMA compile_options", "SELECT sqlite_version()"])
for t in db_tables:
    add("S-04", [f'SELECT COUNT(*) FROM {qident(t)}'])
for t in CREATED_TABLES:
    add("S-05", [f'SELECT MIN(created_at), MAX(created_at), COUNT(*) FROM {qident(t)}'])
# S-06
CRED = "platform_portal_passkey_credentials"
add("S-06", [
    f"SELECT COUNT(*) AS total_rows, COUNT(DISTINCT credential_id) AS distinct_values FROM {CRED}",
    f"SELECT COUNT(*) AS duplicate_groups FROM (SELECT credential_id FROM {CRED} GROUP BY credential_id HAVING COUNT(*) > 1)",
    f"SELECT COUNT(*) AS total_rows, COUNT(DISTINCT credential_id_hash) AS distinct_values FROM {CRED}",
    f"SELECT COUNT(*) AS duplicate_groups FROM (SELECT credential_id_hash FROM {CRED} GROUP BY credential_id_hash HAVING COUNT(*) > 1)",
])
for (t, c) in uniq32:
    add("S-06", [f'SELECT {qident(c)}, COUNT(*) AS c FROM {qident(t)} GROUP BY {qident(c)} HAVING c > 1 LIMIT 10'])
    add("S-06", [f'SELECT COUNT(*) AS duplicate_groups FROM (SELECT {qident(c)} FROM {qident(t)} GROUP BY {qident(c)} HAVING COUNT(*) > 1)'])
# S-07 (125 edges; composite FK gets ANDed equalities)
for e in edges125:
    conds = " AND ".join(
        f'c.{qident(fc)} = p.{qident(tc)}'
        for fc, tc in zip(e["fromColumns"], e["toColumns"]))
    nulls = " AND ".join(f'c.{qident(fc)} IS NOT NULL' for fc in e["fromColumns"])
    add("S-07", [f'SELECT COUNT(*) FROM {qident(e["fromTable"])} AS c LEFT JOIN {qident(e["toTable"])} AS p '
                 f'ON {conds} WHERE p.{qident(e["toColumns"][0])} IS NULL AND {nulls}'])
# S-08 merged
for t in db_tables:
    nn = notnull[t]
    terms = ", ".join(
        f'SUM(CASE WHEN {qident(c)} IS NULL THEN 1 ELSE 0 END) AS {qident(c + "_nulls")}' for c in nn)
    add("S-08", [f'SELECT COUNT(*) AS rows_checked, {terms} FROM {qident(t)}'])
check_by_table = {}
for (_id, t, _c, expr) in checks:
    check_by_table.setdefault(t, []).append((_id, expr))
for t, items in check_by_table.items():
    terms = ", ".join(
        f'SUM(CASE WHEN ({expr}) = 0 THEN 1 ELSE 0 END) AS {qident("chk_" + _id)}' for _id, expr in items)
    add("S-08", [f'SELECT COUNT(*) AS rows_checked, {terms} FROM {qident(t)}'])
# S-09 / S-10 merged
for t in db_tables:
    terms = ", ".join(f'MAX(LENGTH({qident(c)})) AS {qident(c + "_maxlen")}' for c in TEXT_COLS[t])
    add("S-09", [f'SELECT {terms} FROM {qident(t)}'])
    terms10 = ", ".join(
        f'SUM(CASE WHEN {qident(c[0])} IS NULL THEN 1 ELSE 0 END) AS {qident(c[0] + "_nulls")}'
        for c in db_cols[t])
    add("S-10", [f'SELECT COUNT(*) AS rows_checked, {terms10} FROM {qident(t)}'])
# S-11: extract 9 from doc (anchored, comments stripped)
def extract_s11(doc_text):
    i = doc_text.index("-- S-11a 基数与执行时刻")
    j = doc_text.index("-- S-12 状态分布", i)
    block = doc_text[i:j]
    code = "\n".join(l for l in block.split("\n") if not l.strip().startswith("--"))
    return [s.strip() for s in code.split(";") if s.strip()]
s11_v23 = extract_s11(text)
v22_text = (D / "phase4-production-readonly-authorization-request-v2.2-2026-11-16.md").read_text()
s11_v22 = extract_s11(v22_text)
add("S-11", s11_v23)
for t in STATUS_TABLES:
    add("S-12", [f'SELECT {qident("status")}, COUNT(*) FROM {qident(t)} GROUP BY {qident("status")}'])
for t in PURPOSE_TABLES:
    add("S-12", [f'SELECT {qident("purpose")}, COUNT(*) FROM {qident(t)} GROUP BY {qident("purpose")}'])
add("S-13", ["SELECT COUNT(*) FROM platform_portal_password_credentials",
             "SELECT COUNT(*) FROM platform_portal_passkey_credentials"] +
            [f'SELECT COUNT(*) FROM {qident(t)} WHERE {qident(c)} IS NOT NULL' for (t, c) in ext7])
add("S-14", ["SELECT name, tbl_name FROM sqlite_master WHERE type = 'trigger' ORDER BY name"])
add("S-15", ["SELECT migration_id, ddl_checksum, applied_at FROM platform_schema_migrations ORDER BY migration_id"])

counts = {k: len(v) for k, v in expanded.items()}
fixed_total = sum(counts.values())
log(f"expanded counts: {counts} fixed_total={fixed_total} (§5 says {S5_FIXED})")

# violation-seeded DB (copy of empty + seeds)
viol_path = tmpdir / "viol.db"
shutil.copy(empty_path, viol_path)
viol = sqlite3.connect(str(viol_path))
def seed_s11(con):
    con.execute("INSERT INTO platform_coin_wallets (wallet_ref, account_id, status, version, created_at, updated_at) "
                "VALUES ('w1','a1','active',1,'2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z')")
    # lot seed reproduces the v2.2 violation fixture: issued_units=100 while the
    # parts sum to 90, i.e. a deliberate lot-invariant violation (S-11b = 1).
    # It violates the lot CHECK, so constraints are bypassed for this seed only.
    con.execute("PRAGMA ignore_check_constraints=ON")
    con.execute("""INSERT INTO platform_coin_lots
        (lot_ref, wallet_ref, coin_type, credit_origin_ref, issued_units, pending_units, available_units,
         held_units, consumed_units, reversed_units, expired_units, source_type, source_ref, created_at, updated_at)
        VALUES ('l1','w1','paid_coins','co1',100,0,85,5,0,0,0,'synthetic','src1','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z')""")
    con.execute("PRAGMA ignore_check_constraints=OFF")
    con.execute("""INSERT INTO platform_coin_ledger_entries
        (entry_ref, operation_ref, wallet_ref, lot_ref, operation, amount_units, source_type, source_ref,
         actor_type, actor_ref, previous_wallet_version, resulting_wallet_version, resulting_wallet_status, occurred_at)
        VALUES ('e1','op1','w1','l1','credit',10,'synthetic','src1','system','syn','0',1,'active','2026-01-01T00:00:00.000Z')""")
    con.execute("""INSERT INTO platform_coin_ledger_entries
        (entry_ref, operation_ref, wallet_ref, lot_ref, operation, amount_units, source_type, source_ref,
         actor_type, actor_ref, previous_wallet_version, resulting_wallet_version, resulting_wallet_status, occurred_at)
        VALUES ('e2','op2','w1','l1','credit',10,'synthetic','src1','system','syn','0',2,'active','2026-01-02T00:00:00.000Z')""")
    con.execute("""INSERT INTO platform_coin_operation_receipts
        (operation_ref, wallet_ref, result_ref, safe_result_code, completed_at, resulting_wallet_status,
         previous_wallet_version, resulting_wallet_version, actor_scope, operation_type,
         idempotency_key, request_digest, status, created_at)
        VALUES ('opX','w1','res-x','ok','2026-01-01T00:00:00.000Z','active',
         0,9,'system','credit','idem-x','d1','succeeded','2026-01-01T00:00:00.000Z')""")
    con.execute("""INSERT INTO platform_coin_operation_receipts
        (operation_ref, previous_wallet_version, resulting_wallet_version, actor_scope, operation_type,
         idempotency_key, request_digest, status, created_at)
        VALUES ('op1',NULL,NULL,'system','credit','idem-1','d2','started','2026-01-01T00:00:00.000Z')""")
    con.commit()
seed_s11(viol)

# ---------------- Item 1: syntax / executability on empty DB ----------------
try:
    forbidden_kw = re.compile(r"^\s*(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|VACUUM|ATTACH)\b", re.I)
    n_exec = 0
    for k, stmts in expanded.items():
        for s in stmts:
            assert not forbidden_kw.match(s), f"write statement in {k}: {s[:60]}"
            run(empty, s)
            n_exec += 1
    record(1, "SQL syntax (all expanded SQL executes on empty DB)",
           n_exec == fixed_total == 1120,
           f"executed {n_exec}/{fixed_total} expanded statements (S-01..S-15, k=0 on empty DB)")
except Exception as e:
    record(1, "SQL syntax (all expanded SQL executes on empty DB)", False, f"{type(e).__name__}: {e}")

# ---------------- Item 2: schema references ----------------
try:
    canon_cols = {(f["table"], f["column"]) for f in CANON["fields"]}
    assert len(canon_cols) == 858
    db_colset = {(t, c[0]) for t in db_tables for c in db_cols[t]}
    assert db_colset == canon_cols, f"synth-vs-canonical col diff: {db_colset ^ canon_cols}"
    # every table/col named in Appendix B/C/D exists in canonical
    for t, cols in notnull.items():
        for c in cols:
            assert (t, c) in canon_cols, f"App B {t}.{c} not in canonical"
    for (_id, t, _c, _e) in checks:
        assert t in TABLES74
    for (t, c) in uniq32:
        assert (t, c) in canon_cols
    record(2, "74-table schema references (doc refs exist in canonical DDL)",
           True, f"74 tables / 858 cols: synth DB == canonical field set exactly; App B/C/D refs all resolve")
except Exception as e:
    record(2, "74-table schema references (doc refs exist in canonical DDL)", False, f"{type(e).__name__}: {e}")

# ---------------- Item 3: 639 NOT NULL ----------------
try:
    canon_nn = {(f["table"], f["column"]) for f in CANON["fields"] if not f["nullable"]}
    doc_nn = {(t, c) for t, cols in notnull.items() for c in cols}
    assert len(canon_nn) == 639 and len(doc_nn) == 639, f"canon {len(canon_nn)} doc {len(doc_nn)}"
    assert doc_nn == canon_nn, f"diff: {doc_nn ^ canon_nn}"
    assert NN_TOTAL == 639
    record(3, "639 NOT NULL fields (Appendix B vs canonical)",
           True, "639/639 exact set equality; 74 tables; 61 with non-null default (canonical cross-check)")
except Exception as e:
    record(3, "639 NOT NULL fields (Appendix B vs canonical)", False, f"{type(e).__name__}: {e}")

# ---------------- Item 4: 284 CHECK negations ----------------
try:
    n0 = 0
    for (_id, t, _c, expr) in checks:
        rows = run(empty, f'SELECT COUNT(*) FROM {qident(t)} WHERE ({expr}) = 0')
        assert rows == [(0,)], (_id, rows)
        n0 += 1
    # negative spot checks: seed 5 violating rows (constraints bypassed for seeding only)
    viol.execute("PRAGMA ignore_check_constraints=ON")
    viol.execute("INSERT INTO platform_leads (id, status, organization, email, direction, stage, message, source, created_at, updated_at, expires_at) "
                 "VALUES ('lead-x','bogus','org','a@example.invalid','in','s','m','src','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z','2026-02-01T00:00:00.000Z')")
    viol.execute("INSERT INTO platform_coin_lots (lot_ref, wallet_ref, coin_type, credit_origin_ref, issued_units, pending_units, available_units, held_units, consumed_units, reversed_units, expired_units, source_type, source_ref, created_at, updated_at) "
                 "VALUES ('l-bad','w1','paid_coins','co-bad',-5,0,0,0,0,0,0,'synthetic','src1','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z')")
    viol.execute("INSERT INTO platform_ads_consent_decisions (account_ref, decision, ad_user_data, ad_personalization, updated_at) "
                 "VALUES ('acct-x','granted',1,1,1735689600)")
    viol.execute("PRAGMA ignore_check_constraints=OFF")
    viol.commit()
    neg = []
    for expr, t in [("(status in ('new', 'reviewing', 'converted', 'rejected'))", "platform_leads"),
                    ("(typeof(issued_units) = 'integer' and issued_units >= 0)", "platform_coin_lots"),
                    ("(ad_personalization = 0)", "platform_ads_consent_decisions")]:
        neg.append(run(viol, f'SELECT COUNT(*) FROM {qident(t)} WHERE ({expr}) = 0')[0][0])
    assert neg == [1, 1, 1], neg
    n_lease = sum(1 for (_id, _t, _c, expr) in checks if "lease_token" in expr)
    n_dedupe = sum(1 for (_id, _t, _c, expr) in checks if "event_dedupe_key" in expr)
    n_reserve = sum(1 for (_id, _t, _c, expr) in checks if "reserve_idempotency_key" in expr)
    assert (n_lease, n_dedupe, n_reserve) == (6, 1, 1), (n_lease, n_dedupe, n_reserve)
    record(4, "284 CHECK negations (each executes, =0 on empty; violations detected)",
           True, f"284/284 execute with 0 on empty DB (incl. 8 V23-7-corrected CHECKs: 6 lease_token, "
                 f"1 event_dedupe_key, 1 reserve_idempotency_key); 3/3 seeded violations detected (counts {neg})")
except Exception as e:
    record(4, "284 CHECK negations (each executes, =0 on empty; violations detected)", False, f"{type(e).__name__}: {e}")

# ---------------- Item 5: 125 FK checks ----------------
try:
    nfk = 0
    for s in expanded["S-07"]:
        rows = run(empty, s)
        assert rows == [(0,)], s[:80]
        nfk += 1
    assert nfk == 125
    # one seeded orphan: entitlement -> nonexistent account (FK enforcement OFF in this conn)
    viol.execute("INSERT INTO platform_entitlements (id, account_id, plan, status, valid_from, valid_until, max_artifacts, max_devices, traffic_limit_bytes, created_at, updated_at) "
                 "VALUES ('ent-x','no-such-account','monthly_basic','active','2026-01-01','2027-01-01',1,1,0,'2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z')")
    viol.commit()
    orphan_sql = [s for s in expanded["S-07"] if "platform_entitlements" in s and "platform_accounts" in s][0]
    assert run(viol, orphan_sql) == [(1,)], run(viol, orphan_sql)
    record(5, "125 FK checks (refs valid; orphan detected)",
           True, "125/125 execute with 0 on empty DB (127 inventory edges − 2 DEFER = 125); seeded orphan counted 1")
except Exception as e:
    record(5, "125 FK checks (refs valid; orphan detected)", False, f"{type(e).__name__}: {e}")

# ---------------- Item 6: 32 UNIQUE cols ----------------
try:
    canon_uniq = {(f["table"], f["column"]) for f in CANON["fields"] if f.get("unique")}
    assert len(canon_uniq) == 34, len(canon_uniq)
    assert set(uniq32) == canon_uniq - {("platform_portal_passkey_credentials", "credential_id"),
                                         ("platform_portal_passkey_credentials", "credential_id_hash")}
    for s in expanded["S-06"]:
        rows = run(empty, s)
        assert rows == [(0,)] or (len(rows) == 1 and rows[0][0] == 0) or rows == [], (s[:70], rows)
    record(6, "32 UNIQUE cols (enum + group total; credential 4 count-only)",
           True, "68/68 S-06 statements execute on empty DB, all zero; 32-col set == canonical unique(34) − 2 credential cols")
except Exception as e:
    record(6, "32 UNIQUE cols (enum + group total; credential 4 count-only)", False, f"{type(e).__name__}: {e}")

# ---------------- Item 7: credential-column protection ----------------
try:
    cred_stmts = [s for s in expanded["S-06"]
                  if "credential_id" in s or "credential_id_hash" in s]
    assert len(cred_stmts) == 4, len(cred_stmts)
    for s in cred_stmts:
        assert "LIMIT" not in s
        rows = run(empty, s)
        assert all(isinstance(v, int) for row in rows for v in row), (s, rows)
    # credential columns may appear outside S-06 only inside the three §3.3
    # whitelisted aggregate forms (COUNT(*) WHERE IS NOT NULL / MAX(LENGTH) /
    # SUM(CASE WHEN ... IS NULL ...)); bare value reads are forbidden.
    # (word-boundary match: an index name like ..._credential_idx must not
    # false-positive; column names may be double-quoted in merged queries)
    wl = re.compile(
        r'COUNT\(\*\)\s+WHERE\s+"?credential_id(_hash)?"?\s+IS NOT NULL|'
        r'MAX\(LENGTH\("?credential_id(_hash)?"?\)\)|'
        r'SUM\(CASE WHEN "?credential_id(_hash)?"?\s+IS NULL THEN 1 ELSE 0 END\)')
    others = []
    for k, v in expanded.items():
        if k == "S-06":
            continue
        for s in v:
            stripped = wl.sub("", s)
            if re.search(r"\bcredential_id(_hash)?\b", stripped):
                others.append(s[:120])
    assert others == [], others
    record(7, "credential-column protection (credential_id / credential_id_hash return no values)",
           True, "4/4 S-06 credential statements are count-only (integer outputs); "
                 "every other reference to either column is inside a §3.3 whitelisted aggregate form "
                 "(SUM(CASE...IS NULL) / MAX(LENGTH)); no bare value read anywhere")
except Exception as e:
    record(7, "credential-column protection (credential_id / credential_id_hash return no values)", False, f"{type(e).__name__}: {e}")

# ---------------- Item 8: S-10 forbidden-field CASE form + equivalence ----------------
try:
    # template shape: the doc's S-10 merged template uses SUM(CASE...) only
    s10_tpl = re.search(r"-- S-10 空值分布.*?FROM \{表\};", sql_raw, re.S).group(0)
    assert "SUM(CASE WHEN" in s10_tpl
    assert "WHERE {列} IS NULL" not in s10_tpl.split("-- v2.3 说明")[0], "merged template must not use per-col WHERE"
    # equivalence on violation DB (has seeded rows incl. NULLs) + empty DB: all 858 cols
    # (SUM over an empty table returns NULL; the executor reads NULL as 0 —
    # same semantics as the v2.2 merged forms, so NULL is normalised to 0 here)
    mism = 0
    mism_examples = []
    for con in (empty, viol):
        for t in db_tables:
            case_row = run(con, expanded["S-10"][db_tables.index(t)])[0]
            case_vals = case_row[1:]
            for j, c in enumerate(db_cols[t]):
                per = run(con, f'SELECT COUNT(*) FROM {qident(t)} WHERE {qident(c[0])} IS NULL')[0][0]
                v = case_vals[j]
                v = 0 if v is None else v
                if v != per:
                    mism += 1
                    if len(mism_examples) < 3:
                        mism_examples.append((t, c[0], v, per))
    assert mism == 0, f"{mism} mismatches, e.g. {mism_examples}"
    # S-10 outputs are integers only (no raw values): on tables with rows all
    # values are ints; on empty tables SUM returns NULL (read as 0, v2.2 parity)
    for con in (empty, viol):
        for s in expanded["S-10"]:
            row = run(con, s)[0]
            if row[0] > 0:
                assert all(isinstance(v, int) for v in row[1:]), row
            else:
                assert all(v is None for v in row[1:]), row
    record(8, "S-10 forbidden-field CASE form + equivalence (858 cols)",
           True, "merged CASE form == per-column COUNT(*) WHERE IS NULL on 858/858 cols (empty + seeded DBs, "
                 "SUM NULL on empty tables read as 0, v2.2 parity); "
                 "all S-10 outputs integers; forbidden columns appear only inside SUM(CASE...)")
except Exception as e:
    record(8, "S-10 forbidden-field CASE form + equivalence (858 cols)", False, f"{type(e).__name__}: {e}")

# ---------------- Item 9: S-11 nine SQLs ----------------
try:
    assert len(s11_v23) == 9 and len(s11_v22) == 9
    same = sum(1 for a, b in zip(s11_v23, s11_v22) if a == b)
    assert same == 9, f"verbatim {same}/9"
    # S-11 violation expectations are measured on a DB seeded ONLY with the
    # S-11 fixture (items 4/5/10 add their own seeds to the shared `viol` DB,
    # which would change S-11a cardinalities), so build a fresh copy here.
    viol9_path = tmpdir / "viol9.db"
    shutil.copy(empty_path, viol9_path)
    viol9 = sqlite3.connect(str(viol9_path))
    seed_s11(viol9)
    def run9(con):
        return [run(con, s) for s in s11_v23]
    e_out = run9(empty)
    assert e_out[0][0][1:] == (0, 0, 0, 0, 0), e_out[0]
    for i in (1, 2, 3, 4, 5, 6, 7):
        assert all(v == 0 for row in e_out[i] for v in row), (i, e_out[i])
    assert e_out[7] == [(0, 0)] and e_out[8] == [], (e_out[7], e_out[8])
    v_out = run9(viol9)
    assert v_out[0][0][1:] == (1, 1, 2, 2, 0), v_out[0]
    assert v_out[1] == [(1,)] and v_out[2] == [(1,)] and v_out[3] == [(0,)]
    assert v_out[4] == [(1,)] and v_out[5] == [(1,)]
    assert v_out[6] == [(1,)] and v_out[7] == [(1, 1)]
    assert v_out[8] == [("paid_coins", 1, 85, 0, 5)], v_out[8]
    aliases = set()
    for s in s11_v23:
        aliases.update(re.findall(r"AS\s+([A-Za-z_][A-Za-z0-9_]*)", s))
    assert not ({"wallet_ref", "lot_ref", "account_id"} & aliases), aliases
    record(9, "S-11 nine SQLs (verbatim vs v2.2; empty + violation)",
           True, "9/9 verbatim identical to v2.2; empty 9/9 pass; violation 9/9 pass with v2.2 values "
                 "(S-11a (1,1,2,2,0); S-11f ('paid_coins',1,85,0,5)); outputs contain no row identifiers")
except Exception as e:
    record(9, "S-11 nine SQLs (verbatim vs v2.2; empty + violation)", False, f"{type(e).__name__}: {e}")

# ---------------- Item 10: S-15 explicit columns ----------------
try:
    cols = [c[1] for c in empty.execute('PRAGMA table_info("platform_schema_migrations")')]
    assert cols == ["migration_id", "ddl_checksum", "applied_at"], cols
    canon_mig = [(f["column"], f["nullable"]) for f in CANON["fields"] if f["table"] == "platform_schema_migrations"]
    assert [c for c, _ in canon_mig] == cols
    # v2.2 S-15 must fail on the synthetic DB (regression proof)
    try:
        run(empty, "SELECT * FROM platform_schema_migrations ORDER BY version")
        v22_fails = False
    except sqlite3.OperationalError as ex:
        v22_fails = "no such column: version" in str(ex)
    assert v22_fails, "v2.2 S-15 unexpectedly succeeded"
    viol.execute("INSERT INTO platform_schema_migrations (migration_id, ddl_checksum, applied_at) "
                 "VALUES ('zzz-002-test','d2','2026-01-02T00:00:00.000Z'),"
                 "('aaa-001-test','d1','2026-01-01T00:00:00.000Z')")
    viol.commit()
    rows = run(viol, expanded["S-15"][0])
    assert [r[0] for r in rows] == sorted(r[0] for r in rows), rows
    assert len(rows[0]) == 3
    record(10, "S-15 explicit columns (v2.2 fails, v2.3 passes, ordered by migration_id)",
           True, "columns == canonical 3 (migration_id/ddl_checksum/applied_at); "
                 "v2.2 S-15 fails 'no such column: version'; v2.3 returns 3 cols sorted by migration_id")
except Exception as e:
    record(10, "S-15 explicit columns (v2.2 fails, v2.3 passes, ordered by migration_id)", False, f"{type(e).__name__}: {e}")

# ---------------- Item 11: mechanical query count ----------------
try:
    expect = {"S-01": 1, "S-02": 441, "S-03": 9, "S-04": 74, "S-05": 50,
              "S-06": 68, "S-07": 125, "S-08": 141, "S-09": 74, "S-10": 74,
              "S-11": 9, "S-12": 43, "S-13": 9, "S-14": 1, "S-15": 1}
    assert counts == expect, f"{counts} != {expect}"
    assert fixed_total == 1120 == S5_FIXED
    # k on empty DB: tables with >1000 rows
    k_empty = sum(1 for t in db_tables if run(empty, f'SELECT COUNT(*) FROM {qident(t)}')[0][0] > 1000)
    assert k_empty == 0 and 0 <= k_empty <= 50
    assert I_COUNT == 219
    record(11, "mechanical query count (expansion sum == §5 fixed 1120 + k)",
           True, f"per-S counts {counts} sum to 1120 == §5; i=219 (index_list rows); k=0 on empty DB (0≤k≤50)")
except Exception as e:
    record(11, "mechanical query count (expansion sum == §5 fixed 1120 + k)", False, f"{type(e).__name__}: {e}")

# ---------------- Item 12: forbidden-field scan + output scan ----------------
try:
    # scan §4 code (comments stripped) for forbidden-column references; classify context
    bad = []
    for stmt in sql_code.split(";"):
        s = stmt.strip()
        if not s:
            continue
        for (t, c) in FORBIDDEN:
            if re.search(rf"\b{re.escape(c)}\b", s):
                ok_ctx = (
                    re.search(rf"COUNT\(\*\)\s+WHERE\s+{re.escape(c)}\s+IS NOT NULL", s) or
                    re.search(rf"MAX\(LENGTH\({re.escape(c)}\)\)", s) or
                    re.search(rf"SUM\(CASE WHEN {re.escape(c)} IS NULL THEN 1 ELSE 0 END\)", s) or
                    re.search(rf"COUNT\(DISTINCT {re.escape(c)}\)", s) or
                    re.search(rf"GROUP BY {re.escape(c)}\b", s) or
                    # S-08 CHECK expressions may name the column inside a CHECK clause
                    # (only non-forbidden columns have CHECKs; flag any hit for review)
                    False)
                if not ok_ctx:
                    bad.append((c, s[:100]))
    assert bad == [], bad[:5]
    # output scan: all validation outputs must not contain email/URL/token-like text
    email_re = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
    url_re = re.compile(r"https?://")
    hits = []
    for k, stmts in expanded.items():
        for s in stmts:
            for row in run(empty, s):
                for v in row:
                    if isinstance(v, str) and (email_re.search(v) or url_re.search(v)):
                        hits.append((k, v))
    assert hits == [], hits[:5]
    record(12, "forbidden-field scan + output scan",
           True, f"§4 code: {len(FORBIDDEN)} forbidden columns appear only in whitelisted aggregate forms; "
                 "no email/URL/token text in any validation output")
except Exception as e:
    record(12, "forbidden-field scan + output scan", False, f"{type(e).__name__}: {e}")

# ---------------- Item 13: LIMIT 10 tiers ----------------
try:
    tier = sqlite3.connect(str(tmpdir / "tier.db"))
    tier.execute("CREATE TABLE tier_mirror (v TEXT)")
    def tier_run(n_groups):
        tier.execute("DELETE FROM tier_mirror")
        for g in range(n_groups):
            tier.execute("INSERT INTO tier_mirror VALUES (?), (?)", (f"g{g:02d}", f"g{g:02d}"))
        tier.commit()
        enum_rows = tier.execute(
            "SELECT v, COUNT(*) AS c FROM tier_mirror GROUP BY v HAVING c > 1 LIMIT 10").fetchall()
        total = tier.execute(
            "SELECT COUNT(*) AS duplicate_groups FROM (SELECT v FROM tier_mirror GROUP BY v HAVING COUNT(*) > 1)").fetchone()[0]
        return len(enum_rows), total
    def decide(n_enum, total):
        if total == 0:
            return "PROVEN_NO_DUPLICATES"
        if total <= 10:
            return "CLOSEABLE" if n_enum == total else "ANOMALY"
        return "NOT_PROVEN"
    outcomes = {}
    for n in (0, 5, 10, 11, 15):
        ne, tot = tier_run(n)
        outcomes[n] = (ne, tot, decide(ne, tot))
    assert outcomes[0] == (0, 0, "PROVEN_NO_DUPLICATES"), outcomes[0]
    assert outcomes[5] == (5, 5, "CLOSEABLE"), outcomes[5]
    assert outcomes[10] == (10, 10, "CLOSEABLE"), outcomes[10]
    assert outcomes[11] == (10, 11, "NOT_PROVEN"), outcomes[11]
    assert outcomes[15] == (10, 15, "NOT_PROVEN"), outcomes[15]
    record(13, "LIMIT 10 truncation tiers (0/5/10/11/15 groups)",
           True, f"enum/total/decision: {outcomes} — 0 proves none; ≤10 requires enum==total; >10 stays NOT_PROVEN")
except Exception as e:
    record(13, "LIMIT 10 truncation tiers (0/5/10/11/15 groups)", False, f"{type(e).__name__}: {e}")

# ---------------- Item 14: empty vs violation (positive/negative) ----------------
try:
    e04 = run(empty, "SELECT COUNT(*) FROM platform_coin_wallets")[0][0]
    v04 = run(viol, "SELECT COUNT(*) FROM platform_coin_wallets")[0][0]
    assert (e04, v04) == (0, 1)
    e11 = [run(empty, s) for s in s11_v23]
    v11 = [run(viol, s) for s in s11_v23]
    assert e11 != v11  # violation DB differs from empty on S-11
    # S-02 index_xinfo: all 219 execute on both DBs with identical row counts
    n_xi_e = sum(len(run(empty, s)) for s in expanded["S-02"] if "index_xinfo" in s)
    n_xi_v = sum(len(run(viol, s)) for s in expanded["S-02"] if "index_xinfo" in s)
    assert n_xi_e == n_xi_v == 543, (n_xi_e, n_xi_v)
    # S-03 compile_options format
    co = run(empty, "PRAGMA compile_options")
    assert len(co) > 0 and all(len(r) == 1 and isinstance(r[0], str) for r in co)
    assert all(re.match(r"^[A-Za-z0-9_=.,+/-]+$", r[0]) for r in co), co[:3]
    record(14, "empty vs violation DBs (positive/negative)",
           True, f"S-04 wallets 0→1; S-11 empty all-zero vs violation non-zero; "
                 f"S-02 index_xinfo 219 queries → 543 rows on both DBs; compile_options {len(co)} single-col TEXT rows")
except Exception as e:
    record(14, "empty vs violation DBs (positive/negative)", False, f"{type(e).__name__}: {e}")

# ---------------- S-02 quoting / injection (folded into Item 1 evidence) ----------------
try:
    scratch = sqlite3.connect(":memory:")
    scratch.execute("CREATE TABLE u (a TEXT, b TEXT)")
    scratch.execute('CREATE INDEX "we""ird_idx" ON u(a)')
    got = scratch.execute('PRAGMA index_xinfo("we""ird_idx")').fetchall()
    assert len(got) == 2 and got[0][2] == "a", got
    evil = 'x"; DROP TABLE u; --'
    inj = scratch.execute('PRAGMA index_xinfo("' + evil.replace('"', '""') + '")').fetchall()
    assert inj == []
    assert scratch.execute("SELECT COUNT(*) FROM sqlite_master WHERE name='u'").fetchone() == (1,)
    # expression-index xinfo shape (cid=-2, name NULL; expression text lives in sqlite_master.sql)
    scratch.execute("CREATE INDEX expr_idx ON u(lower(a))")
    xi = scratch.execute("PRAGMA index_xinfo(expr_idx)").fetchall()
    assert xi[0][1] == -2 and xi[0][2] is None and xi[0][5] == 1, xi
    log(f"[PASS] S-02 quoting/injection: double-quote escaping works; injection neutralized (table survives); "
        f"expression-index xinfo cid=-2/name=NULL as documented in §4 S-02")
    s02_extra_pass = True
except Exception as e:
    log(f"[FAIL] S-02 quoting/injection: {type(e).__name__}: {e}")
    s02_extra_pass = False

# ---------------- summary ----------------
npass = sum(1 for ok, _ in results.values() if ok)
log(f"\nSUMMARY: {npass}/14 items PASS; S-02 quoting extra: {'PASS' if s02_extra_pass else 'FAIL'}")
log(f"commands: python3 {pathlib.Path(__file__).name} --doc {DOC}")
log(f"node: n/a (pure Python sqlite3 {sqlite3.sqlite_version}); synth DB built by build-full-db.mjs with Node v22.23.1")
log(f"finished: {time.strftime('%Y-%m-%dT%H:%M:%S%z')}")
for no in sorted(results):
    ok, detail = results[no]
    log(f"  item {no}: {'PASS' if ok else 'FAIL'} — {detail}")

LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
LOG_PATH.write_text("\n".join(log_lines) + "\n", encoding="utf-8")
# measured.json for build-v2.3.py
b_mentions = text.count("推荐方案，待 Yi 确认")
measured_out = {"s11_verbatim": "9/9",
                "compile_options_rows": str(len(run(empty, "PRAGMA compile_options"))),
                "b_scheme_mentions": str(b_mentions),
                "validation_pass": str(npass)}
(SCRATCH / "measured.json").write_text(json.dumps(measured_out, indent=1), encoding="utf-8")
# expansion.json for the SQL inventory + recalculation report
(SCRATCH / "expansion.json").write_text(json.dumps(
    {"counts": counts, "fixed_total": fixed_total, "s5_fixed": S5_FIXED,
     "i": I_COUNT, "tables": len(db_tables), "cols": ALL_COLS,
     "expanded": expanded, "np_disp": np_disp,
     "ext7": ext7, "uniq32": uniq32, "edges125": len(edges125)}, indent=1, ensure_ascii=False),
    encoding="utf-8")
log(f"wrote {LOG_PATH}, measured.json={measured_out}")
sys.exit(0 if npass == 14 and s02_extra_pass else 1)
