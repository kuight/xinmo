// xinmo: add math/english/chinese subjects to data/topics.json (data-only, no code change)
// Pure Node script; reads existing json, merges 3 new subjects, writes back with UTF-8 no BOM.
const fs = require('fs');
const path = require('path');

const topicsPath = path.join(__dirname, '..', 'data', 'topics.json');
const existing = JSON.parse(fs.readFileSync(topicsPath, 'utf-8'));

function ch(name, topics) {
  return { name: name, topics: topics };
}
function t(id, label, prereq) {
  const p = prereq || [];
  return { id: id, label: label, prereq: p };
}

const math = {
  chapters: [
    ch('集合与常用逻辑用语', [
      t('math-set-ops', '集合的运算'),
      t('math-suf-nec', '充分必要条件'),
      t('math-quantifier', '全称与存在量词'),
    ]),
    ch('不等式', [
      t('math-ineq-prop', '不等式性质'),
      t('math-basic-ineq', '基本不等式'),
      t('math-quad-ineq', '一元二次不等式'),
    ]),
    ch('函数', [
      t('math-func-def', '函数的概念与定义域'),
      t('math-func-monotonic', '函数的单调性'),
      t('math-func-parity', '函数的奇偶性与对称性'),
      t('math-func-period', '函数的周期性'),
      t('math-quad-func', '二次函数'),
      t('math-exponential', '指数与指数函数'),
      t('math-logarithmic', '对数与对数函数'),
      t('math-power-func', '幂函数'),
      t('math-graph-transform', '函数图象变换'),
      t('math-func-zero', '函数与方程（零点）'),
    ]),
    ch('三角', [
      t('math-angle-radian', '任意角与弧度制'),
      t('math-trig-def', '三角函数定义与同角关系'),
      t('math-reduction', '诱导公式'),
      t('math-trig-graph', '三角函数图象与性质'),
      t('math-sinusoid', '正弦型函数图象变换'),
      t('math-sum-diff-angle', '和差角公式'),
      t('math-double-angle', '二倍角公式'),
      t('math-aux-angle', '辅助角公式'),
      t('math-sine-theorem', '解三角形（正弦定理）'),
      t('math-cosine-theorem', '解三角形（余弦定理）'),
      t('math-triangle-area', '三角形面积与最值'),
    ]),
    ch('数列', [
      t('math-arithmetic-seq', '等差数列'),
      t('math-geometric-seq', '等比数列'),
      t('math-seq-general-term', '数列求通项'),
      t('math-seq-sum-shift', '数列求和（错位相减）'),
      t('math-seq-sum-split', '数列求和（裂项）'),
    ]),
    ch('导数', [
      t('math-derivative-rule', '导数的运算'),
      t('math-derivative-geo', '导数的几何意义'),
      t('math-derivative-monotonic', '用导数研究单调性'),
      t('math-derivative-extreme', '极值与最值'),
      t('math-derivative-ineq', '导数与不等式证明'),
    ]),
    ch('向量', [
      t('math-vec-ops', '平面向量的运算'),
      t('math-vec-dot', '平面向量的数量积'),
      t('math-vec-coord', '向量的坐标表示'),
    ]),
    ch('立体几何', [
      t('math-space-relations', '空间点线面位置关系'),
      t('math-space-parallel-perp', '平行与垂直的判定与性质'),
      t('math-space-angle', '空间角（线面角、二面角）'),
      t('math-space-vector', '空间向量与坐标法'),
      t('math-space-volume', '表面积与体积'),
    ]),
    ch('解析几何', [
      t('math-line-equation', '直线方程与位置关系'),
      t('math-circle-equation', '圆的方程'),
      t('math-ellipse', '椭圆'),
      t('math-hyperbola', '双曲线'),
      t('math-parabola', '抛物线'),
      t('math-line-conic', '直线与圆锥曲线的位置关系'),
      t('math-chord-length', '弦长与面积问题'),
    ]),
    ch('概率统计', [
      t('math-counting', '计数原理与排列组合'),
      t('math-binomial', '二项式定理'),
      t('math-probability-event', '随机事件与概率'),
      t('math-conditional-prob', '条件概率与独立性'),
      t('math-discrete-dist', '离散型随机变量分布列与期望'),
      t('math-normal-dist', '正态分布'),
      t('math-stat-charts', '统计图表与数字特征'),
      t('math-regression', '线性回归与独立性检验'),
    ]),
    ch('复数', [
      t('math-complex', '复数的运算与几何意义'),
    ]),
    ch('未分类', [t('unclassified', '待分类')]),
  ],
};

const english = {
  chapters: [
    ch('词汇', [
      t('eng-vocab-new', '生词（不认识）'),
      t('eng-vocab-familiar', '熟词生义'),
      t('eng-vocab-confusable', '易混词辨析'),
      t('eng-vocab-phrase', '固定搭配与短语'),
      t('eng-vocab-derivation', '词形变化（派生）'),
    ]),
    ch('句子', [
      t('eng-sentence-long', '长难句结构'),
      t('eng-sentence-clause', '从句（不细分）'),
      t('eng-sentence-nonfin', '非谓语动词'),
      t('eng-sentence-tense', '时态与语态'),
      t('eng-sentence-subjunc', '虚拟语气'),
      t('eng-sentence-inversion', '倒装与强调'),
      t('eng-sentence-conj', '连词与逻辑关系'),
    ]),
    ch('题型', [
      t('eng-item-cloze', '完形填空'),
      t('eng-item-reading-detail', '阅读理解（细节）'),
      t('eng-item-reading-infer', '阅读理解（推断）'),
      t('eng-item-reading-main', '阅读理解（主旨）'),
      t('eng-item-seven-five', '七选五'),
      t('eng-item-grammar-blank', '语法填空'),
      t('eng-item-proofread', '短文改错'),
      t('eng-item-practical-write', '应用文写作'),
      t('eng-item-continuation', '读后续写'),
    ]),
    ch('其他', [
      t('eng-other-preposition', '介词'),
      t('eng-other-article-num', '冠词与数词'),
      t('eng-other-pronoun', '代词指代'),
      t('eng-other-verb-phrase', '动词短语'),
      t('eng-other-reoccur', '词汇复现（考过又忘）'),
    ]),
    ch('未分类', [t('unclassified', '待分类')]),
  ],
};

const chinese = {
  chapters: [
    ch('语言文字运用', [
      t('chn-char-phonetic', '字音'),
      t('chn-char-form', '字形'),
      t('chn-idiom', '成语与熟语'),
      t('chn-illogical', '病句辨析与修改'),
      t('chn-punctuation', '标点符号'),
      t('chn-synonym', '词语辨析（近义词）'),
      t('chn-rhetoric', '修辞手法'),
      t('chn-sentence-order', '句子衔接与排序'),
      t('chn-appropriateness', '语言得体'),
    ]),
    ch('古诗文', [
      t('chn-classical-word', '文言实词'),
      t('chn-classical-function', '文言虚词'),
      t('chn-classical-pattern', '文言句式'),
      t('chn-classical-translate', '文言翻译'),
      t('chn-culture', '古代文化常识'),
      t('chn-classical-recite', '古诗文默写'),
      t('chn-poetry-appreciate', '诗歌鉴赏（意象与手法）'),
    ]),
    ch('文学常识', [
      t('chn-author-work', '作家作品'),
      t('chn-genre', '文体常识'),
    ]),
    ch('其他', [
      t('chn-famous-quote', '名句名篇积累'),
    ]),
    ch('未分类', [t('unclassified', '待分类')]),
  ],
};

// append new subjects at the end, preserving existing key order
existing.math = math;
existing.english = english;
existing.chinese = chinese;

const out = JSON.stringify(existing, null, 1) + '\n';
fs.writeFileSync(topicsPath, out, { encoding: 'utf-8' });

// report
function count(s) {
  let topics = 0;
  (s.chapters || []).forEach((c) => { topics += (c.topics || []).length; });
  return { chapters: (s.chapters || []).length, topics };
}
const names = Object.keys(existing);
const summary = {};
names.forEach((n) => { summary[n] = count(existing[n]); });
console.log('SUBJECT_KEYS=' + names.join(','));
console.log('COUNTS=' + JSON.stringify(summary));
console.log('TOTAL_TOPICS=' + names.reduce((acc, n) => acc + summary[n].topics, 0));