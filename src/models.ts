export type CourseStatus = 'draft' | 'review' | 'changes' | 'frozen';
export type Difficulty = '入门' | '进阶' | '挑战';
export type CameraAngle = '正面' | '左侧 45°' | '右侧 45°' | '俯拍手部' | '全身远景';
export type CaptionPosition = '下方安全区' | '上移 15%' | '角标提示' | '画面中央';
export type GestureZone = '左侧' | '中央' | '右侧';

/** 字幕语言：课堂主语言为简体中文，译文服务听人助教与家长 */
export type SubtitleLanguage = '简体中文' | '繁體中文' | 'English' | '日本語';
/** 字幕用途：说明该条字幕面向课堂、助教、家长还是角标提示 */
export type SubtitlePurpose = '课堂讲解' | '听人助教辅助' | '家长协同' | '角标提示';

export interface SubtitleTrack {
  text: string;
  language: SubtitleLanguage;
  /** 该条字幕在步骤中的显示时长（秒），不应超过步骤总时长 */
  displayDuration: number;
  purpose: SubtitlePurpose;
}

export interface CaptionPair {
  primary: SubtitleTrack;
  translation: SubtitleTrack;
  /** 译文是否已对照当前主字幕确认；主字幕文本一旦改动，译文保留但标记为待重新确认 */
  translationConfirmed: boolean;
}

export interface LessonStep {
  id: string;
  title: string;
  kind: '示范' | '讲解' | '练习';
  duration: number;
  demoTitle: string;
  demoUrl: string;
  handshape: string;
  gestureZone: GestureZone;
  /** 双语字幕：主字幕 + 译文（由旧版 caption 字段迁移） */
  captions: CaptionPair;
  captionPosition: CaptionPosition;
  camera: CameraAngle;
  commonMistakes: string[];
  exercise: string;
  exerciseFeedback: string;
  altText: string;
  prerequisiteId: string;
  difficulty: Difficulty;
  cuePoints: number[];
}

export interface CourseModule {
  id: string;
  title: string;
  summary: string;
  color: string;
  steps: LessonStep[];
}

export interface FrozenVersion {
  id: string;
  label: string;
  createdAt: string;
  snapshot: Omit<CourseProject, 'frozenVersions'>;
}

export interface CourseProject {
  id: string;
  title: string;
  teacher: string;
  audience: string;
  status: CourseStatus;
  selectedModuleId: string;
  selectedStepId: string;
  modules: CourseModule[];
  frozenVersions: FrozenVersion[];
  lastSavedAt: string;
  revision: number;
}

export interface ValidationCheck {
  id: string;
  severity: 'error' | 'warning' | 'info';
  title: string;
  detail: string;
  /** 检查所属区域，预览面板只呈现字幕类检查 */
  area?: 'caption' | 'general';
  stepId?: string;
  moduleId?: string;
}

export const STORAGE_KEY = 'sologsb-1012-sign-course-project-v1';

export const SUBTITLE_LANGUAGES: SubtitleLanguage[] = ['简体中文', '繁體中文', 'English', '日本語'];
export const CAPTION_PURPOSES: SubtitlePurpose[] = ['课堂讲解', '听人助教辅助', '家长协同', '角标提示'];
/** 单行字幕的最大显示宽度：CJK 全角字符记 1，半角字符记 0.55 */
export const CAPTION_LINE_WIDTH_LIMIT = 20;

export function createCaptionPair(
  primaryText = '',
  translationText = '',
  translationLanguage: SubtitleLanguage = 'English',
  stepDuration = 45,
): CaptionPair {
  return {
    primary: { text: primaryText, language: '简体中文', displayDuration: stepDuration, purpose: '课堂讲解' },
    translation: { text: translationText, language: translationLanguage, displayDuration: Math.min(stepDuration, 40), purpose: '听人助教辅助' },
    translationConfirmed: false,
  };
}

function isWideCharacter(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return (
    (code >= 0x2e80 && code <= 0x9fff) ||   // CJK 部首与统一表意文字
    (code >= 0x3000 && code <= 0x303f) ||   // CJK 标点
    (code >= 0x3040 && code <= 0x30ff) ||   // 平假名、片假名
    (code >= 0xac00 && code <= 0xd7a3) ||   // 韩文音节
    (code >= 0xf900 && code <= 0xfaff) ||   // CJK 兼容表意文字
    (code >= 0xff00 && code <= 0xffef)      // 全角字符
  );
}

/** 估算字幕行的显示宽度（空白不计） */
export function lineDisplayWidth(line: string): number {
  let width = 0;
  for (const char of line) {
    if (/\s/.test(char)) continue;
    width += isWideCharacter(char) ? 1 : 0.55;
  }
  return Math.round(width * 10) / 10;
}

/** 返回多行字幕中最长的一行及其宽度 */
export function longestCaptionLine(text: string): { line: string; width: number } | undefined {
  const lines = text.split('\n').filter((line) => line.trim());
  if (!lines.length) return undefined;
  return lines
    .map((line) => ({ line, width: lineDisplayWidth(line) }))
    .reduce((longest, current) => (current.width > longest.width ? current : longest));
}

export type CaptionTranslationState = 'complete' | 'stale' | 'missing';

/** 译文状态：完整已确认 / 已保留但待重新确认 / 缺失 */
export function captionTranslationState(captions: CaptionPair): CaptionTranslationState {
  if (!captions.translation.text.trim()) return 'missing';
  return captions.translationConfirmed ? 'complete' : 'stale';
}

export function createDemoProject(): CourseProject {
  const modules: CourseModule[] = [
    {
      id: 'module-1',
      title: '模块一 · 日常问候',
      summary: '建立手形、视线和面部表情之间的配合，完成三个基础问候。',
      color: '#15827a',
      steps: [
        {
          id: 'step-1-1',
          title: '观察“你好”的完整动作',
          kind: '示范',
          duration: 35,
          demoTitle: '你好 · 正面慢速示范',
          demoUrl: '',
          handshape: '右手掌张开，拇指向上，自额头向外送出',
          gestureZone: '右侧',
          captions: {
            primary: { text: '你好：手掌从额前向前送出，同时保持微笑。', language: '简体中文', displayDuration: 35, purpose: '课堂讲解' },
            translation: { text: 'Hello: sweep your open palm\nforward from your forehead, and smile.', language: 'English', displayDuration: 30, purpose: '听人助教辅助' },
            translationConfirmed: true,
          },
          captionPosition: '下方安全区',
          camera: '正面',
          commonMistakes: ['手掌过于僵硬', '没有视线交流'],
          exercise: '跟随示范完成两次，每次保持两秒。',
          exerciseFeedback: '镜面检查手掌高度是否与眉线一致。',
          altText: '教师面向镜头，用右手掌从额头向前送出，并点头微笑。',
          prerequisiteId: '',
          difficulty: '入门',
          cuePoints: [4, 16, 28],
        },
        {
          id: 'step-1-2',
          title: '拆解“你好”的手形',
          kind: '讲解',
          duration: 50,
          demoTitle: '你好 · 手部近景',
          demoUrl: '',
          handshape: '四指并拢，拇指张开；掌心朝左前侧',
          gestureZone: '中央',
          captions: {
            primary: { text: '注意四指并拢，动作沿身体中轴向前。', language: '简体中文', displayDuration: 48, purpose: '课堂讲解' },
            translation: { text: 'Keep your four fingers together.\nMove straight along the center.', language: 'English', displayDuration: 48, purpose: '家长协同' },
            translationConfirmed: true,
          },
          captionPosition: '画面中央',
          camera: '俯拍手部',
          commonMistakes: ['拇指贴住掌心', '动作方向偏向一侧'],
          exercise: '固定肩部，只移动前臂完成五次。',
          exerciseFeedback: '如果动作跑偏，先在镜前标记起点和终点。',
          altText: '手部近景展示四指并拢、拇指张开的起始手形。',
          prerequisiteId: 'step-1-1',
          difficulty: '入门',
          cuePoints: [6, 24, 42],
        },
        {
          id: 'step-1-3',
          title: '双人问候练习',
          kind: '练习',
          duration: 75,
          demoTitle: '你好 · 双人轮流练习',
          demoUrl: '',
          handshape: '保持标准手形，配合点头与视线交换',
          gestureZone: '中央',
          // 主字幕刚调整过：译文仍保留但待重新确认，且译文行太长、显示时长超出步骤
          captions: {
            primary: { text: '轮流问候，结束后停一拍，再交换角色。', language: '简体中文', displayDuration: 75, purpose: '课堂讲解' },
            translation: { text: 'Take turns greeting your partner, pause for a full beat after every sign, and then switch roles.', language: 'English', displayDuration: 90, purpose: '听人助教辅助' },
            translationConfirmed: false,
          },
          captionPosition: '上移 15%',
          camera: '全身远景',
          commonMistakes: ['动作过早结束', '两人视线没有相遇'],
          exercise: '两人一组轮流完成问候，交换三次。',
          exerciseFeedback: '同伴负责确认视线和动作停顿。',
          altText: '两名学习者相对站立，交替做出问候动作并看向对方。',
          prerequisiteId: 'step-1-2',
          difficulty: '进阶',
          cuePoints: [10, 34, 57],
        },
      ],
    },
    {
      id: 'module-2',
      title: '模块二 · 数量表达',
      summary: '用数字、空间位置和顺序词完成价格询问。',
      color: '#8a3ffc',
      steps: [
        {
          id: 'step-2-1',
          title: '数字一到五的稳定手形',
          kind: '讲解',
          duration: 60,
          demoTitle: '数字 1—5 · 镜面视图',
          demoUrl: '',
          handshape: '食指到五指依次展开，手心朝前',
          gestureZone: '中央',
          captions: {
            primary: { text: '数字一到五：依次伸出手指，不移动手腕。', language: '简体中文', displayDuration: 60, purpose: '课堂讲解' },
            translation: { text: '', language: 'English', displayDuration: 40, purpose: '听人助教辅助' },
            translationConfirmed: false,
          },
          captionPosition: '下方安全区',
          camera: '正面',
          commonMistakes: ['拇指遮挡手指数', '手腕左右摆动'],
          exercise: '按随机口令连续展示 1—5。',
          exerciseFeedback: '每个数字保持一秒，同伴随机报数。',
          altText: '教师手心朝前，依次伸出食指到五指，展示数字一到五。',
          prerequisiteId: '',
          difficulty: '入门',
          cuePoints: [8, 26, 44],
        },
        {
          id: 'step-2-2',
          title: '组合成“多少钱”',
          kind: '示范',
          duration: 45,
          demoTitle: '多少钱 · 双手组合动作',
          demoUrl: '',
          handshape: '双手在胸前交替翻转，随后食指向前点出',
          gestureZone: '中央',
          captions: {
            primary: { text: '先做"钱"的交替手形，再用食指向前询问。', language: '简体中文', displayDuration: 45, purpose: '课堂讲解' },
            translation: { text: '', language: 'English', displayDuration: 40, purpose: '家长协同' },
            translationConfirmed: false,
          },
          captionPosition: '角标提示',
          camera: '右侧 45°',
          commonMistakes: ['两手动作不同步', '疑问表情缺失'],
          exercise: '配合疑问表情完成三次询问。',
          exerciseFeedback: '录下动作，检查双手是否在胸前同一高度。',
          altText: '教师双手机械交替翻转后，食指朝前点出并抬眉疑问。',
          prerequisiteId: 'step-2-1',
          difficulty: '进阶',
          cuePoints: [5, 22, 37],
        },
      ],
    },
  ];

  return {
    id: 'sign-course-project',
    title: '零基础手语 · 问候与数量',
    teacher: '陈老师 / 特殊教育中心',
    audience: '初次接触手语的初中学习者',
    status: 'draft',
    selectedModuleId: 'module-1',
    selectedStepId: 'step-1-2',
    modules,
    frozenVersions: [],
    lastSavedAt: new Date().toISOString(),
    revision: 1,
  };
}

/** 把旧版（或任意来源）步骤迁移为双语字幕结构，保留旧 caption 文本作为主字幕 */
function normalizeStep(raw: Record<string, unknown>): LessonStep {
  const {
    caption: _legacyCaption,
    ...rest
  } = raw as Record<string, unknown> & { caption?: string };
  const legacyCaption = typeof _legacyCaption === 'string' ? _legacyCaption : '';
  const rawPair = (raw as { captions?: unknown }).captions as Partial<CaptionPair> | undefined;
  const fallback = createCaptionPair(legacyCaption, '');
  const captions: CaptionPair = rawPair
    ? {
        primary: { ...fallback.primary, ...(rawPair.primary ?? {}) },
        translation: { ...fallback.translation, ...(rawPair.translation ?? {}) },
        translationConfirmed: Boolean(rawPair.translationConfirmed),
      }
    : fallback;
  return { ...(rest as Omit<LessonStep, 'captions' | 'caption'>), captions };
}

function normalizeModule(raw: Record<string, unknown>): CourseModule {
  const module = raw as unknown as CourseModule;
  return { ...module, steps: Array.isArray(module.steps) ? module.steps.map((step) => normalizeStep(step as unknown as Record<string, unknown>)) : [] };
}

/** 规范化本地草稿：迁移旧版单语字幕并补齐冻结快照，保证旧草稿也能继续编辑 */
export function normalizeProject(source: unknown): CourseProject {
  if (!source || typeof source !== 'object') return createDemoProject();
  const project = structuredClone(source) as CourseProject;
  if (!Array.isArray(project.modules)) project.modules = [];
  project.modules = project.modules.map((module) => normalizeModule(module as unknown as Record<string, unknown>));
  if (Array.isArray(project.frozenVersions)) {
    project.frozenVersions = project.frozenVersions.map((version) => ({
      ...version,
      snapshot: {
        ...version.snapshot,
        modules: Array.isArray(version.snapshot?.modules)
          ? version.snapshot.modules.map((module) => normalizeModule(module as unknown as Record<string, unknown>))
          : [],
      },
    }));
  } else {
    project.frozenVersions = [];
  }
  return project;
}

export function selectedModule(project: CourseProject): CourseModule {
  return project.modules.find((module) => module.id === project.selectedModuleId) ?? project.modules[0];
}

export function selectedStep(project: CourseProject): LessonStep | undefined {
  const module = selectedModule(project);
  return module?.steps.find((step) => step.id === project.selectedStepId) ?? module?.steps[0];
}

export function validateProject(project: CourseProject): ValidationCheck[] {
  const checks: ValidationCheck[] = [];
  if (!project.title.trim()) checks.push({ id: 'title', severity: 'error', title: '课程标题缺失', detail: '发布前需要为课程填写清晰标题。' });
  if (project.modules.length === 0) checks.push({ id: 'modules', severity: 'error', title: '没有课程模块', detail: '至少需要创建一个包含学习步骤的模块。' });

  project.modules.forEach((module) => {
    if (!module.steps.length) {
      checks.push({ id: `empty-${module.id}`, severity: 'error', title: `${module.title} 没有学习步骤`, detail: '空模块无法进入复核。', moduleId: module.id });
    }
    module.steps.forEach((step, index) => {
      if (!step.altText.trim()) {
        checks.push({ id: `alt-${step.id}`, severity: 'error', title: `${step.title} 缺少替代文本`, detail: '示范片段需要描述手形、移动和面部表情。', stepId: step.id, moduleId: module.id });
      }

      // ── 双语字幕检查 ─────────────────────────────────────────────
      const { primary, translation } = step.captions;
      if (!primary.text.trim()) {
        checks.push({ id: `caption-primary-${step.id}`, severity: 'warning', area: 'caption', title: `${step.title} 缺少主字幕`, detail: '听障学习者在静音预览时无法获得说明。', stepId: step.id, moduleId: module.id });
      }
      const translationState = captionTranslationState(step.captions);
      if (translationState === 'missing') {
        checks.push({ id: `caption-translation-missing-${step.id}`, severity: 'error', area: 'caption', title: `${step.title} 缺少译文`, detail: '听人助教和家长看不懂主字幕时无法跟进，请补充译文后再提交复核。', stepId: step.id, moduleId: module.id });
      } else if (translationState === 'stale') {
        checks.push({ id: `caption-translation-stale-${step.id}`, severity: 'error', area: 'caption', title: `${step.title} 的译文待重新确认`, detail: '主字幕调整后译文已保留，但需要对照新主字幕重新确认。', stepId: step.id, moduleId: module.id });
      }
      ([['主字幕', primary], ['译文', translation]] as Array<[string, SubtitleTrack]>).forEach(([label, track]) => {
        if (!track.text.trim()) return;
        const longest = longestCaptionLine(track.text);
        if (longest && longest.width > CAPTION_LINE_WIDTH_LIMIT) {
          checks.push({
            id: `caption-long-${label}-${step.id}`,
            severity: 'warning',
            area: 'caption',
            title: `${step.title} 的${label}行太长`,
            detail: `最长一行约 ${longest.width} 个全角字宽（上限 ${CAPTION_LINE_WIDTH_LIMIT}），手机端会折行或被裁切：“${longest.line.slice(0, 24)}${longest.line.length > 24 ? '…' : ''}”。`,
            stepId: step.id,
            moduleId: module.id,
          });
        }
        if (track.displayDuration > step.duration) {
          checks.push({
            id: `caption-duration-${label}-${step.id}`,
            severity: 'warning',
            area: 'caption',
            title: `${step.title} 的${label}显示时长超出步骤`,
            detail: `${label}显示 ${track.displayDuration} 秒，但步骤只有 ${step.duration} 秒，字幕无法完整展示。`,
            stepId: step.id,
            moduleId: module.id,
          });
        }
      });

      if (step.captionPosition === '画面中央' && (step.gestureZone === '中央' || step.camera === '俯拍手部')) {
        checks.push({ id: `overlap-${step.id}`, severity: 'error', area: 'caption', title: `${step.title} 字幕可能遮挡动作`, detail: `字幕位于${step.captionPosition}，而主要手形位于${step.gestureZone}。`, stepId: step.id, moduleId: module.id });
      }
      if (step.duration < 20) {
        checks.push({ id: `duration-${step.id}`, severity: 'warning', title: `${step.title} 时长过短`, detail: '示范与练习不足 20 秒，学习者来不及观察和跟做。', stepId: step.id, moduleId: module.id });
      }
      if (step.prerequisiteId) {
        const prerequisiteIndex = module.steps.findIndex((candidate) => candidate.id === step.prerequisiteId);
        if (prerequisiteIndex < 0) {
          checks.push({ id: `missing-pre-${step.id}`, severity: 'error', title: `${step.title} 的前置步骤不存在`, detail: '请重新选择前置条件或移除依赖。', stepId: step.id, moduleId: module.id });
        } else if (prerequisiteIndex >= index) {
          checks.push({ id: `jump-${step.id}`, severity: 'error', title: `${step.title} 出现步骤跳级`, detail: '前置步骤位于当前步骤之后，学习顺序无法成立。', stepId: step.id, moduleId: module.id });
        }
      }
      if (step.kind === '练习' && (!step.exercise.trim() || !step.exerciseFeedback.trim())) {
        checks.push({ id: `practice-${step.id}`, severity: 'warning', title: `${step.title} 的练习反馈不完整`, detail: '练习任务需要明确完成动作和即时反馈方式。', stepId: step.id, moduleId: module.id });
      }
      if (step.commonMistakes.filter(Boolean).length === 0) {
        checks.push({ id: `mistakes-${step.id}`, severity: 'info', title: `${step.title} 尚未记录常见错误`, detail: '补充常见错误有助于教师现场提示。', stepId: step.id, moduleId: module.id });
      }
    });
  });

  return checks;
}

export function cloneProject(project: CourseProject): CourseProject {
  return structuredClone(project);
}
