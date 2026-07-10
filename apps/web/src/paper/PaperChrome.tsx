import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollToPlugin } from "gsap/ScrollToPlugin";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useEffect, useRef, useState } from "react";
import { publicAsset } from "../publicAsset";
import { LAYER_COLORS, REFERENCES, type LayerKey } from "./citations";

gsap.registerPlugin(ScrollToPlugin, ScrollTrigger);

/** id of a reference entry in the footer — shared by CitationSup + References. */
const refDomId = (n: number) => `paper-ref-${n}`;

/**
 * Superscript in-text citation, e.g. 依恋风格分类<CitationSup n={8}/>.
 * Hover shows the full reference in a floating card (arXiv-HTML-style) AND
 * lights up the matching footer entry; click smooth-scrolls to the footer.
 */
export function CitationSup({ n }: { n: number | number[] }) {
  const nums = Array.isArray(n) ? n : [n];
  const refs = nums
    .map((num) => REFERENCES.find((r) => r.n === num))
    .filter((r): r is (typeof REFERENCES)[number] => Boolean(r));
  const setLit = (lit: boolean) => {
    for (const num of nums) {
      document.getElementById(refDomId(num))?.classList.toggle("paper-ref--lit", lit);
    }
  };
  return (
    <sup
      className="paper-citation"
      tabIndex={0}
      onMouseEnter={() => setLit(true)}
      onMouseLeave={() => setLit(false)}
      onClick={() => {
        const first = nums[0];
        if (first === undefined) return;
        gsap.to(window, {
          duration: 0.9,
          ease: "power2.inOut",
          scrollTo: { y: `#${refDomId(first)}`, offsetY: window.innerHeight / 3 },
        });
      }}
    >
      [{nums.join("][")}]
      <span className="paper-citation-tip" role="tooltip">
        {refs.map((r) => (
          <span key={r.n}>
            <span style={{ color: LAYER_COLORS[r.layer], fontWeight: 600 }}>[{r.n}]</span> {r.text}
          </span>
        ))}
      </span>
    </sup>
  );
}

/**
 * arXiv 式左缘竖排编号 — 预印本 PDF 最具辨识度的视觉符号，原样搬进屏幕左缘。
 * cs.PERSONA 当然不是真实学科分类，这正是本文的态度。宽屏专属装饰（窄屏隐藏）。
 */
export function ArxivStamp() {
  return (
    <div className="paper-arxiv-stamp" aria-hidden>
      arXiv:2607.00001v1&ensp;[cs.PERSONA]&ensp;10 Jul 2026
    </div>
  );
}

/** 假页码的分母 — 一篇像样的论文总得有个页数。7 是拍脑袋定的，符合本刊惯例。 */
const TOTAL_PAGES = 7;

/**
 * Running header：滚过首屏后浮现的论文页眉 — 左侧短标题（点击回顶部），
 * 右侧按滚动进度换算的"第 x / 7 页"。真论文的页眉配上假页码，正合本文气质。
 */
export function RunningHeader() {
  const [visible, setVisible] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        const progress = max > 0 ? window.scrollY / max : 0;
        setVisible(window.scrollY > window.innerHeight * 0.7);
        setPage(Math.min(TOTAL_PAGES, Math.max(1, Math.ceil(progress * TOTAL_PAGES))));
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="paper-running-header" data-visible={visible}>
      <button
        type="button"
        className="paper-running-header-title"
        onClick={() => gsap.to(window, { duration: 0.9, ease: "power2.inOut", scrollTo: 0 })}
        title="回到标题页"
      >
        人格盲盒 · 预印本 v1
      </button>
      <span className="paper-doi">
        第 {page} / {TOTAL_PAGES} 页
      </span>
    </div>
  );
}

/**
 * Paper section header: curly-bracket eyebrow (the DESIGN.md signature),
 * §-numbered heading, and a hairline that draws in on scroll.
 */
export function SectionHeading(props: { eyebrow: string; number?: string; title: string; accent?: LayerKey }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from("[data-sh-heading]", {
          opacity: 0,
          y: 28,
          duration: 0.7,
          ease: "power3.out",
          scrollTrigger: { trigger: rootRef.current, start: "top 85%", once: true },
        });
        gsap.from("[data-sh-line]", {
          scaleX: 0,
          duration: 0.9,
          ease: "power2.inOut",
          scrollTrigger: { trigger: rootRef.current, start: "top 85%", once: true },
        });
      });
    },
    { scope: rootRef },
  );

  return (
    <div ref={rootRef} className="flex flex-col gap-4 pb-8">
      <div data-sh-line className="paper-hairline" />
      <div data-sh-heading className="flex flex-col gap-2">
        <span className="paper-eyebrow">{`{ ${props.eyebrow} }`}</span>
        <h2 className="paper-section-heading">
          {props.number ? (
            <span style={props.accent ? { color: LAYER_COLORS[props.accent] } : undefined}>{props.number} </span>
          ) : null}
          {props.title}
        </h2>
      </div>
    </div>
  );
}

/** Top-of-page preprint banner, per DESIGN.md's Announcement Banner. */
export function AnnouncementBanner() {
  return (
    <div className="paper-banner">
      预印本 · 未经同行评审 · <span className="paper-banner-accent">本文可复现，代码即正文</span>
    </div>
  );
}

/**
 * 文末声明区 — 致谢、利益冲突、数据可用性等论文尾部惯例。
 * 格式一丝不苟，内容实话实说（n=1 的研究能声明的也就这些了）。
 */
const DECLARATIONS: Array<{ term: string; desc: string }> = [
  { term: "致谢", desc: "感谢被试在百忙之中扮演了自己，且未对署名顺序提出异议。" },
  { term: "利益冲突", desc: "作者与被试系同一人，存在不可调和、也不打算调和的利益冲突。" },
  { term: "数据可用性", desc: "本研究数据集 n=1，即你本人。出于隐私考虑（也确实没有别的数据），恕不公开。" },
  { term: "伦理审查", desc: "被试点击「开始实验」即视为知情同意；拆开自己所引起的心理波动，责任自负。" },
  { term: "作者贡献", desc: "概念化：你；方法：通义千问；资金获取：无；发疯：共同第一作者。" },
];

/** Declarations block — rendered inside the footer, above the reference list. */
function Declarations() {
  return (
    <div className="flex flex-col gap-5">
      <span className="paper-eyebrow">{`{ 声明 }`}</span>
      <dl className="paper-declarations">
        {DECLARATIONS.map((d) => (
          <div key={d.term} className="paper-declarations-row">
            <dt>{d.term}</dt>
            <dd>{d.desc}</dd>
          </div>
        ))}
      </dl>
      <div className="paper-hairline" />
    </div>
  );
}

/** Footer = 声明 + 参考文献. Real citations from PERSONA_THEORY.md, layer-hued. */
export function References() {
  const rootRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from(".paper-ref", {
          opacity: 0,
          y: 14,
          stagger: 0.04,
          duration: 0.5,
          ease: "power2.out",
          scrollTrigger: { trigger: rootRef.current, start: "top 88%", once: true },
        });
      });
    },
    { scope: rootRef },
  );

  return (
    <footer ref={rootRef} className="paper-footer">
      <div className="paper-col flex flex-col gap-6">
        <Declarations />
        <span className="paper-eyebrow">{`{ 参考文献 }`}</span>
        <div className="flex flex-col gap-1">
          {REFERENCES.map((ref) => (
            <div
              key={ref.n}
              id={refDomId(ref.n)}
              className="paper-ref"
              style={{ "--ref-hue": LAYER_COLORS[ref.layer] } as React.CSSProperties}
            >
              <span style={{ color: LAYER_COLORS[ref.layer] }}>[{ref.n}]</span>
              <a href={ref.url} target="_blank" rel="noopener noreferrer" className="paper-ref-link">
                {ref.text}
                <span className="paper-ref-ext" aria-hidden>
                  ↗
                </span>
              </a>
            </div>
          ))}
        </div>
        <div className="paper-colophon">
          <span className="inline-flex flex-wrap items-center justify-center gap-1.5">
            本文由 vibe coding 完成 · Powered by 阿里云百炼
            {/* Qwen mark (transparent SVG) from lobehub/lobe-icons (packages/static-svg). */}
            <img
              src={publicAsset("/brand/qwen-color.svg")}
              alt="通义千问"
              loading="lazy"
              className="inline-block h-4 w-auto align-middle"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
            · 模型：通义千问 / 万相 / CosyVoice / Tripo · 保留所有发疯权利 © 2026
          </span>
        </div>
      </div>
    </footer>
  );
}
