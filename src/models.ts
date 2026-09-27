export type CourseStatus = 'draft' | 'review' | 'changes' | 'frozen';
export type Difficulty = '入门' | '进阶' | '挑战';
export type CameraAngle = '正面' | '左侧 45°' | '右侧 45°' | '俯拍手部' | '全身远景';
export type CaptionPosition = '下方安全区' | '上移 15%' | '角标提示' | '画面中央';
export type GestureZone = '左侧' | '中央' | '右侧';

/** 字幕用途：区分课堂主讲、给听人助教的提示和给家长的陪伴说明。 */
export type CaptionPurpose = '课堂主讲' | '听人助教参考' | '家长陪伴说明';

/** 预览的字幕呈现方式。 */
export type CaptionMode = 'primary' | 'bilingual' | 'translation';

export const CAPTION_LANGUAGES = [
  '中文（简体）',
  '中文（繁体）',
  'English',
  '日本語',
  '한국어',
  'Français',
  'Español',
] as const;

export const CAPTION_PURPOSES: { value: CaptionPurpose; hint: string }[] = [
  { value: '课堂主讲', hint: '学习者在画面中看到的主讲字幕' },
  { value: '听人助教参考', hint: '供听人助教课堂配合时阅读' },
  { value: '家长陪伴说明', hint: '供家长课后陪伴练习时阅读' },
];

/** 一行字幕允许的最大显示宽度：一个中文/全角字符记 2，其余记 1（约合 23 个汉字）。 */
export const MAX_CAPTION_WIDTH = 46;

export interface CaptionTrack {
  /** 字幕文本，可含换行，按最长一行检查宽度。 */
  text: string;
  /** BCP-47 风格的语言标签，仅用于界面标识。 */
  language: string;
  /** 字幕用途。 */
  purpose: CaptionPurpose;
  /** 字幕显示时长（秒），超出步骤时长会在检查与预览中提示。 */
  durationSeconds: number;
  /** 译文是否已经过教师确认。 */
  confirmed: boolean;
  /** 确认译文时所对应的主字幕签名；主字幕改动后签名不一致即视为待重新确认。 */
  primarySignature: string;
}

export interface CaptionSettings {
  /** 新增译文时默认套用的语言。 */
  defaultTranslationLanguage: string;
  /** 新增译文时默认套用的用途。 */
  defaultTranslationPurpose: CaptionPurpose;
  /** 最近一次预览使用的字幕模式。 */
  previewMode: CaptionMode;
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
  /** 主字幕。 */
  primaryCaption: CaptionTrack;
  /** 译文字幕；未编排译文时为空。 */
  translationCaption?: CaptionTrack;
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
  captionSettings: CaptionSettings;
  lastSavedAt: string;
  revision: number;
}

export interface ValidationCheck {
  id: string;
  severity: 'error' | 'warning' | 'info';
  title: string;
  detail: string;
  /** 检查归类，便于在预览里只显示字幕相关提醒。 */
  category: 'caption' | 'general';
  stepId?: string;
  moduleId?: string;
}

export const STORAGE_KEY = 'sologsb-1012-sign-course-project-v1';

export function defaultCaptionSettings(): CaptionSettings {
  return {
    defaultTranslationLanguage: 'English',
    defaultTranslationPurpose: '听人助教参考',
    previewMode: 'bilingual',
  };
}

export function createCaptionTrack(partial: Partial<CaptionTrack> & Pick<CaptionTrack, 'text'>): CaptionTrack {
  return {
    language: '中文（简体）',
    purpose: '课堂主讲',
    durationSeconds: 0,
    confirmed: true,
    primarySignature: '',
    ...partial,
  };
}

/** 主字幕签名：主字幕调整后，用它判断已保留的译文是否需要重新确认。 */
export function primarySignature(text: string): string {
  return `sig:${text.trim()}`;
}

/** 计算字幕最长一行的显示宽度（全角字符记 2）。 */
export function captionWidth(text: string): number {
  const lines = text.split('\n');
  return lines.reduce((max, line) => {
    const width = Array.from(line).reduce((sum, char) => sum + (char.charCodeAt(0) > 0x2e7f ? 2 : 1), 0);
    return Math.max(max, width);
  }, 0);
}

export function isCaptionPurpose(value: unknown): value is CaptionPurpose {
  return value === '课堂主讲' || value === '听人助教参考' || value === '家长陪伴说明';
}

function isCaptionPosition(value: unknown): value is CaptionPosition {
  return value === '下方安全区' || value === '上移 15%' || value === '角标提示' || value === '画面中央';
}

function isCameraAngle(value: unknown): value is CameraAngle {
  return value === '正面' || value === '左侧 45°' || value === '右侧 45°' || value === '俯拍手部' || value === '全身远景';
}

function sanitizeTrack(raw: unknown, fallbackLanguage: string, fallbackPurpose: CaptionPurpose): CaptionTrack | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const source = raw as Record<string, unknown>;
  const text = typeof source.text === 'string' ? source.text : '';
  const language = typeof source.language === 'string' && source.language ? source.language : fallbackLanguage;
  const purpose = isCaptionPurpose(source.purpose) ? source.purpose : fallbackPurpose;
  const durationSeconds = Number(source.durationSeconds);
  return {
    text,
    language,
    purpose,
    durationSeconds: Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : 0,
    confirmed: Boolean(source.confirmed),
    primarySignature: typeof source.primarySignature === 'string' ? source.primarySignature : '',
  };
}

/**
 * 读取本地草稿时做迁移：旧版本只有单个 caption 字段，
 * 升级为主字幕后仍可继续编辑（旧草稿也能编辑）。
 */
export function normalizeProject(raw: unknown): CourseProject {
  const fallback = createDemoProject();
  if (!raw || typeof raw !== 'object') return fallback;
  const source = raw as Record<string, unknown>;
  const settings: CaptionSettings = { ...defaultCaptionSettings(), ...((source.captionSettings as CaptionSettings) ?? {}) };
  const languages: readonly string[] = CAPTION_LANGUAGES;
  if (!languages.includes(settings.defaultTranslationLanguage)) {
    settings.defaultTranslationLanguage = 'English';
  }
  if (!isCaptionPurpose(settings.defaultTranslationPurpose)) settings.defaultTranslationPurpose = '听人助教参考';
  if (!['primary', 'bilingual', 'translation'].includes(settings.previewMode)) settings.previewMode = 'bilingual';

  const modules = Array.isArray(source.modules)
    ? source.modules.map((rawModule, moduleIndex) => {
        const moduleSource = (rawModule ?? {}) as Record<string, unknown>;
        const steps = Array.isArray(moduleSource.steps)
          ? moduleSource.steps.map((rawStep, stepIndex) => {
              const sourceStep = (rawStep ?? {}) as Record<string, unknown>;
              const stepDuration = Number(sourceStep.duration) || 45;
              const legacyCaption = typeof sourceStep.caption === 'string' ? sourceStep.caption : '';
              const primary = sanitizeTrack(sourceStep.primaryCaption, '中文（简体）', '课堂主讲')
                ?? createCaptionTrack({
                    text: legacyCaption,
                    language: '中文（简体）',
                    purpose: '课堂主讲',
                    durationSeconds: stepDuration,
                    confirmed: true,
                  });
              if (!primary.durationSeconds) primary.durationSeconds = stepDuration;
              primary.primarySignature = primarySignature(primary.text);
              primary.confirmed = true;
              const translation = sanitizeTrack(sourceStep.translationCaption, settings.defaultTranslationLanguage, settings.defaultTranslationPurpose);
              const stringField = (value: unknown, fallbackValue = ''): string => (typeof value === 'string' ? value : fallbackValue);
              const base: LessonStep = {
                id: stringField(sourceStep.id, `step-migrated-${moduleIndex + 1}-${stepIndex + 1}`),
                title: stringField(sourceStep.title, `步骤 ${stepIndex + 1}`),
                kind: sourceStep.kind === '讲解' || sourceStep.kind === '练习' ? sourceStep.kind : '示范',
                duration: stepDuration,
                demoTitle: stringField(sourceStep.demoTitle),
                demoUrl: stringField(sourceStep.demoUrl),
                handshape: stringField(sourceStep.handshape),
                gestureZone: sourceStep.gestureZone === '左侧' || sourceStep.gestureZone === '右侧' ? sourceStep.gestureZone : '中央',
                primaryCaption: primary,
                captionPosition: isCaptionPosition(sourceStep.captionPosition) ? sourceStep.captionPosition : '下方安全区',
                camera: isCameraAngle(sourceStep.camera) ? sourceStep.camera : '正面',
                commonMistakes: Array.isArray(sourceStep.commonMistakes) ? sourceStep.commonMistakes.filter((item): item is string => typeof item === 'string') : [],
                exercise: stringField(sourceStep.exercise),
                exerciseFeedback: stringField(sourceStep.exerciseFeedback),
                altText: stringField(sourceStep.altText),
                prerequisiteId: stringField(sourceStep.prerequisiteId),
                difficulty: sourceStep.difficulty === '进阶' || sourceStep.difficulty === '挑战' ? sourceStep.difficulty : '入门',
                cuePoints: Array.isArray(sourceStep.cuePoints) ? sourceStep.cuePoints.map(Number).filter((value) => Number.isFinite(value)) : [],
              };
              if (translation) base.translationCaption = translation;
              return base;
            })
          : fallback.modules[moduleIndex]?.steps ?? [];
        return {
          id: typeof moduleSource.id === 'string' ? moduleSource.id : `module-${moduleIndex + 1}`,
          title: typeof moduleSource.title === 'string' ? moduleSource.title : `模块 ${moduleIndex + 1}`,
          summary: typeof moduleSource.summary === 'string' ? moduleSource.summary : '',
          color: typeof moduleSource.color === 'string' ? moduleSource.color : '#15827a',
          steps,
        } satisfies CourseModule;
      })
    : fallback.modules;

  return {
    ...fallback,
    ...(source as Partial<CourseProject>),
    modules,
    captionSettings: settings,
    frozenVersions: Array.isArray(source.frozenVersions) ? source.frozenVersions as FrozenVersion[] : [],
  };
}

export function createDemoProject(): CourseProject {
  const primary = (text: string, durationSeconds: number): CaptionTrack =>
    createCaptionTrack({
      text,
      language: '中文（简体）',
      purpose: '课堂主讲',
      durationSeconds,
      confirmed: true,
      primarySignature: primarySignature(text),
    });
  const translation = (
    text: string,
    durationSeconds: number,
    extra: Partial<CaptionTrack> = {},
  ): CaptionTrack =>
    createCaptionTrack({
      text,
      language: 'English',
      purpose: '听人助教参考',
      durationSeconds,
      confirmed: true,
      ...extra,
    });

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
          primaryCaption: primary('你好：手掌从额前向前送出，同时保持微笑。', 35),
          translationCaption: translation('Hello: move your palm forward with a smile.', 35, {
            primarySignature: primarySignature('你好：手掌从额前向前送出，同时保持微笑。'),
          }),
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
          // 故意不排译文，展示“译文缺失”阻断提醒。
          primaryCaption: primary('注意四指并拢，动作沿身体中轴向前。', 50),
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
          primaryCaption: primary('轮流问候，每次动作结束后停一拍，再交换角色。', 75),
          // 译文字数超宽，展示“行太长”提醒。
          translationCaption: translation(
            'Take turns greeting each other, pause for one beat after every sign, and then switch roles with your partner.',
            75,
            { primarySignature: primarySignature('轮流问候，每次动作结束后停一拍，再交换角色。') },
          ),
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
          primaryCaption: primary('数字一到五：从食指开始依次增加，不移动手腕。', 60),
          // 译文显示时长 66s 超出步骤 60s，展示“字幕超出步骤”提醒。
          translationCaption: translation('Numbers 1–5: fingers in order, wrist still.', 66, {
            primarySignature: primarySignature('数字一到五：从食指开始依次增加，不移动手腕。'),
          }),
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
          primaryCaption: primary('先做“钱”的交替手形，再用食指向前询问。', 45),
          // primarySignature 停留在旧版本主字幕，展示“主字幕调整后需重新确认”。
          translationCaption: translation("Sign 'money' first, then point forward to ask.", 45, {
            primarySignature: primarySignature('先做钱的手形，再向前询问。'),
          }),
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
    captionSettings: defaultCaptionSettings(),
    lastSavedAt: new Date().toISOString(),
    revision: 1,
  };
}

export function selectedModule(project: CourseProject): CourseModule {
  return project.modules.find((module) => module.id === project.selectedModuleId) ?? project.modules[0];
}

export function selectedStep(project: CourseProject): LessonStep | undefined {
  const module = selectedModule(project);
  return module?.steps.find((step) => step.id === project.selectedStepId) ?? module?.steps[0];
}

/** 译文相对主字幕是否已过期（主字幕调整后保留的译文需要重新确认）。 */
export function isTranslationStale(step: LessonStep): boolean {
  const translation = step.translationCaption;
  if (!translation) return false;
  return translation.primarySignature !== primarySignature(step.primaryCaption.text);
}

function trackChecks(step: LessonStep, moduleId: string, checks: ValidationCheck[]): void {
  const primary = step.primaryCaption;
  const translation = step.translationCaption;

  if (!primary.text.trim()) {
    checks.push({
      id: `cap-primary-empty-${step.id}`,
      severity: 'warning',
      category: 'caption',
      title: `${step.title} 缺少主字幕`,
      detail: '主字幕为空时，静音预览无法呈现主讲内容，也无法编排对应译文。',
      stepId: step.id,
      moduleId,
    });
  }
  if (captionWidth(primary.text) > MAX_CAPTION_WIDTH) {
    checks.push({
      id: `cap-primary-long-${step.id}`,
      severity: 'warning',
      category: 'caption',
      title: `${step.title} 主字幕行太长`,
      detail: `最长一行约 ${captionWidth(primary.text)} 半角宽，建议控制在 ${MAX_CAPTION_WIDTH}（约 23 个汉字）以内或手动换行。`,
      stepId: step.id,
      moduleId,
    });
  }
  if (!Number.isFinite(primary.durationSeconds) || primary.durationSeconds <= 0) {
    checks.push({
      id: `cap-primary-duration-${step.id}`,
      severity: 'error',
      category: 'caption',
      title: `${step.title} 主字幕显示时长无效`,
      detail: '请填写大于 0 秒的显示时长。',
      stepId: step.id,
      moduleId,
    });
  } else if (primary.durationSeconds > step.duration) {
    checks.push({
      id: `cap-primary-over-${step.id}`,
      severity: 'error',
      category: 'caption',
      title: `${step.title} 主字幕超出步骤时长`,
      detail: `主字幕显示 ${primary.durationSeconds}s，但步骤只有 ${step.duration}s，请压缩时长或延长步骤。`,
      stepId: step.id,
      moduleId,
    });
  }

  if (!translation || !translation.text.trim()) {
    checks.push({
      id: `cap-translation-missing-${step.id}`,
      severity: 'error',
      category: 'caption',
      title: `${step.title} 译文缺失`,
      detail: `听人助教和家长需要 ${translation?.language ?? '译'} 译文；译文未完成前不能提交复核或冻结。`,
      stepId: step.id,
      moduleId,
    });
    return;
  }
  if (captionWidth(translation.text) > MAX_CAPTION_WIDTH) {
    checks.push({
      id: `cap-translation-long-${step.id}`,
      severity: 'warning',
      category: 'caption',
      title: `${step.title} 译文字幕行太长`,
      detail: `最长一行约 ${captionWidth(translation.text)} 半角宽，建议控制在 ${MAX_CAPTION_WIDTH} 以内或手动换行。`,
      stepId: step.id,
      moduleId,
    });
  }
  if (!Number.isFinite(translation.durationSeconds) || translation.durationSeconds <= 0) {
    checks.push({
      id: `cap-translation-duration-${step.id}`,
      severity: 'error',
      category: 'caption',
      title: `${step.title} 译文显示时长无效`,
      detail: '请填写大于 0 秒的显示时长。',
      stepId: step.id,
      moduleId,
    });
  } else if (translation.durationSeconds > step.duration) {
    checks.push({
      id: `cap-translation-over-${step.id}`,
      severity: 'error',
      category: 'caption',
      title: `${step.title} 译文超出步骤时长`,
      detail: `译文显示 ${translation.durationSeconds}s，但步骤只有 ${step.duration}s，请压缩时长或延长步骤。`,
      stepId: step.id,
      moduleId,
    });
  }
  if (isTranslationStale(step)) {
    checks.push({
      id: `cap-translation-stale-${step.id}`,
      severity: 'error',
      category: 'caption',
      title: `${step.title} 的译文需要重新确认`,
      detail: '主字幕调整后译文已保留，但内容可能不再对应，请核对后点击“确认译文”。',
      stepId: step.id,
      moduleId,
    });
  } else if (!translation.confirmed) {
    checks.push({
      id: `cap-translation-unconfirmed-${step.id}`,
      severity: 'error',
      category: 'caption',
      title: `${step.title} 的译文尚未确认`,
      detail: '译文需要教师确认后才能提交复核或冻结。',
      stepId: step.id,
      moduleId,
    });
  }
}

export function validateProject(project: CourseProject): ValidationCheck[] {
  const checks: ValidationCheck[] = [];
  if (!project.title.trim()) checks.push({ id: 'title', severity: 'error', title: '课程标题缺失', detail: '发布前需要为课程填写清晰标题。', category: 'general' });
  if (project.modules.length === 0) checks.push({ id: 'modules', severity: 'error', title: '没有课程模块', detail: '至少需要创建一个包含学习步骤的模块。', category: 'general' });

  project.modules.forEach((module) => {
    if (!module.steps.length) {
      checks.push({ id: `empty-${module.id}`, severity: 'error', title: `${module.title} 没有学习步骤`, detail: '空模块无法进入复核。', category: 'general', moduleId: module.id });
    }
    module.steps.forEach((step, index) => {
      if (!step.altText.trim()) {
        checks.push({ id: `alt-${step.id}`, severity: 'error', title: `${step.title} 缺少替代文本`, detail: '示范片段需要描述手形、移动和面部表情。', category: 'general', stepId: step.id, moduleId: module.id });
      }
      if (step.captionPosition === '画面中央' && (step.gestureZone === '中央' || step.camera === '俯拍手部')) {
        checks.push({ id: `overlap-${step.id}`, severity: 'error', title: `${step.title} 字幕可能遮挡动作`, detail: `字幕位于${step.captionPosition}，而主要手形位于${step.gestureZone}。`, category: 'caption', stepId: step.id, moduleId: module.id });
      }
      if (step.duration < 20) {
        checks.push({ id: `duration-${step.id}`, severity: 'warning', title: `${step.title} 时长过短`, detail: '示范与练习不足 20 秒，学习者来不及观察和跟做。', category: 'general', stepId: step.id, moduleId: module.id });
      }
      if (step.prerequisiteId) {
        const prerequisiteIndex = module.steps.findIndex((candidate) => candidate.id === step.prerequisiteId);
        if (prerequisiteIndex < 0) {
          checks.push({ id: `missing-pre-${step.id}`, severity: 'error', title: `${step.title} 的前置步骤不存在`, detail: '请重新选择前置条件或移除依赖。', category: 'general', stepId: step.id, moduleId: module.id });
        } else if (prerequisiteIndex >= index) {
          checks.push({ id: `jump-${step.id}`, severity: 'error', title: `${step.title} 出现步骤跳级`, detail: '前置步骤位于当前步骤之后，学习顺序无法成立。', category: 'general', stepId: step.id, moduleId: module.id });
        }
      }
      if (step.kind === '练习' && (!step.exercise.trim() || !step.exerciseFeedback.trim())) {
        checks.push({ id: `practice-${step.id}`, severity: 'warning', title: `${step.title} 的练习反馈不完整`, detail: '练习任务需要明确完成动作和即时反馈方式。', category: 'general', stepId: step.id, moduleId: module.id });
      }
      if (step.commonMistakes.filter(Boolean).length === 0) {
        checks.push({ id: `mistakes-${step.id}`, severity: 'info', title: `${step.title} 尚未记录常见错误`, detail: '补充常见错误有助于教师现场提示。', category: 'general', stepId: step.id, moduleId: module.id });
      }
      trackChecks(step, module.id, checks);
    });
  });

  return checks;
}

export function cloneProject(project: CourseProject): CourseProject {
  return structuredClone(project);
}
