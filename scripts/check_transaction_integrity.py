# -*- coding: utf-8 -*-
"""Task 3: transaction-integrity detector for the xinmo DB.

Catches any row that a 500-on-/api/attempt crash could have left dirty:
  1. orphan attempts  (attempt.problem_id pointing at no problem)
  2. invalid problem.state        (not active/refined)
  3. ease/interval out of range   (ease !in [1.3,3.0], interval !in [0,60])
  4. due_date not YYYY-MM-DD      (should always be a floor'd date string)
  5. streak<0                     (streak must be >=0)

If python sqlite3 auto-rolls-back an uncommitted transaction on GC (the
behavior the /api/attempt crash relies on), the live DB should be clean.

Run: python scripts/check_transaction_integrity.py
"""
import sqlite3, re, sys, os

DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'xinmo.db')

def main():
    c = sqlite3.connect(DB)
    problems = 0
    issues = []

    orphan = c.execute(
        'SELECT COUNT(*) FROM attempt a LEFT JOIN problem p ON a.problem_id=p.id WHERE p.id IS NULL'
    ).fetchone()[0]
    if orphan:
        issues.append('ORPHAN_ATTEMPTS=%d' % orphan)
    print('orphan attempts (attempt.problem_id not in problem): %d' % orphan)

    bad_state = c.execute(
        "SELECT id,state FROM problem WHERE state NOT IN ('active','refined')"
    ).fetchall()
    for r in bad_state:
        issues.append('BAD_STATE id=%s state=%r' % (r[0], r[1]))
        print('  BAD_STATE id=%s state=%r' % (r[0], r[1]))

    bad_nums = c.execute(
        'SELECT id,ease,interval_days,streak FROM problem '
        'WHERE ease<1.3 OR ease>3.0 OR interval_days<0 OR interval_days>60 OR streak<0'
    ).fetchall()
    for r in bad_nums:
        issues.append('BAD_NUM id=%s ease=%s itv=%s streak=%s' % (r[0], r[1], r[2], r[3]))
        print('  BAD_NUM id=%s ease=%s itv=%s streak=%s' % (r[0], r[1], r[2], r[3]))

    pat = re.compile(r'^\d{4}-\d{2}-\d{2}$')
    for r in c.execute('SELECT id,due_date,rebound_at FROM problem'):
        problems += 1
        for col, v in (('due_date', r[1]), ('rebound_at', r[2])):
            if v is not None and not pat.match(v):
                issues.append('BAD_DATE id=%s %s=%r' % (r[0], col, v))
                print('  BAD_DATE id=%s %s=%r' % (r[0], col, v))

    print('problem rows checked: %d' % problems)
    c.close()

    if issues:
        print('\nRESULT: %d INCONSISTENT ROW(S) FOUND' % len(issues))
        sys.exit(1)
    print('\nRESULT: CLEAN (0 inconsistent rows)')

if __name__ == '__main__':
    main()