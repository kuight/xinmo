# ITEM 4+5: end-to-end /api/attempt test - 4 consecutive goods
# asserts interval 1/3/8.4/24.36, review offsets 0/1/4/12, refined on 4th
import json, urllib.request, sqlite3, datetime
BASE = 'http://127.0.0.1:8092'
def post(path, obj):
    req = urllib.request.Request(BASE+path, data=json.dumps(obj).encode('utf-8'), method='POST', headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read().decode('utf-8'))
# create throwaway problem
created = post('/api/problem', {'subject':'physics','topic':'kin-velocity','topic_label':'pingjun','error_type':'concept','question_type':'choice','note':'','answer_text':'B','source':'e2e','image_path':'/images/e2e_test.jpg','answer_image_path':''})
pid = created['problem']['id']
day0s = created['problem']['due_date']
day0 = datetime.date.fromisoformat(day0s).toordinal()
print('created pid=%d day0=%s' % (pid, day0s))
intervals=[]; due_days=[]; review_offsets=[0]; refined_after=None
prev_day = day0
for i in range(1,5):
    if i>1:
        prev_day = day0 + round(sum(intervals))  # day we're reviewing on
    a = post('/api/attempt', {'problem_id':pid,'result':'good','my_answer':'B','judged':'correct','seconds':10})
    p = a['problem']
    intervals.append(round(p['interval_days'],2))
    due_days.append((datetime.date.fromisoformat(p['due_date']).toordinal()-day0))
    if i>1: review_offsets.append(prev_day-day0)
    if p['state']=='refined': refined_after=i
    print(' good#%d: interval=%.2f due_offset=%d state=%s' % (i, p['interval_days'], due_days[-1], p['state']))
print('REVIEW_OFFSETS=', review_offsets)
print('INTERVALS=', intervals)
print('DUE_OFFSETS=', due_days, 'refined_after=', refined_after)
# assertions
ok = True
def chk(name, cond):
    global ok
    print(('  OK  ' if cond else '  FAIL ') + name)
    if not cond: ok=False
chk('interval seq 1/3/8.4/24.36', intervals == [1,3,8.4,24.36])
chk('review offsets 0/1/4/12', review_offsets == [0,1,4,12])
chk('refined on 4th good', refined_after == 4)
# cleanup throwaway
c = sqlite3.connect('data/xinmo.db')
c.execute('DELETE FROM attempt WHERE problem_id=?', (pid,)); c.execute('DELETE FROM problem WHERE id=?', (pid,)); c.commit(); c.close()
print('cleaned pid', pid)
print('E2E TEST', 'PASSED' if ok else 'FAILED')