import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollToPlugin } from "gsap/ScrollToPlugin";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useRef } from "react";
import { LAYER_COLORS, REFERENCES, type LayerKey } from "./citations";

gsap.registerPlugin(ScrollToPlugin, ScrollTrigger);

/** id of a reference entry in the footer — shared by CitationSup + References. */
const refDomId = (n: number) => `paper-ref-${n}`;

/**
 * Superscript in-text citation, e.g. 依恋风格分类<CitationSup n={8}/>.
 * Hover lights up the matching footer entry; click smooth-scrolls to it.
 */
export function CitationSup({ n }: { n: number | number[] }) {
  const nums = Array.isArray(n) ? n : [n];
  const setLit = (lit: boolean) => {
    for (const num of nums) {
      document.getElementById(refDomId(num))?.classList.toggle("paper-ref--lit", lit);
    }
  };
  return (
    <sup
      className="paper-citation"
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
    </sup>
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

/** Footer = 参考文献. Real citations from PERSONA_THEORY.md, layer-hued. */
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
          本文由 vibe coding 完成 · 模型：通义千问 / 万相 / CosyVoice / Tripo · 保留所有发疯权利 © 2026
        </div>
      </div>
    </footer>
  );
}
