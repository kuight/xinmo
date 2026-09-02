# v1.5 batch2: seed 45 chemistry/physics/math knowledge items via POST /api/knowledge.
# Spread first due_date by day from 2026-09-03, max 6 per day. UTF-8 source.
import sys
import json
import sqlite3
import urllib.request

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

URL = 'http://127.0.0.1:8092/api/knowledge'
DB = 'data/xinmo.db'

# (subject, tag, left, right, due_date)
ROWS = [
    # --- 09-03: chemistry 分离提纯操作 1-6
    ('chemistry', '分离提纯操作', '溶解', '溶解度差异｜得到溶液｜本身不算分离完成，是过滤/萃取前置步', '2026-09-03'),
    ('chemistry', '分离提纯操作', '过滤', '固体不溶于该液体｜固液分开｜一贴二低三靠，沉淀常需洗涤', '2026-09-03'),
    ('chemistry', '分离提纯操作', '蒸发结晶', '溶解度随温度变化小｜得到固体｜NaCl型，蒸至大量晶体析出即停不蒸干', '2026-09-03'),
    ('chemistry', '分离提纯操作', '冷却结晶', '溶解度随温度变化大｜得到晶体｜KNO₃型，母液可循环，选哪种只看溶解度曲线陡不陡', '2026-09-03'),
    ('chemistry', '分离提纯操作', '蒸馏', '沸点差异｜收集馏分液体｜加热冷凝收集三步缺一不可，温度计水银球齐支管口', '2026-09-03'),
    ('chemistry', '分离提纯操作', '分液', '互不相溶且密度分层｜上下两层各自收｜下层下口放，上层上口倒', '2026-09-03'),
    # --- 09-04: chemistry 分离提纯操作 7-11 + 反向速查 1
    ('chemistry', '分离提纯操作', '萃取', '溶质在两溶剂中溶解度差异｜含目标物的液层｜萃取剂四条不互溶溶解力强不反应易分离，后必接分液', '2026-09-04'),
    ('chemistry', '分离提纯操作', '升华', '固体能直接气化而杂质不能｜纯固体｜全程无液态，I₂、萘', '2026-09-04'),
    ('chemistry', '分离提纯操作', '灼烧煅烧', '热稳定性差异｜固体残渣｜分解CaCO₃或烧掉有机物碳', '2026-09-04'),
    ('chemistry', '分离提纯操作', '干燥', '只针对水｜原物质保留｜干燥剂不能与目标物反应', '2026-09-04'),
    ('chemistry', '分离提纯操作', '研磨粉碎', '无性质差异｜什么都没分开｜只为增大接触面积加快溶解或反应', '2026-09-04'),
    ('chemistry', '分离提纯反向速查', '沸点相差XX℃', '蒸馏', '2026-09-04'),
    # --- 09-05: chemistry 反向速查 2-7
    ('chemistry', '分离提纯反向速查', '互不相溶或分层', '分液', '2026-09-05'),
    ('chemistry', '分离提纯反向速查', '在有机溶剂中溶解度更大', '萃取后接分液', '2026-09-05'),
    ('chemistry', '分离提纯反向速查', '溶解度随温度变化不大', '蒸发结晶', '2026-09-05'),
    ('chemistry', '分离提纯反向速查', '溶解度随温度变化大', '冷却结晶', '2026-09-05'),
    ('chemistry', '分离提纯反向速查', '受热易分解或杂质高温分解', '灼烧', '2026-09-05'),
    ('chemistry', '分离提纯反向速查', '加热直接变气体', '升华', '2026-09-05'),
    # --- 09-06: chemistry 反向速查 8 + physics 仪器读数 1-5
    ('chemistry', '分离提纯反向速查', '除水但保留产物', '干燥', '2026-09-06'),
    ('physics', '仪器读数', '游标卡尺', '不估读｜主尺整毫米+游标对齐格数×精度(0.1/0.05/0.02mm)', '2026-09-06'),
    ('physics', '仪器读数', '螺旋测微器', '必须估读一位｜固定刻度+可动刻度×0.01mm，再估到0.001mm', '2026-09-06'),
    ('physics', '仪器读数', '毫米刻度尺', '估读一位｜读到0.1mm', '2026-09-06'),
    ('physics', '仪器读数', '机械秒表', '不估读｜分针+秒针，注意分针过没过半格', '2026-09-06'),
    ('physics', '仪器读数', '天平', '不估读｜砝码+游码，读到游码分度值', '2026-09-06'),
    # --- 09-07: physics 仪器读数 6-9 + 牛顿 1-2
    ('physics', '仪器读数', '电表最小分度0.1或1', '估读一位｜如0–3V档读到0.01V', '2026-09-07'),
    ('physics', '仪器读数', '电表最小分度0.02或0.5', '只读到下一位不再细分｜如0–0.6A档读到0.01A', '2026-09-07'),
    ('physics', '仪器读数', '欧姆表', '不估读｜读数×倍率', '2026-09-07'),
    ('physics', '仪器读数', '估读的总原则', '要不要估读由仪器本身决定，与题目无关；硬记三句：卡尺不估读、螺旋测微器一定估读、秒表不估读', '2026-09-07'),
    ('physics', '牛顿运动定律', '不受外力或合外力为零', '保持静止或匀速直线运动；牛一不是实验定律，是理想斜面加推理得出', '2026-09-07'),
    ('physics', '牛顿运动定律', '描述惯性大小', '质量是惯性唯一量度；与速度无关', '2026-09-07'),
    # --- 09-08: physics 牛顿 3-8
    ('physics', '牛顿运动定律', '同一物体惯性系', 'F合=ma，a与F合同向；a方向与速度方向无关', '2026-09-08'),
    ('physics', '牛顿运动定律', '轻绳轻杆接触面被剪断或撤去的瞬间', '力立即变为零；长度可突变', '2026-09-08'),
    ('physics', '牛顿运动定律', '弹簧橡皮绳在另一根被剪断的瞬间', '弹力保持不变；因形变量不能突变，牛二瞬时问题最高频', '2026-09-08'),
    ('physics', '牛顿运动定律', '加速度方向向上，含上加速与下减速', '超重，N=m(g+a)；看a方向不看运动方向', '2026-09-08'),
    ('physics', '牛顿运动定律', '加速度方向向下', '失重，N=m(g−a)，a=g时完全失重；完全失重时浮力液体压强等现象消失', '2026-09-08'),
    ('physics', '牛顿运动定律', '求整体加速度', '整体法只算外力；内力不出现在方程里', '2026-09-08'),
    # --- 09-09: physics 牛顿 9-10 + math 1-4
    ('physics', '牛顿运动定律', '求物体间作用力', '隔离法单独列式；先整体求a再隔离求内力', '2026-09-09'),
    ('physics', '牛顿运动定律', '探究加速度与力质量关系实验', '四点：平衡摩擦力时不挂砝码让小车拖纸带匀速；m远小于M；先通电后放小车；a-F图不过原点交F轴正半轴说明未平衡或平衡不足，交a轴正半轴说明平衡过度，研究a与M须画a-1/M图', '2026-09-09'),
    ('math', '指数对数基本概念', 'ⁿ√a里n和a分别叫什么', '根指数、被开方数', '2026-09-09'),
    ('math', '指数对数基本概念', 'log_a N里a和N分别叫什么', '底数、真数', '2026-09-09'),
    ('math', '指数对数基本概念', 'a^(m/n)写成根式', 'ⁿ√(aᵐ)，分母当根指数，要求a>0', '2026-09-09'),
    ('math', '指数对数基本概念', 'log_a Mⁿ等于什么，附加条件', 'n·log_a M，要M>0；只知M≠0时log_a M²=2log_a|M|', '2026-09-09'),
    # --- 09-10: math 5-7
    ('math', '指数对数基本概念', 'ⁿ√(aⁿ)分两种', 'n奇得a，n偶得|a|', '2026-09-10'),
    ('math', '指数对数基本概念', 'log_a b·log_b a等于', '1', '2026-09-10'),
    ('math', '指数对数基本概念', '换底公式', 'log_a b = log_c b / log_c a，要求c>0且c≠1', '2026-09-10'),
]


def post(body):
    req = urllib.request.Request(URL, data=json.dumps(body).encode('utf-8'),
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode('utf-8'))


def exists(subj, tag, left):
    conn = sqlite3.connect(DB)
    c = conn.execute("SELECT COUNT(*) FROM problem WHERE kind='knowledge' AND subject=? AND topic_label=? AND note=?",
                     (subj, tag, left)).fetchone()[0]
    conn.close()
    return c > 0


def main():
    n = 0
    skip = 0
    for subj, tag, left, right, due in ROWS:
        if exists(subj, tag, left):
            skip += 1
            continue
        r = post({'subject': subj, 'tag': tag, 'left': left, 'right': right, 'due_date': due})
        if not r.get('ok'):
            print('FAIL', subj, tag, left, r)
            raise SystemExit(1)
        p = r['problem']
        print(p['id'], p['subject'], p['topic_label'], p['due_date'], p['note'][:14])
        n += 1
    print('SEEDED %d new items (skipped %d existing)' % (n, skip))


if __name__ == '__main__':
    main()