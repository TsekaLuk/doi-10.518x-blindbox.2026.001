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
import {
  AnnouncementBanner,
  ArxivStamp,
  CitationSup,
  References,
  RunningHeader,
  SectionHeading,
} from "../paper/PaperChrome";
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
 * 情境题题库 — 48 道，按六大生活域（family）体系化分布、每域 8 道，
 * 每道再各探一个心理信号维度（signal 字段，供维护者对照六层理论；
 * family/signal 均不展示给用户、不进 prompt）。每次拆盒做"跨域分层
 * 抽样"：随机选 3 个不同生活域、每域抽 1 道——节奏仍是"啪啪啪点几下"，
 * 但信号覆盖面有结构保证，"再抽一次"必遇新组合。
 * 文案标准：具体到生活细节，让人"hhh 太有生活了"。
 */
type ScenarioFamily = "职场生存" | "线上社交" | "关系边界" | "独处情绪" | "消费欲望" | "失控意外";

interface ScenarioQuestion {
  scenario: string;
  family: ScenarioFamily;
  /** 该题主要探测的信号维度（内部注记）。 */
  signal: string;
  question: string;
  options: string[];
}

const SCENARIO_POOL: ScenarioQuestion[] = [
  // ── 职场生存 ──────────────────────────────────────────────
  {
    scenario: "摸鱼被抓包",
    family: "职场生存",
    signal: "冲动控制/自我呈现",
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
    family: "职场生存",
    signal: "压力应对",
    question: "DDL前一晚，东西还没做完，你的状态是：",
    options: [
      "疯狂列清单、做计划表，把焦虑转化成条理",
      "先摆烂刷十分钟手机，骗自己在「充电」",
      "边做边跟朋友吐槽「人生好难」，发疯文学附体",
      "异常冷静，甚至开始整理桌面，因为反正急也没用",
    ],
  },
  {
    scenario: "电梯遇老板",
    family: "职场生存",
    signal: "社交面具/权威关系",
    question: "电梯里只有你和大老板，还有三十层，你会：",
    options: [
      "主动没话找话，气氛尬但我先动手",
      "全程盯手机假装处理要事，手心出汗",
      "点头微笑后安静站着，沉默也是一种体面",
      "趁机汇报一句最近的成果，机会都是挤出来的",
    ],
  },
  {
    scenario: "被cue即兴发言",
    family: "职场生存",
    signal: "临场应激/表演型应对",
    question: "会上领导突然说「这块你来讲讲」，而你刚才在走神。你会：",
    options: [
      "把最后听到的半句话复述一遍再总结升华，脸不红心不跳",
      "直接坦白「不好意思刚刚没跟上」，宁可尴尬不装",
      "缓慢重复一遍问题拖时间，大脑同步飞速检索",
      "看向队友疯狂使眼色，团队的事团队扛",
    ],
  },
  {
    scenario: "周报文学",
    family: "职场生存",
    signal: "印象管理/语言包装",
    question: "到了写周报的时候，你发现这周主要在摸鱼。你会：",
    options: [
      "把一件小事拆成三行，动词全部升维：推进、对齐、赋能",
      "如实写，爱咋咋地，我的产出对得起工资",
      "翻同事的周报参考格式，顺便焦虑十分钟",
      "拖到周五23:59，用五分钟总结这一周的人生",
    ],
  },
  {
    scenario: "下班临界点",
    family: "职场生存",
    signal: "从众压力/自主性",
    question: "18:00 到了，活干完了，但办公室没有一个人动。你会：",
    options: [
      "收拾东西直接走，下班是我的合法权利",
      "再坐二十分钟假装收尾，等第一个人动",
      "看领导脸色行事，领导不走我不走",
      "反正也走不了，索性点个外卖继续卷",
    ],
  },
  {
    scenario: "锅从天上来",
    family: "职场生存",
    signal: "自我保护/冲突策略",
    question: "会上有口锅正在向你飞来，但其实是别人的问题。你会：",
    options: [
      "当场摆事实澄清，聊天记录截图早已备好",
      "先扛下来稳住场面，私下再找当事人聊",
      "会后给领导发一篇有理有据的小作文",
      "忍了，但这位同事从此进入终身观察名单",
    ],
  },
  {
    scenario: "年会特等奖",
    family: "职场生存",
    signal: "期待管理/乐观倾向",
    question: "年会抽奖，大屏幕滚动到最后一个特等奖。你会：",
    options: [
      "毫无波动，反正从来抽不到我",
      "心跳加速，已经开始想中奖了发什么朋友圈",
      "和旁边同事互相押注打赌，气氛组担当",
      "早就提前溜了，年会不如回家",
    ],
  },
  // ── 线上社交 ──────────────────────────────────────────────
  {
    scenario: "消息已读不回",
    family: "线上社交",
    signal: "依恋焦虑/社交解读",
    question: "重要的人已读你消息六小时没回，你在想：",
    options: [
      "TA一定是忙，等等就好——但每十分钟看一次手机",
      "开始逐字复盘自己发的话哪里说错了",
      "无所谓，回不回是TA的事，我该干嘛干嘛",
      "直接再发一条「？」，有话当面问清楚",
    ],
  },
  {
    scenario: "五条59秒语音",
    family: "线上社交",
    signal: "边界感/信息处理风格",
    question: "点开对话框，对方发来连续五条59秒语音。你的内心：",
    options: [
      "全部转文字，一目十行——语音是对时间的抢劫",
      "认真听完还倒回去重听一遍，怕漏了细节",
      "先放着，等我攒够勇气再点开",
      "直接回一句「打字说」，边界感拉满",
    ],
  },
  {
    scenario: "发疯朋友圈前夜",
    family: "线上社交",
    signal: "自我呈现/印象管理",
    question: "想发一条带情绪的朋友圈，发送之前你会：",
    options: [
      "分组屏蔽同事和家人，精准运营一个自我",
      "想发就发爱看不看，真实最大",
      "编辑了十分钟，最后一个字也没发",
      "发完十分钟没人点赞，默默删掉",
    ],
  },
  {
    scenario: "大群抢到最佳",
    family: "线上社交",
    signal: "群体压力/互惠焦虑",
    question: "50人大群的拼手气红包，你抢到了最佳。你会：",
    options: [
      "秒发一个更大的回去，排面不能输",
      "甩一个表情包哈哈哈混过去",
      "默默截图当今日运势，一声不吭",
      "开始紧张是不是该我接着发，压力瞬间上头",
    ],
  },
  {
    scenario: "对话聊死了",
    family: "线上社交",
    signal: "社交润滑/关系敏感度",
    question: "聊天快聊死了，对方只回了一个「嗯」。你会：",
    options: [
      "甩一个表情包救场，表情包是社交润滑剂",
      "就此打住，尬聊不如不聊",
      "内心开始复盘是不是自己哪句说错了",
      "直接问「你是不是不开心」，摊开来讲",
    ],
  },
  {
    scenario: "好评返现3块",
    family: "线上社交",
    signal: "原则感/微利益权衡",
    question: "商品用着一般，客服追着你要好评返现3块。你会：",
    options: [
      "复制一段夸夸模板发过去，3块也是钱",
      "不理，评价是我最后的倔强",
      "写个中评，委婉但诚实",
      "被烦到直接差评，压迫感换差评",
    ],
  },
  {
    scenario: "群接龙",
    family: "线上社交",
    signal: "群体从众/拒绝能力",
    question: "群里发起聚餐接龙，已经15个人接了，你不太想去。你会：",
    options: [
      "装没看见，接龙里永远没有我",
      "纠结到最后一刻，被@了才表态",
      "接了，大家都接不好意思不接",
      "直接回「我就不去了哈」，干脆利落",
    ],
  },
  {
    scenario: "合照闭眼张嘴",
    family: "线上社交",
    signal: "形象焦虑/幽默防御",
    question: "朋友把合照发到群里，你在里面闭眼张嘴。你会：",
    options: [
      "秒发「删了重发」，配一个刀的表情包",
      "抢先自嘲「这是我？」，主动权就是安全感",
      "默默保存，报复的机会总会来的",
      "无所谓，反正没人盯着我看",
    ],
  },
  // ── 关系边界 ──────────────────────────────────────────────
  {
    scenario: "朋友借钱",
    family: "关系边界",
    signal: "边界感/宜人性",
    question: "不算太熟的朋友开口借两千块，你会：",
    options: [
      "借，但心里默默把这钱当送出去了",
      "直接说手头紧，拒绝得毫无心理负担",
      "问清楚用途和还款时间，像个信贷经理",
      "借一半，既表了心意又留了底线",
    ],
  },
  {
    scenario: "好友吐槽对象",
    family: "关系边界",
    signal: "共情方式/支持风格",
    question: "好友深夜找你哭诉感情问题，你的支持方式是：",
    options: [
      "先骂对方一小时，情绪价值拉满",
      "冷静分析利弊，附赠行动建议清单",
      "不说话，就听着，偶尔递一句「我在」",
      "讲一个自己更惨的故事，用对比疗法止痛",
    ],
  },
  {
    scenario: "爸妈电话三连",
    family: "关系边界",
    signal: "家庭关系/情绪劳动",
    question: "爸妈打来电话，聊了三分钟开始进入正题（工作/对象/存款三连问），你会：",
    options: [
      "熟练切换汇报模式，报喜不报忧，一切尽在掌握",
      "开始烦躁但忍住，嗯嗯啊啊快进到再见",
      "直接开怼「又来了」，怼完又有点后悔",
      "顺势诉苦一波，把压力反向输出回去",
    ],
  },
  {
    scenario: "纪念日被忘",
    family: "关系边界",
    signal: "委屈处理/记仇模式",
    question: "重要的人忘了你的生日/纪念日，你会：",
    options: [
      "不说，但这件事从此有了编号，随时可以调取",
      "当场发作，情绪价值必须当天结清",
      "自嘲一句「没事我自己过得挺好」，心里五味杂陈",
      "真的无所谓，日子是过给自己的",
    ],
  },
  {
    scenario: "十年未见的请帖",
    family: "关系边界",
    signal: "人情账本/社交义务",
    question: "十年没联系的老同学突然发来婚礼请帖。你会：",
    options: [
      "礼到人不到，成年人的体面",
      "装死不回，查无此人",
      "真去，顺便当一场同学会打卡",
      "纠结三天，最后去问共同好友「你去吗」",
    ],
  },
  {
    scenario: "室友不倒垃圾",
    family: "关系边界",
    signal: "共处冲突/表达方式",
    question: "室友又没倒垃圾，这是本周第三次。你会：",
    options: [
      "直接说，规则就是规则",
      "自己倒了，但敲键盘的声音变大了",
      "发一条不点名的朋友圈内涵一下",
      "在群里发「垃圾值日表」，制度解决一切",
    ],
  },
  {
    scenario: "前任的深夜问候",
    family: "关系边界",
    signal: "旧关系处理/情绪防御",
    question: "前任深夜发来一句「最近好吗」。你会：",
    options: [
      "已读不回，让沉默替我发言",
      "礼貌回「挺好的你呢」，滴水不漏",
      "截图发给闺蜜/兄弟，召开紧急分析会",
      "心跳漏一拍，然后把手机扣在桌上",
    ],
  },
  {
    scenario: "第三次被放鸽子",
    family: "关系边界",
    signal: "容忍阈值/关系降级",
    question: "朋友第三次临时放你鸽子。你会：",
    options: [
      "笑着说没事，心里默默给友情降了一级",
      "半开玩笑说「再鸽我们就绝交」，玩笑里带真话",
      "下次组局自动跳过TA，用行动投票",
      "无所谓，一个人吃火锅也挺好",
    ],
  },
  // ── 独处情绪 ──────────────────────────────────────────────
  {
    scenario: "深夜emo",
    family: "独处情绪",
    signal: "情绪调节/阴影面",
    question: "凌晨一点睡不着，情绪突然涌上来，你会：",
    options: [
      "打开备忘录写小作文，写完就删",
      "找歌单里最丧的歌循环，主动emo到底",
      "爬起来干点具体的事，把情绪饿死",
      "翻通讯录想找人说话，翻到最后谁也没找",
    ],
  },
  {
    scenario: "完全自由的周末",
    family: "独处情绪",
    signal: "能量取向",
    question: "一个没有任何安排的周末，你的理想过法：",
    options: [
      "关机躺平，人类勿近，充电中",
      "约满两天的局，独处才是消耗",
      "上午出门假装精致，下午回家瘫成液体",
      "临时起意去一个没去过的地方，一个人也行",
    ],
  },
  {
    scenario: "体检报告出了",
    family: "独处情绪",
    signal: "健康焦虑/回避应对",
    question: "体检App提示「您有3项指标异常」，你会：",
    options: [
      "秒点开逐项搜索，半小时后确诊自己「还能抢救」",
      "不点，放着，不看就是没病",
      "转发给学医的朋友，把焦虑外包出去",
      "看完默默下单维生素和早睡闹钟，坚持了三天",
    ],
  },
  {
    scenario: "收藏夹吃灰",
    family: "独处情绪",
    signal: "自我期待/行动力",
    question: "深夜刷到「十天学会剪视频」教程，你会：",
    options: [
      "收藏，和收藏夹里另外两百个教程作伴",
      "当场跟练到凌晨三点，三分钟热度但热度惊人",
      "转发给朋友说「我们一起学」，绑架式自律",
      "划走——我很清楚自己不会学的，省得骗自己",
    ],
  },
  {
    scenario: "6:30的闹钟",
    family: "独处情绪",
    signal: "自律幻想/自我谈判",
    question: "闹钟响了，你昨晚定的是 6:30 起床跑步。你会：",
    options: [
      "关掉，再睡九十分钟，梦里跑完了",
      "真起，用起床气换多巴胺",
      "躺着刷手机到 7:50，用「我醒着」安慰自己",
      "把闹钟改到明天，永远有明天",
    ],
  },
  {
    scenario: "一个人吃饭",
    family: "独处情绪",
    signal: "独处自洽/他者意识",
    question: "一个人在外面吃饭，你的状态是：",
    options: [
      "戴上耳机刷剧，自成结界",
      "观察周围的人，脑内给每桌编故事",
      "点完就低头玩手机，吃完就走，效率至上",
      "有点不自在，总觉得别人在看我",
    ],
  },
  {
    scenario: "三年前的自拍",
    family: "独处情绪",
    signal: "自我连续性/怀旧模式",
    question: "翻相册翻到三年前的自拍，你的第一反应：",
    options: [
      "当年真好看，时间是把杀猪刀",
      "当年真丑，幸好我进化了",
      "顺势开始翻聊天记录考古，一坐一晚上",
      "面无表情关掉，过去的就让它过去",
    ],
  },
  {
    scenario: "生日这天",
    family: "独处情绪",
    signal: "被爱期待/自我关怀",
    question: "自己生日这天，你倾向于：",
    options: [
      "提前一周预告，生日必须有排面",
      "谁记得就跟谁过，不主动不强求",
      "关掉生日提醒，把它过成普通一天",
      "给自己买个大的，自己爱自己",
    ],
  },
  // ── 消费欲望 ──────────────────────────────────────────────
  {
    scenario: "天降五百万",
    family: "消费欲望",
    signal: "欲望结构/价值取向",
    question: "如果明天到账五百万，你的第一个动作是：",
    options: [
      "先存起来，生活照旧，谁也不告诉",
      "当天辞职，机票买最近的一班",
      "列一张报恩清单，把欠的人情都还了",
      "研究怎么让它变成一千万",
    ],
  },
  {
    scenario: "退货运费8块",
    family: "消费欲望",
    signal: "沉没成本/决策风格",
    question: "买的东西到手不喜欢，但退货要自己出8块运费，你会：",
    options: [
      "退！8块买不来我的委屈",
      "算了留着吧——然后它在角落躺了一年",
      "挂闲鱼「全新仅拆封」，最后邮费亏得更多",
      "开始反思自己的消费观，反思完继续下单",
    ],
  },
  {
    scenario: "直播间最后三单",
    family: "消费欲望",
    signal: "冲动消费/怀疑倾向",
    question: "刷到直播间在倒数「最后三单」，你的手：",
    options: [
      "已经拍下了，手比脑子快",
      "冷笑一声「套路而已」，划走",
      "先加购物车冷静24小时，通常就忘了",
      "去评论区和搜索「XX 智商税」做尽调",
    ],
  },
  {
    scenario: "奶茶自由保卫战",
    family: "消费欲望",
    signal: "即时满足/自我合理化",
    question: "刚立完「这个月不喝奶茶」的flag，第三天路过奶茶店，你会：",
    options: [
      "走进去——快乐是刚需，flag是装饰",
      "拍张照发朋友圈「忍住了」，用公开表扬续命",
      "绕路走，眼不见为净，意志力靠物理隔离",
      "买了，但选三分糖，算各退一步",
    ],
  },
  {
    scenario: "差12块满减",
    family: "消费欲望",
    signal: "损失厌恶/凑单心理",
    question: "购物车差 12 块到「满300减50」，你会：",
    options: [
      "再逛半小时，凑一件「反正用得上」的",
      "直接下单，我的时间比 12 块贵",
      "呼叫朋友拼单，人脉就是省钱",
      "冷静下来发现根本不需要，整单放弃",
    ],
  },
  {
    scenario: "偷偷自动续费",
    family: "消费欲望",
    signal: "权利意识/维权成本",
    question: "发现某 App 悄悄自动续费了三个月。你会：",
    options: [
      "当场取消+投诉+退款三连，一分都不能少",
      "算了，反正也在用",
      "取消之后发个避雷帖，造福人类",
      "顺势研究出一套「开会员最优解」攻略",
    ],
  },
  {
    scenario: "旅行最后一天",
    family: "消费欲望",
    signal: "纪念方式/体验vs占有",
    question: "旅行最后一天，你的行李箱状态：",
    options: [
      "塞满冰箱贴和钥匙扣，快乐要有实体",
      "只买了特产给别人，自己啥也没买",
      "空的，照片就是最好的纪念品",
      "多了一个当地看着很美、回家就闲置的东西",
    ],
  },
  {
    scenario: "干饭决策瘫痪",
    family: "消费欲望",
    signal: "决策疲劳/算法依赖",
    question: "到饭点了，打开外卖App，你会：",
    options: [
      "三平台比价领券，算出今日最优解",
      "饿了就点，哪个顺手点哪个",
      "翻了半小时不知道吃啥，最后点了老三样",
      "跟着短视频种草下单，吃什么算法说了算",
    ],
  },
  // ── 失控意外 ──────────────────────────────────────────────
  {
    scenario: "被阴阳怪气",
    family: "失控意外",
    signal: "冲突反应",
    question: "有人阴阳怪气地内涵你，你通常会：",
    options: [
      "假装没听懂，礼貌微笑，内心已经拉黑",
      "当场怼回去，绝不吃这个亏",
      "回家越想越气，写一整篇小作文但没有发出去",
      "转头就忘，过会儿该笑笑该吃吃",
    ],
  },
  {
    scenario: "计划突然取消",
    family: "失控意外",
    signal: "控制感/开放性",
    question: "期待了一周的约被临时取消，你的第一反应：",
    options: [
      "松了口气——终于可以名正言顺躺着了",
      "失落半小时，然后立刻给自己安排新节目",
      "嘴上说没事，实际一晚上都在轻微记仇",
      "顺势把这天过成计划外的冒险，随便上一辆公交",
    ],
  },
  {
    scenario: "意外被夸",
    family: "失控意外",
    signal: "自尊/接纳赞美",
    question: "有人当众认真地夸你，你会：",
    options: [
      "立刻自贬两句把话题岔开，脚趾抠地",
      "表面淡定说谢谢，回家反复回放二十遍",
      "大方收下并顺势发挥，我值得",
      "怀疑TA是不是有事要求我",
    ],
  },
  {
    scenario: "手机忘在家",
    family: "失控意外",
    signal: "失控耐受/数字依赖",
    question: "出门半小时发现手机忘家里了，今天还有一整天安排，你会：",
    options: [
      "折返，迟到也要回去拿——没手机等于裸奔",
      "算了，体验一天数字排毒，甚至有点兴奋",
      "全程坐立难安，总觉得全世界都在找我",
      "借同事手机给自己的微信发一句「我没事」",
    ],
  },
  {
    scenario: "地铁坐过站",
    family: "失控意外",
    signal: "错误归因/情绪转化",
    question: "地铁上刷手机，一抬头坐过了三站。你会：",
    options: [
      "「今天重开吧」，烦躁值直接拉满",
      "下车反向坐回来，顺便发个朋友圈自嘲",
      "将错就错，在陌生的站下车逛逛",
      "开始复盘自己为什么走神，上升到人生管理",
    ],
  },
  {
    scenario: "暴雨没带伞",
    family: "失控意外",
    signal: "问题解决风格",
    question: "下班时突降暴雨，你没带伞，门口挤满等雨停的人。你会：",
    options: [
      "冲了，淋雨也是一种自由",
      "等，顺便观察谁会第一个冲出去",
      "点个跑腿送伞，花钱解决一切",
      "打电话给朋友求救，顺便聊到雨停",
    ],
  },
  {
    scenario: "KTV话筒到手",
    family: "失控意外",
    signal: "暴露焦虑/表现策略",
    question: "KTV里话筒突然递到你手上，全场看着你。你会：",
    options: [
      "直接开唱，气氛我来扛",
      "疯狂摆手推给别人，打死不唱",
      "唱，但只唱能藏进大合唱的那种",
      "点一首搞怪说唱，用整活代替实力",
    ],
  },
  {
    scenario: "陌生来电",
    family: "失控意外",
    signal: "不确定性应对",
    question: "一个陌生号码打来电话，你会：",
    options: [
      "直接接，是福不是祸",
      "等它响完，回头搜一下号码归属",
      "秒挂，有事发短信",
      "盯着屏幕纠结到它自己停",
    ],
  },
];

/** 每次拆盒实际抽取的题数——节奏优先，池子负责多样性。 */
const SCENARIO_SAMPLE_COUNT = 3;

/**
 * 跨域分层抽样：随机选 n 个不同生活域，每域随机抽 1 道。
 * 保证三道题信号不同域、组合数量级远超单纯抽 3（6域×4题 → 数百种组合）。
 */
function sampleScenarios(n: number = SCENARIO_SAMPLE_COUNT): ScenarioQuestion[] {
  const byFamily = new Map<ScenarioFamily, ScenarioQuestion[]>();
  for (const q of SCENARIO_POOL) {
    const list = byFamily.get(q.family) ?? [];
    list.push(q);
    byFamily.set(q.family, list);
  }
  const families = [...byFamily.keys()];
  for (let i = families.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [families[i], families[j]] = [families[j]!, families[i]!];
  }
  return families.slice(0, n).map((fam) => {
    const list = byFamily.get(fam)!;
    return list[Math.floor(Math.random() * list.length)]!;
  });
}

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

/**
 * SBTI (Silly Big Type Indicator) — the 2026 viral joke personality test by
 * B站@蛆肉儿串儿. 25 standard + 2 special outcomes (HHHH 兜底 / DRUNK 隐藏).
 * Type list verified against the original open-source data
 * (github.com/pingfanfan/SBTI data/types.json); card artwork from the
 * community wiki (github.com/serenakeyitan/sbti-wiki), mirrored into
 * public/sbti/. Codes follow the wiki's canonical spellings (OJBK/WOC!/FUCK).
 */
const SBTI_TYPES: Array<{ code: string; cn: string; img: string }> = [
  { code: "CTRL", cn: "拿捏者", img: "CTRL.png" },
  { code: "ATM-er", cn: "送钱者", img: "ATM-er.png" },
  { code: "Dior-s", cn: "屌丝", img: "Dior-s.jpg" },
  { code: "BOSS", cn: "领导者", img: "BOSS.png" },
  { code: "THAN-K", cn: "感恩者", img: "THAN-K.png" },
  { code: "OH-NO", cn: "哦不人", img: "OH-NO.png" },
  { code: "GOGO", cn: "行者", img: "GOGO.png" },
  { code: "SEXY", cn: "尤物", img: "SEXY.png" },
  { code: "LOVE-R", cn: "多情者", img: "LOVE-R.png" },
  { code: "MUM", cn: "妈妈", img: "MUM.png" },
  { code: "FAKE", cn: "伪人", img: "FAKE.png" },
  { code: "OJBK", cn: "无所谓人", img: "OJBK.png" },
  { code: "MALO", cn: "吗喽", img: "MALO.png" },
  { code: "JOKE-R", cn: "小丑", img: "JOKE-R.jpg" },
  { code: "WOC!", cn: "握草人", img: "WOC.png" },
  { code: "THIN-K", cn: "思考者", img: "THIN-K.png" },
  { code: "SHIT", cn: "愤世者", img: "SHIT.png" },
  { code: "ZZZZ", cn: "装死者", img: "ZZZZ.png" },
  { code: "POOR", cn: "贫困者", img: "POOR.png" },
  { code: "MONK", cn: "僧人", img: "MONK.png" },
  { code: "IMSB", cn: "傻者", img: "IMSB.png" },
  { code: "SOLO", cn: "孤儿", img: "SOLO.png" },
  { code: "FUCK", cn: "草者", img: "FUCK.png" },
  { code: "DEAD", cn: "死者", img: "DEAD.png" },
  { code: "IMFW", cn: "废物", img: "IMFW.png" },
  { code: "HHHH", cn: "傻乐者", img: "HHHH.png" },
  { code: "DRUNK", cn: "酒鬼", img: "DRUNK.png" },
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
const JOURNEY_LENGTH = 2 + SCENARIO_SAMPLE_COUNT;
/** journeyIndex of the first scenario question. */
const SCENARIO_BASE = 2;

/** Merge moods (screen 0) + profile priors (screen 1) + scenario answers into one paragraph. */
function composeJourneyPrompt(
  moods: string[],
  profile: ProfileInfo,
  questions: ScenarioQuestion[],
  answers: string[],
): string {
  const moodPart = moods.length > 0 ? `TA现在的状态是：${moods.join("、")}。` : "";
  const profilePart = composeProfileClause(profile);
  const scenarioParts = questions
    .map((q, i) => (answers[i] ? `${q.scenario}——${answers[i]}` : null))
    .filter((p): p is string => Boolean(p));
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
  // Per-run random sample from the pool — re-rolled on reset so "再抽一次"
  // serves fresh questions.
  const [scenarioQuestions, setScenarioQuestions] = useState<ScenarioQuestion[]>(() => sampleScenarios());
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
    setScenarioQuestions(sampleScenarios()); // fresh questions for the re-pull
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
    if (qIdx >= scenarioQuestions.length - 1) {
      void openBlindBox(composeJourneyPrompt(selectedTags, profile, scenarioQuestions, next));
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
      <ArxivStamp />
      <RunningHeader />
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
            scenarioQuestions={scenarioQuestions}
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
  scenarioQuestions: ScenarioQuestion[];
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
              question={props.scenarioQuestions[props.journeyIndex - SCENARIO_BASE]}
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
        <span className="paper-figure-caption" style={{ textAlign: "left" }}>
          图 0：刺激材料（16Personalities 卡通头像，仅作审美外壳——本文对 MBTI 的立场见摘要）。
        </span>
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
        <span className="paper-profile-label">
          SBTI <span className="paper-question-hint">（测过的话，点你的型）</span>
        </span>
        {/* Card artwork: sbti-wiki (see SBTI_TYPES). Same visual-picker pattern as MBTI above. */}
        <div className="paper-mbti-grid">
          {SBTI_TYPES.map((t) => {
            const value = `${t.code} ${t.cn}`;
            const active = profile.sbti === value;
            return (
              <button
                key={t.code}
                type="button"
                onClick={() => props.onChange({ ...profile, sbti: active ? "" : value })}
                className={`paper-mbti-card ${active ? "paper-mbti-card--active" : ""}`}
              >
                <img
                  src={`/sbti/${t.img}`}
                  alt=""
                  aria-hidden
                  loading="lazy"
                  className="paper-mbti-card-icon"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
                <span className="paper-mbti-card-letter">{t.code}</span>
                <span className="paper-mbti-card-label">{t.cn}</span>
              </button>
            );
          })}
        </div>
        <span className="paper-figure-caption" style={{ textAlign: "left" }}>
          图 0′：补充刺激材料（SBTI）。编号带撇是因为它和图 0 地位相同，且同样不算数。
        </span>
        <input
          type="text"
          className="paper-profile-input"
          value={SBTI_TYPES.some((t) => `${t.code} ${t.cn}` === profile.sbti) ? "" : profile.sbti}
          onChange={(e) => props.onChange({ ...profile, sbti: e.target.value })}
          placeholder="没有你的型？自己填"
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
  const [customOpen, setCustomOpen] = useState(false);
  const [customText, setCustomText] = useState("");

  // Reset the tap-feedback highlight + custom input when the question changes.
  useEffect(() => {
    setChosen(null);
    setCustomOpen(false);
    setCustomText("");
  }, [props.index]);

  const q = props.question;
  if (!q) return null;

  function pick(opt: string) {
    if (chosen) return; // ignore double-taps while the feedback flash plays
    setChosen(opt);
    window.setTimeout(() => props.onAnswer(opt), 180);
  }

  function submitCustom() {
    const text = customText.trim();
    if (!text || chosen) return;
    pick(text);
  }

  return (
    <div className="flex w-full flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <span className="paper-question-hint">情境题 · {q.scenario}</span>
        <h3 className="paper-question">{q.question}</h3>
        <span className="paper-question-hint">点一个最像你的选项，自动进入下一题；都不像就自己写</span>
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

        {/* Custom answer — same option affordance, letter "自". */}
        {customOpen ? (
          <div className={`paper-option ${chosen && chosen === customText.trim() ? "paper-option--chosen" : ""}`}>
            <span className="paper-option-letter">自</span>
            <input
              autoFocus
              type="text"
              value={customText}
              maxLength={40}
              placeholder="用你自己的话说，这种时候你会……"
              onChange={(e) => setCustomText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitCustom();
                if (e.key === "Escape") setCustomOpen(false);
              }}
              className="paper-option-text bg-transparent outline-none placeholder:text-surface-50"
            />
            <button
              type="button"
              onClick={submitCustom}
              disabled={!customText.trim()}
              className="paper-option-arrow !opacity-100 disabled:!opacity-30"
              aria-label="提交自定义答案"
            >
              →
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setCustomOpen(true)} className="paper-option">
            <span className="paper-option-letter">自</span>
            <span className="paper-option-text paper-muted">以上都不像我——自己写一个</span>
          </button>
        )}
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
      {/* "代码即正文" —— 诊断过程以一行终端命令的姿态出现在论文正文里。 */}
      <p className="paper-doi paper-meta">$ qwen3.7-plus --thinking --layers=6 --sample=你</p>
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
      <p className="paper-meta inline-flex items-center gap-1.5">
        由
        {/* Qwen mark (transparent SVG) from lobehub/lobe-icons (packages/static-svg). */}
        <img
          src="/brand/qwen-color.svg"
          alt="通义千问"
          loading="lazy"
          className="inline-block h-3.5 w-auto align-middle"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
        通义千问 × 万相 显影
      </p>
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

      <BibTexBlock persona={props.persona} />
    </div>
  );
}

/**
 * "如需引用本尊" — 一键复制的 BibTeX，title 动态填抽到的人格。
 * 黑底代码块是本页唯一的深色面（DESIGN.md 的 nested-panel #191919），
 * 呼应 banner 那句"代码即正文"；复制到社交平台的效果是"我被引用了"。
 */
function BibTexBlock(props: { persona: Persona }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const citeKey = `blindbox2026${props.persona.code.replace(/[^a-zA-Z0-9]/g, "").toLowerCase()}`;
  const bib = `@article{${citeKey},
  title   = {人格盲盒：${props.persona.name}},
  author  = {你 and 通义千问},
  journal = {Journal of Vibe Coding},
  volume  = {1},
  number  = {1},
  pages   = {1--∞},
  year    = {2026},
  doi     = {10.518x/blindbox.2026.001},
  note    = {样本量 n=1，重测信度未知，且不打算知道}
}`;

  function copyBib() {
    navigator.clipboard
      .writeText(bib)
      .then(() => {
        setCopied(true);
        if (timerRef.current) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <span className="paper-meta">如需引用本尊，请使用以下 BibTeX：</span>
      <pre className="paper-bibtex">
        <button
          type="button"
          className={`paper-bibtex-copy ${copied ? "paper-bibtex-copy--done" : ""}`}
          onClick={copyBib}
        >
          {copied ? "已复制 ✓" : "复制"}
        </button>
        {bib.split("\n").map((line, i) =>
          line.includes("title") ? (
            <span key={i} className="paper-bibtex-title">
              {line}
              {"\n"}
            </span>
          ) : (
            `${line}\n`
          ),
        )}
      </pre>
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
      <span className="paper-eyebrow">{`{ 附录 A · 口头质询 }`}</span>

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
            <>
              <div className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-lg bg-surface-25/20 p-3 text-left">
                {voice.transcript.map((line, i) => (
                  <Text key={i} type="supporting">
                    {line}
                  </Text>
                ))}
              </div>
              <span className="paper-figure-caption" style={{ textAlign: "left" }}>
                附录 A：质询逐字稿（实时转写，未经润色，被试的每一句口误都保留）。
              </span>
            </>
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
        <figure className="flex w-full flex-col gap-2">
          <FigurineViewer glbUrl={tripo.glbUrl} className="h-80 w-full rounded-lg" />
          <figcaption className="paper-figure-caption">
            图 2：被试实物化结果（Tripo 生成，可拖拽旋转——请轻拿轻放）。
          </figcaption>
        </figure>
      ) : null}
    </div>
  );
}
