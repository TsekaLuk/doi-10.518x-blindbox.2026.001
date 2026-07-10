import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useGSAP } from "@gsap/react";
import type { Persona } from "@vibe/shared";
import { API_ROUTES, rarityOf, resolveVoiceId } from "@vibe/shared";
import gsap from "gsap";
import { useCallback, useEffect, useRef, useState } from "react";
import { ai } from "../ai/client";
import { FigurineViewer, useTripo3D } from "../components/FigurineViewer";
import { LAYER_COLORS } from "../paper/citations";
import { AnnouncementBanner, CitationSup, References, SectionHeading } from "../paper/PaperChrome";
import { PaperAbstract, PaperHero, scrollToSection } from "../paper/PaperHero";
import { downloadCanvasAsPng, drawResultCard } from "../persona/resultCard";
import { useRealtimeVoice } from "../realtime/useRealtimeVoice";
import { buildBlindBoxDocument } from "../scene/blindbox";
import { useVibeStore } from "../state/store";

/** Exact box-opening animation duration from blindbox.ts's Timeline — used to
 * time the "generating" -> "revealed" transition to land right as the burst
 * finishes settling. */
const BLINDBOX_DURATION_MS = 3000;

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8787";
const REALTIME_WS_URL = API_BASE.replace(/^http/, "ws") + API_ROUTES.aiRealtime;

type Step = "input" | "generating" | "revealing" | "revealed";

interface ImageResult {
  /** data: URI — always safe for <img>/canvas. */
  url: string;
  /** Original signed https OSS url, when the server provided one. Needed by
   * the Tripo 3D figurine flow, which cannot fetch a data: URI. */
  ossUrl?: string;
}

/** Raw fetch mirroring ai/client.ts's baseUrl convention — used instead of
 * ai.generateImage() here because we also need the https ossUrl the typed
 * AIService.generateImage() intentionally narrows away. */
async function fetchPersonaPortrait(prompt: string): Promise<ImageResult> {
  const res = await fetch(new URL(API_ROUTES.aiImage, API_BASE).toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt, style: "wan" }),
  });
  if (!res.ok) throw new Error(`Image generation failed: ${res.status}`);
  return (await res.json()) as ImageResult;
}

/**
 * 情境题 — 精选 3 道（从原先 6 道里挑信号最丰富的三个不同心理角度：
 * 冲动/自我呈现、压力应对、冲突反应），保持"啪啪啪点几下就完事"的节奏。
 */
interface ScenarioQuestion {
  scenario: string;
  question: string;
  options: string[];
}

const SCENARIO_QUESTIONS: ScenarioQuestion[] = [
  {
    scenario: "摸鱼被抓包",
    question: "老板突然走到你工位后面，而你屏幕上开着的是购物车。你的反应是：",
    options: [
      "秒切页面到Excel，面不改色，心跳到嗓子眼",
      "干脆大大方方转过去问「老板你觉得这个好看吗」",
      "假装没看见，继续加购，反正明天就离职",
      "当场脑内写好一篇道歉小作文，虽然还没人骂你",
    ],
  },
  {
    scenario: "DDL前夜",
    question: "DDL前一晚，东西还没做完，你的状态是：",
    options: [
      "疯狂列清单、做计划表，把焦虑转化成条理",
      "先摆烂刷十分钟手机，骗自己在「充电」",
      "边做边跟朋友吐槽「人生好难」，发疯文学附体",
      "异常冷静，甚至开始整理桌面，因为反正急也没用",
    ],
  },
  {
    scenario: "被阴阳怪气",
    question: "有人阴阳怪气地内涵你，你通常会：",
    options: [
      "假装没听懂，礼貌微笑，内心已经拉黑",
      "当场怼回去，绝不吃这个亏",
      "回家越想越气，写一整篇小作文但没有发出去",
      "转头就忘，过会儿该笑笑该吃吃",
    ],
  },
];

/**
 * 心情/状态自述 chips —— 用户报的是"当下发生了什么"（输入信号），
 * 不是"我是什么类型"（输出结论）。刻意不用 `ARCHETYPES`（那是 AI 自己的
 * 第4层诊断输出 `persona.archetype`），否则用户会在拆盒前就把答案剧透
 * 给自己，"盲盒"的悬念也就没了。
 */
const MOOD_CHIPS = [
  "今天崩溃了",
  "摸鱼中",
  "想发疯",
  "很想躺平",
  "精神状态良好",
  "有点emo",
  "无语子",
  "刚被夸了",
  "刚被阴阳了",
  "计划全乱了",
  "加班到麻木",
  "一言难尽",
] as const;

/**
 * 被试基本信息（可整步跳过）—— MBTI/星座/九型/性别/SBTI 作为"弱先验"：
 * 填了能让显影更合理、更细致、更惊喜（AI 会拿它们做文章），全部可单独留空。
 */
interface ProfileInfo {
  gender: string | null;
  /** Full 4-letter type code (e.g. "INFP") or null when skipped. */
  mbti: string | null;
  zodiac: string | null;
  enneagram: number | null;
  /** Optional Enneagram wing — must be one of the two types adjacent to `enneagram`. */
  enneagramWing: number | null;
  sbti: string;
}

const EMPTY_PROFILE: ProfileInfo = {
  gender: null,
  mbti: null,
  zodiac: null,
  enneagram: null,
  enneagramWing: null,
  sbti: "",
};

/** The two valid wings for an Enneagram main type (adjacent, wrapping 1<->9). */
function enneagramWingsOf(n: number): [number, number] {
  return [n === 1 ? 9 : n - 1, n === 9 ? 1 : n + 1];
}

/**
 * The 16 MBTI types with their widely-recognized Chinese nicknames.
 * Avatar artwork in public/mbti16/ is sourced from 16personalities.com
 * (their well-known character illustrations — used here for a hackathon
 * demo at explicit user direction; not original assets of this repo).
 */
const MBTI_TYPES: Array<{ code: string; nick: string }> = [
  { code: "INTJ", nick: "建筑师" },
  { code: "INTP", nick: "逻辑学家" },
  { code: "ENTJ", nick: "指挥官" },
  { code: "ENTP", nick: "辩论家" },
  { code: "INFJ", nick: "提倡者" },
  { code: "INFP", nick: "调停者" },
  { code: "ENFJ", nick: "主人公" },
  { code: "ENFP", nick: "竞选者" },
  { code: "ISTJ", nick: "物流师" },
  { code: "ISFJ", nick: "守卫者" },
  { code: "ESTJ", nick: "总经理" },
  { code: "ESFJ", nick: "执政官" },
  { code: "ISTP", nick: "鉴赏家" },
  { code: "ISFP", nick: "探险家" },
  { code: "ESTP", nick: "企业家" },
  { code: "ESFP", nick: "表演者" },
];

const GENDER_OPTIONS = ["女", "男", "其他", "不想说"] as const;
const ZODIAC_OPTIONS = [
  "白羊座",
  "金牛座",
  "双子座",
  "巨蟹座",
  "狮子座",
  "处女座",
  "天秤座",
  "天蝎座",
  "射手座",
  "摩羯座",
  "水瓶座",
  "双鱼座",
] as const;
/** Self-reported priors clause; empty string when everything was skipped. */
function composeProfileClause(p: ProfileInfo): string {
  const bits: string[] = [];
  if (p.gender) bits.push(`性别${p.gender}`);
  if (p.mbti) bits.push(`MBTI ${p.mbti}`);
  if (p.zodiac) bits.push(p.zodiac);
  if (p.enneagram) {
    bits.push(p.enneagramWing ? `九型${p.enneagram}w${p.enneagramWing}` : `九型${p.enneagram}号`);
  }
  if (p.sbti.trim()) bits.push(`SBTI ${p.sbti.trim()}`);
  return bits.length > 0 ? `TA自报的既有标签：${bits.join("、")}。` : "";
}

/** Total screens: mood chips + optional profile + N scenario questions. */
const JOURNEY_LENGTH = 2 + SCENARIO_QUESTIONS.length;
/** journeyIndex of the first scenario question. */
const SCENARIO_BASE = 2;

/** Merge moods (screen 0) + profile priors (screen 1) + scenario answers into one paragraph. */
function composeJourneyPrompt(moods: string[], profile: ProfileInfo, answers: string[]): string {
  const moodPart = moods.length > 0 ? `TA现在的状态是：${moods.join("、")}。` : "";
  const profilePart = composeProfileClause(profile);
  const scenarioParts = SCENARIO_QUESTIONS.map((q, i) => (answers[i] ? `${q.scenario}——${answers[i]}` : null)).filter(
    (p): p is string => Boolean(p),
  );
  const scenarioPart = scenarioParts.length > 0 ? `在这些情境里，TA是这样反应的：${scenarioParts.join("；")}。` : "";
  return [moodPart, profilePart, scenarioPart].filter(Boolean).join("");
}

export function PersonaFlow() {
  const [step, setStep] = useState<Step>("input");

  // Single linear pre-reveal journey:
  // 0 = mood chips, 1 = optional profile priors, 2..N+1 = scenario questions.
  const [journeyIndex, setJourneyIndex] = useState(0);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [profile, setProfile] = useState<ProfileInfo>(EMPTY_PROFILE);
  const [scenarioAnswers, setScenarioAnswers] = useState<string[]>([]);
  const [error, setError] = useState<string | undefined>();

  // The exact composed prompt that produced the current persona — kept so the
  // post-reveal "补充一句" refinement can append to it rather than starting over.
  const [lastPrompt, setLastPrompt] = useState("");
  const [refineOpen, setRefineOpen] = useState(false);
  const [refineText, setRefineText] = useState("");

  const [persona, setPersona] = useState<Persona | null>(null);
  const [portrait, setPortrait] = useState<ImageResult | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlocked, setAudioBlocked] = useState(false);
  // 画像/语音各自独立 settle —— 任一失败只影响自己，不阻塞另一个。
  const [portraitError, setPortraitError] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  /** 慢资产（画像/语音）开始生成的时刻 —— 骨架占位里的"已等待 mm:ss"以此计时。 */
  const [assetsStartedAt, setAssetsStartedAt] = useState<number | null>(null);

  const [chatOpen, setChatOpen] = useState(false);
  const [figurineOpen, setFigurineOpen] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const revealRef = useRef<HTMLDivElement>(null);
  const cardDrawnForRef = useRef<string | null>(null);
  /** 每次 openBlindBox 递增 —— 让重抽后迟到的旧请求结果直接作废。 */
  const runIdRef = useRef(0);
  /** 保证 reveal 入场动画 / 自动播放各只发生一次（资产分批落地会让 effect 重跑）。 */
  const revealAnimatedForRef = useRef<number | null>(null);
  const audioPlayedForRef = useRef<string | null>(null);
  /** 复用同一个 Audio 实例 —— 重复点"播放人格自白"先归零再播，不叠音。 */
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  const { setScene, setTimeline } = useVibeStore();

  const instructions = persona
    ? `你正在扮演一个名叫"${persona.name}"的人格。你的人格面具（对外表现）是：${persona.personaMask}。你的阴影面（内心深处但通常藏起来的部分）是：${persona.shadowSide}。你说话的调性可以参考这句自白："${persona.roast}"。请始终用第一人称、符合以上设定的语气与用户对话，简短、真实、偶尔毒舌或发疯文学风，不要跳出角色，不要提及你是AI。`
    : "";

  const voice = useRealtimeVoice({
    wsUrl: REALTIME_WS_URL,
    instructions,
    voiceId: resolveVoiceId(persona?.voiceStyle),
  });

  const tripo = useTripo3D(portrait?.ossUrl);

  const resetToInput = useCallback(() => {
    setStep("input");
    setJourneyIndex(0);
    setSelectedTags([]);
    setProfile(EMPTY_PROFILE);
    setScenarioAnswers([]);
    setError(undefined);
    setLastPrompt("");
    setRefineOpen(false);
    setRefineText("");
    setPersona(null);
    setPortrait(null);
    setAudioUrl(null);
    setAudioBlocked(false);
    setPortraitError(null);
    setAudioError(null);
    setAssetsStartedAt(null);
    setChatOpen(false);
    setFigurineOpen(false);
    runIdRef.current += 1;
    cardDrawnForRef.current = null;
    revealAnimatedForRef.current = null;
    audioPlayedForRef.current = null;
    audioElRef.current?.pause();
    audioElRef.current = null;
    voice.stop();
    scrollToSection("#sec-method");
  }, [voice]);

  async function openBlindBox(promptText: string) {
    const trimmed = promptText.trim();
    if (!trimmed || step === "generating") return;
    // 新一轮显影：作废上一轮迟到的异步结果，并清空上一轮的资产/守卫。
    runIdRef.current += 1;
    const runId = runIdRef.current;
    setLastPrompt(trimmed);
    setStep("generating");
    setError(undefined);
    setPortrait(null);
    setAudioUrl(null);
    setAudioBlocked(false);
    setPortraitError(null);
    setAudioError(null);
    setAssetsStartedAt(null);
    cardDrawnForRef.current = null;
    revealAnimatedForRef.current = null;
    audioPlayedForRef.current = null;
    audioElRef.current?.pause();
    audioElRef.current = null;
    // All waiting/reveal states render inside the paper's §2 Results section.
    scrollToSection("#sec-results");
    try {
      const newPersona = await ai.generatePersona(trimmed);
      if (runIdRef.current !== runId) return;
      setPersona(newPersona);
      setStep("revealing");

      // Play the 3D burst immediately behind the document.
      const { scene, timeline } = buildBlindBoxDocument(newPersona.palette as [string, string, string]);
      setScene(scene);
      setTimeline(timeline);

      // Kick off portrait + speech in parallel — 各自独立 settle，谁先到谁先上，
      // 任一失败只影响自己，不阻塞另一个（也不阻塞 persona 文本的展示）。
      setAssetsStartedAt(Date.now());
      void fetchPersonaPortrait(newPersona.imagePrompt)
        .then((img) => {
          if (runIdRef.current === runId) setPortrait(img);
        })
        .catch((err) => {
          if (runIdRef.current === runId)
            setPortraitError(err instanceof Error ? err.message : "画像生成失败");
        });
      void ai
        .synthesizeSpeech(newPersona.roast, resolveVoiceId(newPersona.voiceStyle))
        .then((audio) => {
          if (runIdRef.current === runId) setAudioUrl(audio);
        })
        .catch((err) => {
          if (runIdRef.current === runId)
            setAudioError(err instanceof Error ? err.message : "语音生成失败");
        });

      setTimeout(() => {
        // 3s 盲盒动画视觉上落定 —— 立即揭示 persona 文本（名字/tagline/roast/表1），
        // 慢资产（画像 60-90s、语音）到了再各自补位，不再让文本干等。
        if (runIdRef.current === runId) setStep("revealed");
      }, BLINDBOX_DURATION_MS);
    } catch (err) {
      if (runIdRef.current !== runId) return;
      setError(err instanceof Error ? err.message : "人格生成失败，再试一次？");
      setStep("input");
      // error banner 在 §1 —— 滚回去让失败可见，而不是留在空荡荡的 §2。
      scrollToSection("#sec-method");
    }
  }

  /** re-roll：直接用上一次的完整 prompt 重新显影，不清空量表状态、不重走 5 屏。 */
  function rerollSamePrompt() {
    if (lastPrompt) void openBlindBox(lastPrompt);
  }

  function toggleTag(tag: string) {
    setSelectedTags((prev) => {
      if (prev.includes(tag)) return prev.filter((t) => t !== tag);
      if (prev.length >= 3) return [...prev.slice(1), tag];
      return [...prev, tag];
    });
  }

  function goNextFromMoods() {
    setJourneyIndex(1);
  }

  /** Leave the (fully optional) profile step — same exit for 继续 and 跳过. */
  function goNextFromProfile() {
    setJourneyIndex(SCENARIO_BASE);
  }

  function answerScenario(optionText: string) {
    const qIdx = journeyIndex - SCENARIO_BASE;
    const next = [...scenarioAnswers];
    next[qIdx] = optionText;
    setScenarioAnswers(next);
    if (qIdx >= SCENARIO_QUESTIONS.length - 1) {
      void openBlindBox(composeJourneyPrompt(selectedTags, profile, next));
    } else {
      setJourneyIndex(journeyIndex + 1);
    }
  }

  function goBackJourney() {
    setJourneyIndex((i) => Math.max(0, i - 1));
  }

  /** Free-expression channel (typed text or voice transcript from the unified
   * composer) skips the whole tap sequence — it becomes the composed prompt. */
  function submitFreeform(text: string) {
    void openBlindBox(text);
  }

  function submitRefine() {
    const extra = refineText.trim();
    if (!extra) return;
    setRefineOpen(false);
    setRefineText("");
    void openBlindBox(`${lastPrompt} 补充：${extra}`);
  }

  // "revealed" 后资产分批落地，effect 会随之重跑 —— 用 ref 守卫保证：
  // 入场动画只播一次、audio 只自动播一次、结果卡每张画像只画一次。
  useGSAP(
    () => {
      if (step !== "revealed" || !persona) return;

      if (audioUrl && audioPlayedForRef.current !== audioUrl) {
        audioPlayedForRef.current = audioUrl;
        const audio = new Audio(audioUrl);
        audioElRef.current = audio;
        audio.play().catch(() => setAudioBlocked(true));
      }

      if (portrait && canvasRef.current && cardDrawnForRef.current !== portrait.url) {
        cardDrawnForRef.current = portrait.url;
        void drawResultCard(canvasRef.current, { persona, portraitDataUrl: portrait.url });
      }

      if (revealRef.current && revealAnimatedForRef.current !== runIdRef.current) {
        revealAnimatedForRef.current = runIdRef.current;
        gsap.from(revealRef.current.querySelectorAll("[data-reveal]"), {
          opacity: 0,
          y: 24,
          scale: 0.98,
          stagger: 0.07,
          duration: 0.6,
          ease: "power3.out",
        });
        // 只在首次揭示时定位到 §2 —— 后续画像/语音补位时不打断读者滚动。
        scrollToSection("#sec-results");
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    { dependencies: [step, portrait, audioUrl] },
  );

  /** 常驻重播入口 —— 复用同一个 Audio 实例，先 pause 归零再播，不叠音。 */
  const replayAudio = useCallback(() => {
    if (!audioUrl) return;
    if (!audioElRef.current || audioElRef.current.src !== audioUrl) {
      audioElRef.current = new Audio(audioUrl);
    }
    const el = audioElRef.current;
    el.pause();
    el.currentTime = 0;
    void el.play().catch(() => {});
  }, [audioUrl]);

  // During the 3D burst the paper steps aside so the canvas behind carries
  // the moment — a brief focus dim, then the document fades back in.
  const dimmed = step === "revealing";

  return (
    <>
      {/* burst 锚点：整份 paper-doc 被 dim 到 0.08 时，若 3D 没渲染出来就是白屏 ——
          这行文案提升到独立 fixed 层，不参与 dim，保证视口内始终有一行可读文字。 */}
      {dimmed ? (
        <div
          className="pointer-events-none fixed inset-x-0 bottom-[12vh] z-50 flex justify-center"
          aria-live="polite"
        >
          <p className="paper-body rounded-full bg-[#fffef5]/85 px-6 py-2 shadow-lg backdrop-blur">
            盒子正在打开...
          </p>
        </div>
      ) : null}
      <div className="paper-doc" style={{ opacity: dimmed ? 0.08 : 1 }}>
      <AnnouncementBanner />
      <PaperHero />
      <PaperAbstract />

      {/* ── §1 方法 — the interactive journey (被试自报告) ─────────── */}
      <section id="sec-method" className="paper-col py-16">
        <SectionHeading eyebrow="方法" number="§1" title="被试自报告" />
        <p className="paper-body max-w-[880px] pb-10">
          下面是三分钟的自报告量表——直接点选即可，也可以在量表下方直接口述 / 书写。
          自报告与人格特质的关联性见 Noftle &amp; Shaver
          <CitationSup n={9} />
          。
        </p>

        {step === "input" ? (
          <InputJourney
            journeyIndex={journeyIndex}
            selectedTags={selectedTags}
            onToggleTag={toggleTag}
            onNextFromMoods={goNextFromMoods}
            profile={profile}
            onProfileChange={setProfile}
            onNextFromProfile={goNextFromProfile}
            onAnswerScenario={answerScenario}
            onBack={goBackJourney}
            onJumpTo={setJourneyIndex}
            onFreeform={submitFreeform}
            error={error}
          />
        ) : (
          <div className="flex flex-wrap items-center gap-4">
            <span className="paper-tag paper-tag--static paper-tag--active">自报告已采集</span>
            {step === "revealed" ? (
              <button type="button" className="paper-pill paper-pill--sm" onClick={resetToInput}>
                重新填量表
              </button>
            ) : null}
          </div>
        )}
      </section>

      {/* ── §2 结果 — waiting states + the reveal ──────────────────── */}
      <section id="sec-results" className="paper-col py-16">
        <SectionHeading eyebrow="结果" number="§2" title="人格显影" />

        {step === "input" ? (
          <p className="paper-body paper-muted">结果待采集 — 请先完成 §1 被试自报告。</p>
        ) : null}

        {step === "generating" ? <GeneratingState /> : null}
        {step === "revealing" ? <RevealingState /> : null}

        {step === "revealed" && persona ? (
          <ResultsSection
            revealRef={revealRef}
            canvasRef={canvasRef}
            persona={persona}
            portrait={portrait}
            portraitError={portraitError}
            audioUrl={audioUrl}
            audioError={audioError}
            audioBlocked={audioBlocked}
            assetsStartedAt={assetsStartedAt}
            onManualPlay={replayAudio}
          />
        ) : null}
      </section>

      {/* ── §3 讨论 — post-reveal actions ──────────────────────────── */}
      <section id="sec-discussion" className="paper-col py-16">
        <SectionHeading eyebrow="讨论" number="§3" title="局限性与展望" />

        {step === "revealed" && persona ? (
          <DiscussionSection
            persona={persona}
            portrait={portrait}
            onSave={() => canvasRef.current && downloadCanvasAsPng(canvasRef.current, `${persona.code}.png`)}
            onReroll={rerollSamePrompt}
            onResetForm={resetToInput}
            chatOpen={chatOpen}
            onToggleChat={() => setChatOpen((v) => !v)}
            voice={voice}
            figurineOpen={figurineOpen}
            onToggleFigurine={() => {
              setFigurineOpen((v) => !v);
              if (!figurineOpen && tripo.status === "idle") tripo.start();
            }}
            tripo={tripo}
            refineOpen={refineOpen}
            refineText={refineText}
            onToggleRefine={() => setRefineOpen((v) => !v)}
            onRefineChange={setRefineText}
            onSubmitRefine={submitRefine}
          />
        ) : (
          <p className="paper-body paper-muted">讨论将于 §2 结果显影后开放。</p>
        )}
      </section>

        <References />
      </div>
    </>
  );
}

/** Numbered, clickable step indicators — completed steps navigate back. */
function JourneySteps(props: { total: number; current: number; onJumpTo: (i: number) => void }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        {Array.from({ length: props.total }, (_, i) => {
          const state = i === props.current ? "current" : i < props.current ? "done" : "todo";
          return (
            <button
              key={i}
              type="button"
              disabled={i >= props.current}
              onClick={() => props.onJumpTo(i)}
              className={`paper-step paper-step--${state}`}
              title={i < props.current ? `回到第 ${i + 1} 步` : undefined}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
      <span className="paper-question-hint">
        第 {props.current + 1} 步 / 共 {props.total} 步
      </span>
    </div>
  );
}

function InputJourney(props: {
  journeyIndex: number;
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
  onNextFromMoods: () => void;
  profile: ProfileInfo;
  onProfileChange: (p: ProfileInfo) => void;
  onNextFromProfile: () => void;
  onAnswerScenario: (optionText: string) => void;
  onBack: () => void;
  onJumpTo: (i: number) => void;
  onFreeform: (text: string) => void;
  error?: string;
}) {
  const label =
    props.journeyIndex === 0
      ? "量表 A · 状态自述"
      : props.journeyIndex === 1
        ? "量表 B · 被试基本信息（全部可跳过）"
        : "量表 C · 情境反应任务";

  return (
    <div className="flex w-full max-w-[760px] flex-col gap-6">
      {props.error ? (
        <Banner status="error" title="出错了" description={props.error} container="card" isDismissable={false} />
      ) : null}

      {/* The instrument card: a clearly bounded, obviously-interactive quiz
          panel — the paper metaphor labels it like an inset scale/figure, but
          inside it must read as a form, not prose. */}
      <div className="paper-instrument">
        <div className="paper-instrument-header">
          <span className="paper-instrument-label">{label}</span>
          <JourneySteps total={JOURNEY_LENGTH} current={props.journeyIndex} onJumpTo={props.onJumpTo} />
        </div>
        <div className="paper-instrument-body">
          {props.journeyIndex === 0 ? (
            <MoodStep selectedTags={props.selectedTags} onToggleTag={props.onToggleTag} onNext={props.onNextFromMoods} />
          ) : props.journeyIndex === 1 ? (
            <ProfileStep profile={props.profile} onChange={props.onProfileChange} onNext={props.onNextFromProfile} />
          ) : (
            <ScenarioStep
              question={SCENARIO_QUESTIONS[props.journeyIndex - SCENARIO_BASE]}
              index={props.journeyIndex}
              onAnswer={props.onAnswerScenario}
              onBack={props.onBack}
            />
          )}
        </div>
      </div>

      {props.journeyIndex === 0 ? (
        <>
          <div className="paper-or-divider">
            <span>或</span>
          </div>
          <div className="flex flex-col gap-2">
            <span className="paper-meta">跳过量表，直接说 / 直接写——一句话也够：</span>
            <PromptComposer onSubmit={props.onFreeform} />
          </div>
        </>
      ) : null}
    </div>
  );
}

/**
 * 量表 B — optional self-reported priors (性别/MBTI/星座/九型/SBTI).
 * Every field is individually skippable and the whole step exits with one tap.
 */
function ProfileStep(props: { profile: ProfileInfo; onChange: (p: ProfileInfo) => void; onNext: () => void }) {
  const { profile } = props;

  const toggle = <K extends "gender" | "zodiac">(key: K, value: string) =>
    props.onChange({ ...profile, [key]: profile[key] === value ? null : value });

  const toggleMbti = (code: string) =>
    props.onChange({ ...profile, mbti: profile.mbti === code ? null : code });

  // Changing (or clearing) the main type always resets the wing — a wing is
  // only meaningful relative to its main type.
  const toggleEnneagram = (n: number) =>
    props.onChange({
      ...profile,
      enneagram: profile.enneagram === n ? null : n,
      enneagramWing: null,
    });

  const toggleWing = (w: number) =>
    props.onChange({ ...profile, enneagramWing: profile.enneagramWing === w ? null : w });

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h3 className="paper-question">愿意透露一点"既有设定"吗？</h3>
        <span className="paper-question-hint">
          全部可跳过——但填了会让显影更合理、更细致、更惊喜（AI 会拿它们做文章）
        </span>
      </div>

      <div className="paper-profile-group">
        <span className="paper-profile-label">性别</span>
        <div className="flex flex-wrap gap-2">
          {GENDER_OPTIONS.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => toggle("gender", g)}
              className={`paper-tag ${profile.gender === g ? "paper-tag--active" : ""}`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      <div className="paper-profile-group">
        <span className="paper-profile-label">
          MBTI <span className="paper-question-hint">（不知道就不点，选几个字母也行）</span>
        </span>
        <div className="paper-mbti-grid">
          {MBTI_TYPES.map((t) => (
            <button
              key={t.code}
              type="button"
              onClick={() => toggleMbti(t.code)}
              className={`paper-mbti-card ${profile.mbti === t.code ? "paper-mbti-card--active" : ""}`}
            >
              {/* Avatar artwork from 16personalities.com (see MBTI_TYPES comment). */}
              <img
                src={`/mbti16/${t.code}.svg`}
                alt=""
                aria-hidden
                loading="lazy"
                className="paper-mbti-card-icon"
                onError={(e) => {
                  // Missing/failed asset: hide the img, the text label carries the button.
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
              <span className="paper-mbti-card-letter">{t.code}</span>
              <span className="paper-mbti-card-label">{t.nick}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="paper-profile-group">
        <span className="paper-profile-label">星座</span>
        <div className="flex flex-wrap gap-2">
          {ZODIAC_OPTIONS.map((z) => (
            <button
              key={z}
              type="button"
              onClick={() => toggle("zodiac", z)}
              className={`paper-tag ${profile.zodiac === z ? "paper-tag--active" : ""}`}
            >
              {z}
            </button>
          ))}
        </div>
      </div>

      <div className="paper-profile-group">
        <span className="paper-profile-label">九型人格</span>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 9 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => toggleEnneagram(n)}
              className={`paper-tag paper-tag--letter ${profile.enneagram === n ? "paper-tag--active" : ""}`}
            >
              {n}
            </button>
          ))}
        </div>
        {profile.enneagram ? (
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <span className="paper-question-hint">侧翼（可选）：</span>
            {enneagramWingsOf(profile.enneagram).map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => toggleWing(w)}
                className={`paper-tag paper-tag--letter ${profile.enneagramWing === w ? "paper-tag--active" : ""}`}
              >
                w{w}
              </button>
            ))}
            <span className="paper-question-hint">
              {profile.enneagramWing ? `= ${profile.enneagram}w${profile.enneagramWing}` : "不选就是纯主型"}
            </span>
          </div>
        ) : null}
      </div>

      <div className="paper-profile-group">
        <span className="paper-profile-label">SBTI</span>
        <input
          type="text"
          className="paper-profile-input"
          value={profile.sbti}
          onChange={(e) => props.onChange({ ...profile, sbti: e.target.value })}
          placeholder="SBTI 测过的话，填你的结果代号"
        />
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <button type="button" className="paper-pill paper-pill--cta" onClick={props.onNext}>
          继续 →
        </button>
        <button type="button" className="paper-pill paper-pill--sm" onClick={props.onNext}>
          跳过这步
        </button>
      </div>
    </div>
  );
}

function MoodStep(props: { selectedTags: string[]; onToggleTag: (tag: string) => void; onNext: () => void }) {
  const count = props.selectedTags.length;
  const canNext = count > 0;
  const [customOpen, setCustomOpen] = useState(false);
  const [customText, setCustomText] = useState("");

  // User-added chips: anything selected that isn't a preset. Rendered as
  // toggleable chips just like presets (tap to unselect = removed).
  const customTags = props.selectedTags.filter((t) => !MOOD_CHIPS.includes(t as (typeof MOOD_CHIPS)[number]));

  function addCustom() {
    const text = customText.trim();
    if (!text) return;
    setCustomText("");
    setCustomOpen(false);
    if (!props.selectedTags.includes(text)) props.onToggleTag(text);
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h3 className="paper-question">此刻的你，更接近哪几种状态？</h3>
        <span className="paper-question-hint">点击选择 1-3 个，再点一次可取消；没有合适的就自己写一个</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {MOOD_CHIPS.map((tag) => {
          const active = props.selectedTags.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              onClick={() => props.onToggleTag(tag)}
              className={`paper-tag ${active ? "paper-tag--active" : ""}`}
            >
              {tag}
            </button>
          );
        })}
        {customTags.map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => props.onToggleTag(tag)}
            className="paper-tag paper-tag--active"
          >
            {tag} ×
          </button>
        ))}
        {customOpen ? (
          <span className="inline-flex items-center gap-2">
            <input
              autoFocus
              type="text"
              value={customText}
              maxLength={12}
              placeholder="自己写一个状态"
              onChange={(e) => setCustomText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addCustom();
                if (e.key === "Escape") setCustomOpen(false);
              }}
              onBlur={() => (customText.trim() ? addCustom() : setCustomOpen(false))}
              className="paper-tag w-40 outline-none placeholder:text-[--paper-ink-muted]"
            />
          </span>
        ) : (
          <button type="button" className="paper-tag" onClick={() => setCustomOpen(true)}>
            + 自定义
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <button type="button" className="paper-pill paper-pill--cta" onClick={props.onNext} disabled={!canNext}>
          下一步 →
        </button>
        <span className="paper-question-hint">
          {/* 满 3 个时再选会静默挤掉最早的一个（见 toggleTag 的 slice(1)）——把这条规则说出来。 */}
          {count >= 3 ? "已选 3 / 3，再选会替换最早的一个" : canNext ? `已选 ${count} / 3` : "先选至少 1 个"}
        </span>
      </div>
    </div>
  );
}

/** Option letters — the universal "this is a quiz" affordance. */
const OPTION_LETTERS = ["A", "B", "C", "D", "E"] as const;

function ScenarioStep(props: {
  question: ScenarioQuestion | undefined;
  index: number;
  onAnswer: (optionText: string) => void;
  onBack: () => void;
}) {
  const [chosen, setChosen] = useState<string | null>(null);

  // Reset the tap-feedback highlight when the question changes.
  useEffect(() => {
    setChosen(null);
  }, [props.index]);

  const q = props.question;
  if (!q) return null;

  function pick(opt: string) {
    if (chosen) return; // ignore double-taps while the feedback flash plays
    setChosen(opt);
    window.setTimeout(() => props.onAnswer(opt), 180);
  }

  return (
    <div className="flex w-full flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <span className="paper-question-hint">情境题 · {q.scenario}</span>
        <h3 className="paper-question">{q.question}</h3>
        <span className="paper-question-hint">点一个最像你的选项，自动进入下一题</span>
      </div>

      <div className="flex w-full flex-col gap-2.5">
        {q.options.map((opt, i) => (
          <button
            key={opt}
            type="button"
            onClick={() => pick(opt)}
            className={`paper-option ${chosen === opt ? "paper-option--chosen" : ""}`}
          >
            <span className="paper-option-letter">{OPTION_LETTERS[i]}</span>
            <span className="paper-option-text">{opt}</span>
            <span className="paper-option-arrow" aria-hidden>
              →
            </span>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={props.onBack}
        className="self-start text-sm text-surface-50 underline-offset-4 hover:text-[#078e3a] hover:underline"
      >
        ← 上一题
      </button>
    </div>
  );
}

/* ── Unified prompt composer (ChatGPT-style, adapted to the paper skin) ── */

type ComposerState = "idle" | "recording" | "transcribing" | "mic-unavailable";

function MicIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <line x1="12" y1="18" x2="12" y2="21" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="5 12 12 5 19 12" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <rect x="5" y="5" width="14" height="14" rx="2" />
    </svg>
  );
}

/** Deterministic pseudo-random bar heights for the fake audio visualizer. */
const VISUALIZER_BARS = Array.from({ length: 28 }, (_, i) => ({
  height: 6 + ((i * 7919) % 17),
  delay: ((i * 37) % 90) / 100,
}));

/**
 * One rounded container, ChatGPT-composer-style, holding an auto-growing
 * textarea and a single morphing action button:
 *  - empty text  -> mic icon, CLICK toggles voice recording (not hold-to-talk)
 *  - has text    -> send arrow, submits the typed text
 *  - recording   -> stop square; the textarea is replaced inline by a pulsing
 *    red dot + mm:ss timer + a CSS-animated visualizer row
 * Both channels (typed text, ASR transcript) bypass the chip/scenario tap
 * sequence entirely and become the whole composed prompt.
 */
function PromptComposer(props: { onSubmit: (text: string) => void }) {
  const [state, setState] = useState<ComposerState>("idle");
  const [text, setText] = useState("");
  const [seconds, setSeconds] = useState(0);
  /** ASR 失败不再静默 —— 显示一行提示，下次输入/录音时自动清除。 */
  const [asrError, setAsrError] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => () => cleanupStream(), [cleanupStream]);

  function autoResize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }

  function submitTyped() {
    const trimmed = text.trim();
    if (!trimmed) return;
    setText("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    props.onSubmit(trimmed);
  }

  async function startRecording() {
    setAsrError(false);
    if (typeof MediaRecorder === "undefined") {
      setState("mic-unavailable");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.start();
      recorderRef.current = recorder;
      setSeconds(0);
      timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
      setState("recording");
    } catch {
      setState("mic-unavailable");
    }
  }

  async function stopAndSend() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      setState("idle");
      return;
    }
    setState("transcribing");
    const mimeType = recorder.mimeType || "audio/webm";
    const format = mimeType.split("/")[1]?.split(";")[0]?.trim() || "webm";
    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
      recorder.stop();
    });
    cleanupStream();
    recorderRef.current = null;
    const blob = new Blob(chunksRef.current, { type: mimeType });
    try {
      const buf = await blob.arrayBuffer();
      const res = await fetch(new URL(API_ROUTES.aiAsr, API_BASE).toString(), {
        method: "POST",
        headers: { "content-type": "application/octet-stream", "x-audio-format": format },
        body: buf,
      });
      if (!res.ok) throw new Error(`ASR failed: ${res.status}`);
      const json = (await res.json()) as { text?: string };
      setState("idle");
      if (json.text && json.text.trim()) props.onSubmit(json.text.trim());
    } catch {
      setState("idle");
      setAsrError(true);
    }
  }

  function handleAction() {
    if (state === "recording") {
      void stopAndSend();
    } else if (text.trim()) {
      submitTyped();
    } else {
      void startRecording();
    }
  }

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  const hasText = Boolean(text.trim());
  const actionClass =
    state === "recording"
      ? "paper-composer-action paper-composer-action--recording"
      : hasText
        ? "paper-composer-action paper-composer-action--send"
        : "paper-composer-action";
  const actionTitle = state === "recording" ? "停止并发送" : hasText ? "发送" : "语音输入";

  return (
    <div className="flex w-full flex-col gap-1.5">
      <div className="paper-composer">
        {state === "recording" ? (
          <div className="paper-recording">
            <span className="paper-recording-dot" />
            <span className="paper-recording-timer">
              {mm}:{ss}
            </span>
            <div className="paper-recording-bars" aria-hidden>
              {VISUALIZER_BARS.map((bar, i) => (
                <span key={i} style={{ height: `${bar.height}px`, animationDelay: `${bar.delay}s` }} />
              ))}
            </div>
            <span className="paper-recording-hint">点击停止并发送</span>
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            rows={1}
            value={text}
            disabled={state === "transcribing"}
            placeholder={state === "transcribing" ? "识别中..." : "描述一下此刻的你，或点右侧按钮口述"}
            onChange={(e) => {
              setAsrError(false);
              setText(e.target.value);
              autoResize();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submitTyped();
              }
            }}
          />
        )}

        <button
          type="button"
          className={actionClass}
          title={actionTitle}
          disabled={state === "transcribing"}
          onClick={handleAction}
        >
          {state === "recording" ? <StopIcon /> : hasText ? <SendIcon /> : <MicIcon />}
        </button>
      </div>
      {state === "mic-unavailable" ? <span className="paper-meta">麦克风不可用——直接打字也一样。</span> : null}
      {asrError ? <span className="paper-meta">语音识别失败了——直接打字也一样。</span> : null}
    </div>
  );
}

/** 六层诊断的层名+颜色 —— GeneratingState 里按节奏逐个"点亮"。 */
const DIAGNOSIS_LAYERS = [
  { label: "大五人格", color: LAYER_COLORS.bigFive },
  { label: "依恋风格", color: LAYER_COLORS.attachment },
  { label: "防御机制", color: LAYER_COLORS.defense },
  { label: "面具与阴影", color: LAYER_COLORS.maskShadow },
  { label: "网络原型", color: LAYER_COLORS.archetype },
  { label: "调色板", color: LAYER_COLORS.palette },
] as const;

/** 文本生成要 10-20s —— 六个层名每 1.2s 依次点亮（点亮后带 ✓），
 * 全亮后停住，营造"逐层诊断进行中"的演出感。纯前端定时器，不代表真实进度。 */
function GeneratingState() {
  const [litCount, setLitCount] = useState(1);

  useEffect(() => {
    const id = setInterval(() => {
      setLitCount((n) => {
        if (n >= DIAGNOSIS_LAYERS.length) {
          clearInterval(id);
          return n;
        }
        return n + 1;
      });
    }, 1200);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="h-16 w-16 animate-pulse rounded-lg border border-shockingly-green/60 bg-shockingly-green/10" />
      <p className="paper-body">
        正在计算六层诊断<span className="animate-pulse">...</span>
      </p>
      <p className="paper-meta">
        {DIAGNOSIS_LAYERS.map((layer, i) => {
          const lit = i < litCount;
          const current = i === litCount - 1 && litCount < DIAGNOSIS_LAYERS.length;
          return (
            <span key={layer.label}>
              {i > 0 ? " · " : null}
              <span
                className={current ? "animate-pulse" : undefined}
                style={{ color: layer.color, opacity: lit ? 1 : 0.28, transition: "opacity 0.4s ease" }}
              >
                {layer.label}
                {lit && !current ? " ✓" : ""}
              </span>
            </span>
          );
        })}
      </p>
    </div>
  );
}

/** Rotating, honest copy for the slow-asset wait — now lives inside the
 * portrait skeleton (图 1 占位), since the persona text reveals immediately. */
const CRAFTING_MESSAGES = [
  "AI 正在手工绘制你的专属人格画像与语音...",
  "工艺品质的手办渲染需要一点耐心，通常 30-90 秒，再等等~",
  "越独一无二的人格，越值得等——马上就好。",
  "正在给你的人格调色、配音、上釉...",
];

/** 3s 盲盒动画期间 §2 的占位 —— 动画一结束就切到 "revealed"，无 crafting 阶段。 */
function RevealingState() {
  return <p className="paper-body">盒子正在打开...</p>;
}

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(total / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

/** 图 1 的骨架占位 —— 画像未到时保持 4/5 比例的 shimmer，内含 7s 轮换的
 * 等待文案 + "已等待 mm:ss（通常 30-90 秒）"计时，把预期钉住。 */
function PortraitSkeleton(props: { startedAt: number | null }) {
  const [msgIndex, setMsgIndex] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const rotate = setInterval(() => setMsgIndex((i) => (i + 1) % CRAFTING_MESSAGES.length), 7000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(rotate);
      clearInterval(tick);
    };
  }, []);

  return (
    <div
      className="flex w-full max-w-[380px] animate-pulse flex-col items-center justify-center gap-4 rounded-lg border border-[rgba(14,16,15,0.16)] bg-shockingly-green/5 px-6 text-center"
      style={{ aspectRatio: "4 / 5" }}
      aria-live="polite"
    >
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 animate-bounce rounded-full bg-shockingly-green [animation-delay:-0.3s]" />
        <span className="h-3 w-3 animate-bounce rounded-full bg-shockingly-green [animation-delay:-0.15s]" />
        <span className="h-3 w-3 animate-bounce rounded-full bg-shockingly-green" />
      </div>
      <p className="paper-body">{CRAFTING_MESSAGES[msgIndex]}</p>
      {props.startedAt ? (
        <p className="paper-meta">已等待 {formatElapsed(now - props.startedAt)}（通常 30-90 秒）</p>
      ) : null}
    </div>
  );
}

/** §2 结果 — 图 1 (result card) + 样本描述 + 表 1 (six-layer diagnosis). */
function ResultsSection(props: {
  revealRef: React.RefObject<HTMLDivElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  persona: Persona;
  portrait: ImageResult | null;
  portraitError: string | null;
  audioUrl: string | null;
  audioError: string | null;
  audioBlocked: boolean;
  assetsStartedAt: number | null;
  onManualPlay: () => void;
}) {
  const { persona } = props;
  const rarity = rarityOf(persona);
  const bigFiveText = Object.entries(persona.bigFive)
    .map(([trait, level]) => `${trait} ${level}`)
    .join(" · ");

  // 任一慢资产失败只影响自己 —— banner 汇总"部分素材生成失败"，不阻塞另一个。
  const assetErrors = [
    props.portraitError ? `画像：${props.portraitError}` : null,
    props.audioError ? `语音：${props.audioError}` : null,
  ].filter((e): e is string => Boolean(e));

  return (
    <div ref={props.revealRef} className="flex w-full flex-col gap-10">
      {assetErrors.length > 0 ? (
        <Banner
          status="error"
          title="部分素材生成失败"
          description={assetErrors.join("；")}
          container="card"
          isDismissable={false}
        />
      ) : null}

      <div className="grid w-full grid-cols-1 gap-10 lg:grid-cols-[minmax(0,380px)_1fr]">
        {/* 图 1 —— 画像未到时先放骨架占位（persona 文本已先行揭示），到了再补位。 */}
        <figure data-reveal className="flex flex-col items-center gap-3">
          {props.portrait ? (
            <canvas
              ref={props.canvasRef}
              role="img"
              aria-label={`${persona.name} —— ${persona.tagline}`}
              className="w-full max-w-[380px] rounded-lg border border-[rgba(14,16,15,0.16)] shadow-lg"
              style={{ aspectRatio: "4 / 5" }}
            />
          ) : props.portraitError ? (
            <div
              className="flex w-full max-w-[380px] flex-col items-center justify-center gap-2 rounded-lg border border-[rgba(14,16,15,0.16)] bg-[#fffef5]/80 px-6 text-center"
              style={{ aspectRatio: "4 / 5" }}
            >
              <p className="paper-body">画像这次没显影出来</p>
              <p className="paper-meta">人格本体不受影响——可以在 §3 再抽一次。</p>
            </div>
          ) : (
            <PortraitSkeleton startedAt={props.assetsStartedAt} />
          )}
          <figcaption className="paper-figure-caption">图 1：人格显影结果卡（可保存，见 §3）</figcaption>
        </figure>

        {/* 样本描述 */}
        <div className="flex flex-col gap-4">
          <div data-reveal className="flex flex-col gap-2">
            <h3 className="paper-section-heading" style={{ fontSize: "clamp(32px, 4vw, 44px)" }}>
              {persona.name}
            </h3>
            <span className="paper-meta paper-doi">{persona.code}</span>
          </div>

          <p data-reveal className="paper-body">
            {persona.tagline}
          </p>
          <p data-reveal className="paper-body paper-muted">
            「{persona.roast}」
          </p>

          <div data-reveal className="flex flex-wrap gap-2">
            {persona.tags.map((tag) => (
              <span key={tag} className="paper-tag paper-tag--static">
                #{tag}
              </span>
            ))}
          </div>

          {/* 语音自白常驻重播 —— audioUrl 一到就始终可点，重复点击不叠音。 */}
          {props.audioUrl ? (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="paper-pill paper-pill--sm" onClick={props.onManualPlay}>
                播放人格自白
              </button>
              {props.audioBlocked ? (
                <span className="paper-meta">浏览器拦下了自动播放——点上面这颗按钮听。</span>
              ) : null}
            </div>
          ) : props.audioError ? (
            <span className="paper-meta">语音自白这次没生成出来，人格本体不受影响。</span>
          ) : (
            <span className="paper-meta">
              语音自白生成中<span className="animate-pulse">...</span>（到了会自动播放）
            </span>
          )}
        </div>
      </div>

      {/* 表 1 */}
      <div data-reveal className="flex flex-col gap-3">
        <table className="paper-table">
          <thead>
            <tr>
              <th>层</th>
              <th>构念</th>
              <th>显影结果</th>
            </tr>
          </thead>
          <tbody>
            <tr data-reveal>
              <td style={{ color: LAYER_COLORS.bigFive }}>L0</td>
              <td>
                大五人格
                <CitationSup n={[3, 4]} />
              </td>
              <td>{bigFiveText}</td>
            </tr>
            <tr data-reveal>
              <td style={{ color: LAYER_COLORS.attachment }}>L1</td>
              <td>
                依恋风格
                <CitationSup n={8} />
              </td>
              <td>{persona.attachmentStyle}</td>
            </tr>
            <tr data-reveal>
              <td style={{ color: LAYER_COLORS.defense }}>L2</td>
              <td>
                防御机制
                <CitationSup n={[10, 12]} />
              </td>
              <td>
                {persona.defenseMechanism}（{persona.defenseTier} · {"★".repeat(rarity.stars)} {rarity.label}）
              </td>
            </tr>
            <tr data-reveal>
              <td style={{ color: LAYER_COLORS.maskShadow }}>L3</td>
              <td>
                面具 / 阴影
                <CitationSup n={[13, 14]} />
              </td>
              <td>
                面具：{persona.personaMask}；阴影：{persona.shadowSide}
              </td>
            </tr>
            <tr data-reveal>
              <td style={{ color: LAYER_COLORS.archetype }}>L4</td>
              <td>
                网络原型
                <CitationSup n={15} />
              </td>
              <td>{persona.archetype}</td>
            </tr>
            <tr data-reveal>
              <td style={{ color: LAYER_COLORS.palette }}>L5</td>
              <td>调色板</td>
              <td>
                {persona.palette.map((hex) => (
                  <span key={hex}>
                    <span className="paper-swatch" style={{ background: hex }} />
                    <span className="paper-doi paper-meta">{hex} </span>
                  </span>
                ))}
              </td>
            </tr>
          </tbody>
        </table>
        <span className="paper-figure-caption">表 1：六层结构化诊断（层色恒定，对应页脚参考文献同色标注）</span>
      </div>
    </div>
  );
}

/** §3 讨论 — refinement, realtime voice interrogation, figurine, save/re-pull. */
function DiscussionSection(props: {
  persona: Persona;
  portrait: ImageResult | null;
  onSave: () => void;
  /** re-roll：沿用同一份自报告直接重新显影，不重走 5 屏量表。 */
  onReroll: () => void;
  /** 清空一切、回到 §1 重新填量表。 */
  onResetForm: () => void;
  chatOpen: boolean;
  onToggleChat: () => void;
  voice: ReturnType<typeof useRealtimeVoice>;
  figurineOpen: boolean;
  onToggleFigurine: () => void;
  tripo: ReturnType<typeof useTripo3D>;
  refineOpen: boolean;
  refineText: string;
  onToggleRefine: () => void;
  onRefineChange: (v: string) => void;
  onSubmitRefine: () => void;
}) {
  const canFigurine = Boolean(props.portrait?.ossUrl);

  return (
    <div className="flex w-full max-w-[880px] flex-col gap-8">
      <p className="paper-body paper-muted">
        本结果基于单次自报告，样本量 n=1（就是你）。补充信息可提高显影精度；口头质询与实物化环节如下。
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="paper-pill" onClick={props.onSave} disabled={!props.portrait}>
          保存图 1
        </button>
        <button type="button" className="paper-pill" onClick={props.onReroll} title="沿用同一份自报告，直接重新显影">
          再抽一次
        </button>
        <button type="button" className="paper-pill" onClick={props.onResetForm}>
          重新填量表
        </button>
        <button type="button" className="paper-pill" onClick={props.onToggleChat}>
          口头质询（和TA聊聊）
        </button>
        <button
          type="button"
          className="paper-pill"
          onClick={props.onToggleFigurine}
          disabled={!canFigurine}
          title={canFigurine ? undefined : "肖像图暂时只有本地数据链接，手办功能暂不可用"}
        >
          实物化（养成手办）
        </button>
      </div>

      <div className="flex w-full flex-col gap-2">
        {!props.refineOpen ? (
          <button
            type="button"
            onClick={props.onToggleRefine}
            className="self-start text-sm text-surface-50 underline-offset-4 hover:text-[#078e3a] hover:underline"
          >
            还想让TA更懂你？补充一句
          </button>
        ) : (
          <div className="flex w-full max-w-[560px] items-center gap-2 rounded-full border border-[rgba(14,16,15,0.16)] bg-[#fffef5]/80 p-2 pl-5 backdrop-blur">
            <div className="min-w-0 flex-1">
              <TextInput
                label="补充一句"
                isLabelHidden
                value={props.refineText}
                onChange={props.onRefineChange}
                onEnter={props.onSubmitRefine}
                hasClear
                size="md"
                width="100%"
                placeholder="比如：其实我今天还哭了一场"
              />
            </div>
            <Button
              label="重新拆一次"
              variant="primary"
              size="md"
              clickAction={props.onSubmitRefine}
              isDisabled={!props.refineText.trim()}
            >
              重新拆
            </Button>
          </div>
        )}
        {props.refineOpen ? (
          <span className="paper-meta">会重新显影一次，大约 1 分钟。</span>
        ) : null}
      </div>

      {props.chatOpen ? <ChatPanel voice={props.voice} /> : null}
      {props.figurineOpen && canFigurine ? <FigurinePanel tripo={props.tripo} /> : null}
    </div>
  );
}

function ChatPanel(props: { voice: ReturnType<typeof useRealtimeVoice> }) {
  const { voice } = props;
  const micLabel =
    voice.status === "idle" || voice.status === "error"
      ? "开始对话"
      : voice.status === "connecting"
        ? "连接中..."
        : voice.status === "listening"
          ? "聆听中（点击结束）"
          : voice.status === "speaking"
            ? "TA正在说话"
            : "语音不可用";

  return (
    <div className="flex w-full flex-col gap-3 rounded-lg border border-[rgba(14,16,15,0.16)] bg-[#fffef5]/75 p-6 backdrop-blur">
      <span className="paper-eyebrow">{`{ 口头质询 }`}</span>

      {voice.status === "unavailable" ? (
        <Text type="supporting" color="secondary">
          实时语音暂未开启
        </Text>
      ) : (
        <>
          <Button
            label={micLabel}
            variant={voice.status === "listening" || voice.status === "speaking" ? "primary" : "secondary"}
            size="md"
            isLoading={voice.status === "connecting"}
            clickAction={() => {
              if (voice.status === "idle" || voice.status === "error") void voice.start();
              else voice.stop();
            }}
          >
            {micLabel}
          </Button>

          {voice.status === "error" && voice.errorMessage ? (
            <Text type="supporting" color="accent">
              {voice.errorMessage}
            </Text>
          ) : null}

          {voice.transcript.length > 0 ? (
            <div className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-lg bg-surface-25/20 p-3 text-left">
              {voice.transcript.map((line, i) => (
                <Text key={i} type="supporting">
                  {line}
                </Text>
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function FigurinePanel(props: { tripo: ReturnType<typeof useTripo3D> }) {
  const { tripo } = props;

  return (
    <div className="flex w-full flex-col gap-3 rounded-lg border border-[rgba(14,16,15,0.16)] bg-[#fffef5]/75 p-6 backdrop-blur">
      <span className="paper-eyebrow">{`{ 实物化 }`}</span>

      {tripo.status === "submitting" || tripo.status === "processing" ? (
        <Text type="supporting" color="secondary">
          正在生成 3D 手办，大约需要 1-2 分钟...
        </Text>
      ) : null}

      {tripo.status === "error" || tripo.status === "timeout" ? (
        <Banner
          status="error"
          title="手办生成失败"
          description={tripo.errorMessage ?? "请稍后重试"}
          container="card"
          isDismissable={false}
        />
      ) : null}

      {tripo.status === "ready" && tripo.glbUrl ? (
        <FigurineViewer glbUrl={tripo.glbUrl} className="h-80 w-full rounded-lg" />
      ) : null}
    </div>
  );
}
