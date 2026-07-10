import { z } from "zod";

/**
 * 人格盲盒 (Persona Blind Box) — theoretical substrate.
 *
 * Every pull is combinatorially generated, never repeated (fixes SBTI/MBTI's
 * staleness), but is NOT free-floating LLM vibes — it's assembled from six
 * layers, each anchored to peer-reviewed or manual-codified literature (full
 * citations in PERSONA_THEORY.md at the repo root), the way tarot/astrology/
 * MBTI endure because they're *systems*, not one-shot generations:
 *
 * 0. Big Five / OCEAN (Costa & McCrae 1992; Goldberg 1990) — the empirical
 *    backbone. We deliberately did NOT base generation on MBTI itself: its
 *    test-retest reliability and structural validity are contested (Pittenger
 *    1993; McCrae & Costa 1989 reinterpret it through the Big Five instead).
 *    The "code" field keeps MBTI's letters as a *legible skin* only — the
 *    actual inference underneath is Big Five.
 * 1. Attachment Style (Bartholomew & Horowitz 1991's 4-category adult model,
 *    built on Bowlby 1969/Ainsworth 1978) — fixed academic taxonomy that's
 *    also live self-ID vocabulary on Xiaohongshu ("我是焦虑型依恋"). Must be
 *    consistent with layer 0 per Noftle & Shaver (2006)'s documented Big
 *    Five <-> attachment correlations (e.g. high N + low E correlates with
 *    anxious attachment) — layers argue with each other, not float free.
 * 2. Defense Mechanism (Vaillant 1977/1992; DSM-IV-TR Appendix B Defensive
 *    Functioning Scale) — maturity tier doubles as rarity: mature defenses
 *    are, per the theory itself, statistically rarer than primitive ones,
 *    so "rarity" isn't an arbitrary gacha roll.
 * 3. Persona / Shadow (Jung 1951 Aion; Jung 1953 Two Essays) — every pull
 *    states both the outward mask and the repressed shadow, directly the
 *    theory the word "persona" comes from.
 * 4. Archetype — drawn from a fixed pool sourced from 2026 Xiaohongshu trend
 *    research (发疯文学/浓人淡人/班味/反精致/city系…), not invented per-call.
 * 5. Palette — derived FROM layers 0-4 (attachment -> hue, defense maturity
 *    -> saturation/value, archetype -> accent), not picked freehand.
 *
 * name/tagline/roast/imagePrompt are the creative surface on top; they must
 * be traceable back to the structured layers, not stand alone.
 */

/** Big Five / OCEAN — Costa & McCrae (1992); Goldberg (1990). Qualitative 3-band read, not a psychometric score. */
export const BIG_FIVE_TRAITS = [
  "开放性",
  "尽责性",
  "外向性",
  "宜人性",
  "情绪稳定性",
] as const;
export type BigFiveTrait = (typeof BIG_FIVE_TRAITS)[number];
export const TRAIT_LEVELS = ["高", "中", "低"] as const;
export type TraitLevel = (typeof TRAIT_LEVELS)[number];
export const BigFiveSchema = z.object({
  开放性: z.enum(TRAIT_LEVELS),
  尽责性: z.enum(TRAIT_LEVELS),
  外向性: z.enum(TRAIT_LEVELS),
  宜人性: z.enum(TRAIT_LEVELS),
  情绪稳定性: z.enum(TRAIT_LEVELS),
});
export type BigFive = z.infer<typeof BigFiveSchema>;

export const ATTACHMENT_STYLES = ["安全型", "焦虑型", "回避型", "混乱型"] as const;
export type AttachmentStyle = (typeof ATTACHMENT_STYLES)[number];

/** Vaillant's defense-mechanism hierarchy, maturity tier = rarity tier. */
export const DEFENSE_MECHANISMS = {
  病理型: ["否认", "曲解", "分裂"],
  不成熟型: ["投射", "幻想", "被动攻击", "疑病"],
  神经症型: ["理智化", "反向形成", "潜抑", "置换"],
  成熟型: ["升华", "幽默", "利他"],
} as const;
export type DefenseTier = keyof typeof DEFENSE_MECHANISMS;
export const DEFENSE_TIERS = Object.keys(DEFENSE_MECHANISMS) as DefenseTier[];
export const ALL_DEFENSE_MECHANISMS = Object.values(DEFENSE_MECHANISMS).flat();

/** Maturity tier -> collectible rarity. Mature defenses are theoretically rarer. */
export const RARITY_BY_TIER: Record<DefenseTier, { stars: number; label: string }> = {
  病理型: { stars: 1, label: "电子废物款" },
  不成熟型: { stars: 2, label: "常见款" },
  神经症型: { stars: 3, label: "限定款" },
  成熟型: { stars: 4, label: "隐藏款" },
};

/** Curated archetype pool sourced from 2026 Xiaohongshu trend research. */
export const ARCHETYPES = [
  "发疯文学型",
  "浓人型",
  "淡人型",
  "班味型",
  "松弛感型",
  "city系型",
  "反精致型",
  "赛博树洞型",
  "社恐型",
  "社牛型",
  "摆烂型",
  "怀旧千禧型",
] as const;
export type Archetype = (typeof ARCHETYPES)[number];

export const PersonaSchema = z.object({
  /** Self-invented type code, MBTI-shaped but never a real MBTI type, e.g. "ENFP-赛博薛定谔". */
  code: z.string().min(1).max(24),
  /** 4-8 character nickname, e.g. "赛博焦虑仓鼠". */
  name: z.string().min(1).max(16),
  /** One-line roast/verdict, <=20 Chinese characters. */
  tagline: z.string().min(1).max(40),
  /** First-person opening line in character, 发疯文学-adjacent, 30-50 chars. */
  roast: z.string().min(1).max(140),
  /** Exactly 3 keyword tags. */
  tags: z.array(z.string().min(1).max(12)).length(3),
  /** Exactly 3 hex colors, derived from attachment/defense/archetype — not freehand. */
  palette: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).length(3),
  /** One of VOICE_STYLE_MAP's keys — narrows the LLM's free text to a known-good voice. */
  voiceStyle: z.string(),
  /** English prompt for image generation: composition/color/material/style, ~50 words. */
  imagePrompt: z.string().min(1).max(600),

  /** Layer 0 — Big Five/OCEAN qualitative read; the empirical backbone under the MBTI-shaped "code". */
  bigFive: BigFiveSchema,
  /** Layer 1 — Bartholomew & Horowitz (1991) 4-category adult attachment model. */
  attachmentStyle: z.enum(ATTACHMENT_STYLES),
  /** Layer 2 — Vaillant's hierarchy; must be one of ALL_DEFENSE_MECHANISMS. */
  defenseMechanism: z.string(),
  defenseTier: z.enum(DEFENSE_TIERS as [DefenseTier, ...DefenseTier[]]),
  /** Layer 3 — Jungian persona (outward mask) / shadow (repressed side), each a short phrase. */
  personaMask: z.string().min(1).max(60),
  shadowSide: z.string().min(1).max(60),
  /** Layer 4 — fixed archetype pool. */
  archetype: z.enum(ARCHETYPES),
});
export type Persona = z.infer<typeof PersonaSchema>;

export function rarityOf(p: Pick<Persona, "defenseTier">) {
  return RARITY_BY_TIER[p.defenseTier];
}

/**
 * Curated CosyVoice v3 voice subset, keyed by the personality-style label the
 * LLM picks from. Dialect voices (东北/粤语/陕西) are deliberately included —
 * dialect-flavored AI roast voices are their own Xiaohongshu content genre.
 */
export const VOICE_STYLE_MAP: Record<string, string> = {
  "阳光大男孩": "longanyang",
  "欢脱元气女": "longanhuan_v3",
  "嗲甜台湾女": "longantai_v3",
  "元气甜美女": "longhua_v3",
  "智慧青年男": "longcheng_v3",
  "温暖元气男": "longze_v3",
  "呆板大暖男": "longzhe_v3",
  "温暖春风女": "longyan_v3",
  "温婉邻家女": "longxing_v3",
  "磁性理智男": "longtian_v3",
  "细腻柔声女": "longwan_v3",
  "浪漫风情女": "longqiang_v3",
  "甜美娇气女": "longfeifei_v3",
  "多情忧郁男": "longhao_v3",
  "知性积极女": "longxiaochun_v3",
  "沉稳权威女": "longxiaoxia_v3",
  "热血磁性男": "longfei_v3",
  "天真烂漫女童": "longhuhu_v3",
  "飞天泡泡音": "longpaopao_v3",
  "阳光顽皮男": "longjielidou_v3",
  "豪放可爱女": "longxian_v3",
  "东北直率男": "longlaotie_v3",
  "优雅粤语女": "longjiaxin_v3",
  "知性粤语女": "longjiayi_v3",
  "欢脱粤语男": "longanyue_v3",
  "原味陕北男": "longshange_v3",
  "清纯萝莉女": "longanmin_v3",
  "戏剧化童声": "longshanshan_v3",
  "阳光男童声": "longniuniu_v3",
};

export const DEFAULT_VOICE_STYLE = "知性积极女";

export function resolveVoiceId(style: string | undefined): string {
  if (style && style in VOICE_STYLE_MAP) return VOICE_STYLE_MAP[style] as string;
  return VOICE_STYLE_MAP[DEFAULT_VOICE_STYLE] as string;
}
