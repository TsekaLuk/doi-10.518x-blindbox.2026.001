# 人格盲盒 · 理论依据

产品：人格盲盒（Persona Blind Box）。核心设计原则：每一次生成都必须是可追溯的
"结构化诊断 → 创意转译"，而不是模型的自由发挥。下面六层，每层都锚定在真实文献，
拒绝伪科学包装但保留娱乐性——这是产品叙事、结果卡设计、prompt 工程共用的唯一真源。

参见 `packages/shared/src/persona.ts`（数据结构）与 `packages/ai/src/prompts.ts`
（生成 prompt，逐层引用本文件的推理顺序）。

## 为什么不直接用 MBTI

- Pittenger, D. J. (1993). *Measuring the MBTI... And Coming Up Short.*
  Journal of Career Planning and Employment, 54(1), 48–52.
- McCrae, R. R., & Costa, P. T. (1989). *Reinterpreting the Myers-Briggs Type
  Indicator from the perspective of the five-factor model of personality.*
  Journal of Personality, 57(1), 17–40.

MBTI 的重测信度与结构效度长期受学术质疑，二分类型也丢失了大量连续信息。我们保留
MBTI 字母代号作为"好认、好传播"的审美外壳（`code` 字段），但真正做推断的是下面的
大五人格模型——这是人格心理学中复现度最高、跨文化验证最广的特质分类框架。

## Layer 0 — 大五人格 / Big Five (OCEAN)

- Costa, P. T., & McCrae, R. R. (1992). *Revised NEO Personality Inventory
  (NEO-PI-R) and NEO Five-Factor Inventory (NEO-FFI) Professional Manual.*
  Odessa, FL: Psychological Assessment Resources.
- Goldberg, L. R. (1990). *An alternative "description of personality": The
  Big-Five factor structure.* Journal of Personality and Social Psychology,
  59(6), 1216–1229.
- John, O. P., & Srivastava, S. (1999). *The Big Five trait taxonomy: History,
  measurement, and theoretical perspectives.* In L. A. Pervin & O. P. John
  (Eds.), Handbook of Personality (2nd ed., pp. 102–138).

五维：开放性 / 尽责性 / 外向性 / 宜人性 / 情绪稳定性（Neuroticism 反向）。产品里
只做定性（高/中/低）读出，不冒充心理测量量表分数。

## Layer 1 — 依恋风格 / Attachment Style

- Bowlby, J. (1969/1982). *Attachment and Loss, Vol. 1: Attachment.* New York:
  Basic Books.
- Ainsworth, M. D. S., Blehar, M. C., Waters, E., & Wall, S. (1978). *Patterns
  of Attachment: A Psychological Study of the Strange Situation.*
- **Bartholomew, K., & Horowitz, L. M. (1991). *Attachment styles among young
  adults: A test of a four-category model.* Journal of Personality and Social
  Psychology, 61(2), 226–244.** ← 产品采用的"安全/焦虑/回避/混乱"四分类成人依恋
  模型的直接出处。
- Noftle, E. E., & Shaver, P. R. (2006). *Attachment dimensions and the Big
  Five personality traits: Associations and comparative ability to predict
  relationship quality.* Journal of Research in Personality, 40(2), 179–208.
  ← 用于约束 Layer 0 → Layer 1 的推理必须自洽（例如低情绪稳定性+低外向性通常对应
  焦虑或混乱型），而不是两层互相矛盾的平行标签。

## Layer 2 — 防御机制成熟度 / Defense Mechanisms

- Vaillant, G. E. (1977). *Adaptation to Life.* Boston: Little, Brown.
- Vaillant, G. E. (1992). *Ego Mechanisms of Defense: A Guide for Clinicians
  and Researchers.* Washington, DC: American Psychiatric Press.
- American Psychiatric Association. (2000). *DSM-IV-TR*, Appendix B:
  *Defensive Functioning Scale.*

防御机制按成熟度分层（病理型 → 不成熟型 → 神经症型 → 成熟型）本身就是文献里的
既定结构；产品把"成熟度"直接映射为收藏稀有度——因为按照这套理论，越成熟的防御
机制在人群中天然越少见，"稀有度"不是拍脑袋的抽卡概率。

## Layer 3 — 人格面具 / 暗面 (Persona / Shadow)

- Jung, C. G. (1951). *Aion: Researches into the Phenomenology of the Self.*
  Collected Works Vol. 9ii.
- Jung, C. G. (1953). *Two Essays on Analytical Psychology.* Collected Works
  Vol. 7.

"Persona"（人格面具）与"Shadow"（阴影）是荣格分析心理学的核心概念，也正是产品
名字"人格盲盒"里"人格"一词的词源——每次生成必须同时给出对外的面具与被压抑的
暗面，两者形成张力，而不是单一维度的性格描述。

## Layer 4 — 网络人格原型 / Archetype

内部研究，综合自公开的 2026 小红书平台热词/趋势报告（如千瓜数据《2026小红书平台
"十大热词"洞察数据报告》等）提炼出固定原型池（发疯文学型/浓人型/淡人型/班味型/
松弛感型/city系型/反精致型/赛博树洞型/社恐型/社牛型/摆烂型/怀旧千禧型）。这一层
不是学术文献，明确标注为"内部提炼、来源可复核"，作用是把"当下流行文化"也纳入
体系化生成，而不是模型临时现编热词。

## Layer 5 — 调色板 / Palette

非独立文献来源，而是 Layer 1–4 的确定性映射规则（设计 token 推导，非配色审美的
自由发挥）：依恋风格 → 色相基调；防御机制成熟度 → 饱和度/明度；原型 → 点缀色。

## 生成流程

见 `packages/ai/src/prompts.ts` 的 `PERSONA_SYSTEM_PROMPT`：要求模型按 0→5 的
顺序依次推理并保持跨层一致性，最终把结构化诊断转译成 `code / name / tagline /
roast / tags / imagePrompt` 等创意呈现字段——所有创意字段都必须可追溯回上面的
结构化诊断，不能脱离体系单独存在。完整数据结构：`packages/shared/src/persona.ts`。
