import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrambleTextPlugin } from "gsap/ScrambleTextPlugin";
import { ScrollToPlugin } from "gsap/ScrollToPlugin";
import { SplitText } from "gsap/SplitText";
import { useRef } from "react";
import { LAYER_COLORS } from "./citations";
import { CitationSup } from "./PaperChrome";

gsap.registerPlugin(SplitText, ScrambleTextPlugin, ScrollToPlugin);

/** Smooth-scroll helper shared by the CTA. */
export function scrollToSection(selector: string) {
  gsap.to(window, {
    duration: 1,
    ease: "power2.inOut",
    scrollTo: { y: selector, offsetY: 48 },
  });
}

/**
 * HERO = 论文标题. Massive display type per DESIGN.md's Hero Display Headline,
 * SplitText char entrance, ScrambleText-decoded fake DOI, and the single
 * gradient-stroked CTA pill of the entire page.
 */
export function PaperHero() {
  const rootRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const split = SplitText.create("[data-hero-title]", { type: "chars" });
        gsap.from(split.chars, {
          opacity: 0,
          y: 90,
          filter: "blur(8px)",
          stagger: 0.06,
          duration: 0.9,
          ease: "power3.out",
        });
        gsap.from("[data-hero-sub], [data-hero-meta], [data-hero-cta]", {
          opacity: 0,
          y: 24,
          stagger: 0.12,
          duration: 0.7,
          delay: 0.45,
          ease: "power2.out",
        });
        gsap.to("[data-hero-doi]", {
          duration: 1.6,
          delay: 0.9,
          scrambleText: {
            text: "doi:10.518x/blindbox.2026.001",
            chars: "0123456789abcdefx./:",
            speed: 0.4,
          },
        });
        return () => split.revert();
      });
    },
    { scope: rootRef },
  );

  return (
    <section ref={rootRef} className="paper-col flex min-h-[70vh] flex-col justify-center gap-8 py-16">
      <h1 data-hero-title className="paper-display">
        人格盲盒
      </h1>
      <p data-hero-sub className="paper-subtitle">
        基于六层心理动力学模型的生成式人格显影方法
        <CitationSup n={[3, 8, 10, 13]} />
      </p>
      <div data-hero-meta className="paper-meta flex flex-col gap-1">
        <span className="inline-flex flex-wrap items-center gap-1.5">
          你<sup>1, *, †</sup> ×{" "}
          {/* Qwen mark (transparent SVG) from lobehub/lobe-icons (packages/static-svg). */}
          <img
            src="/brand/qwen-color.svg"
            alt="通义千问"
            loading="lazy"
            className="inline-block h-4 w-auto align-middle"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
          通义千问<sup>2</sup>
        </span>
        <span>
          <sup>1</sup> 此刻的你所在的位置 · <sup>2</sup> 阿里云百炼
        </span>
        <span>
          <sup>*</sup> 通讯作者：正在读这行字的你 · <sup>†</sup> 作者与被试系同一人（利益冲突声明见文末）
        </span>
        <span>收稿：2026-07-10 · 录用：2026-07-10（本刊审稿出奇地快） · 版本：v1</span>
        <span data-hero-doi className="paper-doi">
          doi:10.518x/blindbox.2026.001
        </span>
      </div>
      <div data-hero-cta>
        <button type="button" className="paper-pill paper-pill--cta" onClick={() => scrollToSection("#sec-method")}>
          开始实验 →
        </button>
      </div>
    </section>
  );
}

/** ABSTRACT section: study-style summary + keyword ghost tags. */
export function PaperAbstract() {
  const rootRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from("[data-abstract] > *", {
          opacity: 0,
          y: 24,
          stagger: 0.1,
          duration: 0.7,
          ease: "power2.out",
          scrollTrigger: { trigger: rootRef.current, start: "top 82%", once: true },
        });
      });
    },
    { scope: rootRef },
  );

  return (
    <section ref={rootRef} className="paper-col py-16">
      <div data-abstract className="flex max-w-[880px] flex-col gap-6">
        <span className="paper-eyebrow">{`{ 摘要 }`}</span>
        <p className="paper-body">
          本研究提出一种生成式人格显影方法：以大五人格
          <CitationSup n={[3, 4]} />
          为经验基座，经四分类成人依恋模型
          <CitationSup n={8} />
          、防御机制成熟度分层
          <CitationSup n={[10, 12]} />
          与荣格人格面具/阴影理论
          <CitationSup n={13} />
          逐层约束推理，融合当代网络人格原型
          <CitationSup n={15} />
          ，每次采样均产出不重复之人格样本。区别于重测信度长期受质疑的 MBTI
          <CitationSup n={[1, 2]} />
          ，本方法仅保留其字母代号作为审美外壳；诊断结论均可逐层溯源。形式化地，人格显影函数定义为：
        </p>

        {/* 式 1 — 把编号公式放大到 display 级别：论文的严谨格式 × 营销站的字号。
            各符号沿用六层恒定层色（color = taxonomy），与表 1、参考文献同色。 */}
        <figure className="paper-equation-block">
          <div className="paper-equation">
            <span
              className="paper-equation-math"
              aria-label="人格 等于 f（大五人格，依恋，防御，面具减阴影，原型修正项）"
            >
              𝒫 = f(<span style={{ color: LAYER_COLORS.bigFive }}>B₅</span>,{" "}
              <span style={{ color: LAYER_COLORS.attachment }}>A</span>,{" "}
              <span style={{ color: LAYER_COLORS.defense }}>D</span>,{" "}
              <span style={{ color: LAYER_COLORS.maskShadow }}>M ⊖ S</span>,{" "}
              <span style={{ color: LAYER_COLORS.archetype }}>𝒜′</span>)
            </span>
            <span className="paper-equation-no">(1)</span>
          </div>
          <figcaption className="paper-figure-caption">
            式 1：人格显影函数。B₅ 大五人格；A 依恋风格；D 防御机制；M ⊖ S 面具减去阴影；𝒜′
            网络原型修正项。f 不可逆——拆开就装不回去了。
          </figcaption>
        </figure>

        <div className="flex flex-wrap items-center gap-2">
          <span className="paper-meta">关键词：</span>
          {["大五人格", "依恋理论", "防御机制", "人格面具", "盲盒"].map((kw) => (
            <span key={kw} className="paper-tag paper-tag--static">
              {kw}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
