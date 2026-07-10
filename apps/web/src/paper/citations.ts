/**
 * The References footer data — real citations lifted verbatim from
 * PERSONA_THEORY.md (the product's single source of truth for the six-layer
 * theory). Each entry is tagged with its theory layer so the entry, its
 * in-text [n] markers, and the 表1 row all share one hue — the GSAP-style
 * "color = taxonomy" move.
 */

/**
 * Theory layer -> DESIGN.md category hue, DEEPENED for the light paper theme.
 * These color TEXT on cream, so each hue is darkened for contrast while
 * preserving the hue-to-layer taxonomy (the pale originals remain the source
 * hues in gradients/swatches/the background shader). Layer keys match 表1 rows.
 */
export const LAYER_COLORS = {
  bigFive: "#078e3a", // Layer 0 大五人格 — brand green, deepened
  attachment: "#c2409e", // Layer 1 依恋 — pink, deepened toward lipstick #f100cb
  defense: "#c96a00", // Layer 2 防御机制 — orange, deepened
  maskShadow: "#5c51c9", // Layer 3 面具/阴影 — lilac, deepened
  archetype: "#007892", // Layer 4 原型 — blue, deepened
  palette: "#4f8f1f", // Layer 5 调色板 — light green -> leaf green (distinct from L0's emerald)
} as const;
export type LayerKey = keyof typeof LAYER_COLORS;

export interface Reference {
  /** 1-based citation number, used as [n] in text and in the footer list. */
  n: number;
  layer: LayerKey;
  text: string;
  /** Real DOI where one exists; publisher page for books; Scholar search otherwise. */
  url: string;
}

export const REFERENCES: Reference[] = [
  {
    n: 1,
    layer: "bigFive",
    text: "Pittenger, D. J. (1993). Measuring the MBTI... And Coming Up Short. Journal of Career Planning and Employment, 54(1), 48–52.",
    url: "https://scholar.google.com/scholar?q=Pittenger+1993+Measuring+the+MBTI+and+coming+up+short",
  },
  {
    n: 2,
    layer: "bigFive",
    text: "McCrae, R. R., & Costa, P. T. (1989). Reinterpreting the Myers-Briggs Type Indicator from the perspective of the five-factor model of personality. Journal of Personality, 57(1), 17–40.",
    url: "https://doi.org/10.1111/j.1467-6494.1989.tb00759.x",
  },
  {
    n: 3,
    layer: "bigFive",
    text: "Costa, P. T., & McCrae, R. R. (1992). Revised NEO Personality Inventory (NEO-PI-R) and NEO Five-Factor Inventory (NEO-FFI) Professional Manual. Odessa, FL: Psychological Assessment Resources.",
    url: "https://scholar.google.com/scholar?q=Costa+McCrae+1992+Revised+NEO+Personality+Inventory+professional+manual",
  },
  {
    n: 4,
    layer: "bigFive",
    text: "Goldberg, L. R. (1990). An alternative \"description of personality\": The Big-Five factor structure. Journal of Personality and Social Psychology, 59(6), 1216–1229.",
    url: "https://doi.org/10.1037/0022-3514.59.6.1216",
  },
  {
    n: 5,
    layer: "bigFive",
    text: "John, O. P., & Srivastava, S. (1999). The Big Five trait taxonomy: History, measurement, and theoretical perspectives. In L. A. Pervin & O. P. John (Eds.), Handbook of Personality (2nd ed., pp. 102–138).",
    url: "https://pages.uoregon.edu/sanjay/pubs/bigfive.pdf",
  },
  {
    n: 6,
    layer: "attachment",
    text: "Bowlby, J. (1969/1982). Attachment and Loss, Vol. 1: Attachment. New York: Basic Books.",
    url: "https://scholar.google.com/scholar?q=Bowlby+1969+Attachment+and+Loss+Volume+1",
  },
  {
    n: 7,
    layer: "attachment",
    text: "Ainsworth, M. D. S., Blehar, M. C., Waters, E., & Wall, S. (1978). Patterns of Attachment: A Psychological Study of the Strange Situation.",
    url: "https://doi.org/10.4324/9780203758045",
  },
  {
    n: 8,
    layer: "attachment",
    text: "Bartholomew, K., & Horowitz, L. M. (1991). Attachment styles among young adults: A test of a four-category model. Journal of Personality and Social Psychology, 61(2), 226–244.",
    url: "https://doi.org/10.1037/0022-3514.61.2.226",
  },
  {
    n: 9,
    layer: "attachment",
    text: "Noftle, E. E., & Shaver, P. R. (2006). Attachment dimensions and the Big Five personality traits: Associations and comparative ability to predict relationship quality. Journal of Research in Personality, 40(2), 179–208.",
    url: "https://doi.org/10.1016/j.jrp.2005.08.009",
  },
  {
    n: 10,
    layer: "defense",
    text: "Vaillant, G. E. (1977). Adaptation to Life. Boston: Little, Brown.",
    url: "https://www.hup.harvard.edu/books/9780674004146",
  },
  {
    n: 11,
    layer: "defense",
    text: "Vaillant, G. E. (1992). Ego Mechanisms of Defense: A Guide for Clinicians and Researchers. Washington, DC: American Psychiatric Press.",
    url: "https://scholar.google.com/scholar?q=Vaillant+1992+Ego+Mechanisms+of+Defense+guide+clinicians+researchers",
  },
  {
    n: 12,
    layer: "defense",
    text: "American Psychiatric Association. (2000). DSM-IV-TR, Appendix B: Defensive Functioning Scale.",
    url: "https://doi.org/10.1176/appi.books.9780890423349",
  },
  {
    n: 13,
    layer: "maskShadow",
    text: "Jung, C. G. (1951). Aion: Researches into the Phenomenology of the Self. Collected Works Vol. 9ii.",
    url: "https://press.princeton.edu/books/paperback/9780691018263/aion",
  },
  {
    n: 14,
    layer: "maskShadow",
    text: "Jung, C. G. (1953). Two Essays on Analytical Psychology. Collected Works Vol. 7.",
    url: "https://press.princeton.edu/books/paperback/9780691017822/two-essays-on-analytical-psychology",
  },
  {
    n: 15,
    layer: "archetype",
    text: "千瓜数据 (2026)。《2026小红书平台\"十大热词\"洞察数据报告》。内部提炼原型池，来源可复核。",
    url: "https://www.qian-gua.com/information/detail/3318",
  },
];
