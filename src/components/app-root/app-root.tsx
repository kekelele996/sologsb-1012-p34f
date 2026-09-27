import { Component, Host, State, h, Listen } from '@stencil/core';
import {
  CAPTION_LINE_WIDTH_LIMIT,
  CAPTION_PURPOSES,
  SUBTITLE_LANGUAGES,
  cloneProject,
  createCaptionPair,
  createDemoProject,
  lineDisplayWidth,
  captionTranslationState,
  normalizeProject,
  selectedModule,
  selectedStep,
  STORAGE_KEY,
  validateProject,
  type CameraAngle,
  type CaptionPair,
  type CaptionPosition,
  type CourseModule,
  type CourseProject,
  type Difficulty,
  type GestureZone,
  type LessonStep,
  type SubtitleLanguage,
  type SubtitlePurpose,
  type SubtitleTrack,
  type ValidationCheck,
} from '../../models';

type PreviewSize = 'phone' | 'tablet';
type CaptionPreviewMode = 'primary' | 'bilingual' | 'translation';

@Component({
  tag: 'app-root',
  styleUrl: 'app-root.css',
  scoped: true,
})
export class AppRoot {
  @State() project: CourseProject = createDemoProject();
  @State() previewSize: PreviewSize = 'phone';
  @State() captionMode: CaptionPreviewMode = 'bilingual';
  @State() batchLanguage: SubtitleLanguage = 'English';
  @State() activePanel: 'editor' | 'checks' = 'editor';
  @State() playing = false;
  @State() playProgress = 0;
  @State() offline = typeof navigator !== 'undefined' ? !navigator.onLine : false;
  @State() toast?: { color: string; message: string };
  private past: CourseProject[] = [];
  private future: CourseProject[] = [];
  private playTimer?: number;

  componentWillLoad(): void {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      this.project = saved ? normalizeProject(JSON.parse(saved)) : createDemoProject();
    } catch {
      this.project = createDemoProject();
    }
  }

  disconnectedCallback(): void {
    if (this.playTimer) window.clearInterval(this.playTimer);
  }

  @Listen('online', { target: 'window' })
  handleOnline(): void {
    this.offline = false;
    this.showToast('success', '网络已恢复，本地草稿无需合并即可继续编辑。');
  }

  @Listen('offline', { target: 'window' })
  handleOffline(): void {
    this.offline = true;
    this.showToast('warning', '当前处于离线状态，修改会继续保存在本机。');
  }

  @Listen('keydown', { target: 'window' })
  handleKeyboard(event: KeyboardEvent): void {
    const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes((event.target as HTMLElement)?.tagName);
    const modifier = event.metaKey || event.ctrlKey;
    if (modifier && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      event.shiftKey ? this.redo() : this.undo();
      return;
    }
    if (modifier && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      this.redo();
      return;
    }
    if (modifier && event.key.toLowerCase() === 's') {
      event.preventDefault();
      this.saveDraft(true);
      return;
    }
    if (!editing && event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      this.moveStep(event.key === 'ArrowUp' ? -1 : 1);
    }
  }

  private get currentModule(): CourseModule {
    return selectedModule(this.project);
  }

  private get currentStep(): LessonStep | undefined {
    return selectedStep(this.project);
  }

  private get checks(): ValidationCheck[] {
    return validateProject(this.project);
  }

  private persist(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.project));
  }

  private commit(update: (draft: CourseProject) => CourseProject, toast?: string): void {
    if (this.project.status === 'frozen') {
      this.showToast('warning', '当前版本已冻结，请先创建修订版。');
      return;
    }
    const before = cloneProject(this.project);
    const next = update(cloneProject(this.project));
    next.revision = before.revision + 1;
    next.lastSavedAt = new Date().toISOString();
    this.past = [...this.past, before].slice(-80);
    this.future = [];
    this.project = next;
    this.persist();
    if (toast) this.showToast('success', toast);
  }

  private undo(): void {
    const previous = this.past.pop();
    if (!previous) return this.showToast('medium', '没有可撤销的修改。');
    this.future = [cloneProject(this.project), ...this.future].slice(0, 80);
    this.project = previous;
    this.persist();
  }

  private redo(): void {
    const next = this.future.shift();
    if (!next) return;
    this.past = [...this.past, cloneProject(this.project)].slice(-80);
    this.project = next;
    this.persist();
  }

  private showToast(color: string, message: string): void {
    this.toast = { color, message };
    window.setTimeout(() => {
      if (this.toast?.message === message) this.toast = undefined;
    }, 3_200);
  }

  private selectModule(moduleId: string): void {
    const module = this.project.modules.find((item) => item.id === moduleId);
    this.project = { ...this.project, selectedModuleId: moduleId, selectedStepId: module?.steps[0]?.id ?? '' };
    this.persist();
  }

  private selectStep(stepId: string): void {
    this.project = { ...this.project, selectedStepId: stepId };
    this.persist();
  }

  private updateStep(patch: Partial<LessonStep>, toast?: string): void {
    const stepId = this.currentStep?.id;
    if (!stepId) return;
    this.commit((draft) => ({
      ...draft,
      modules: draft.modules.map((module) => module.id === draft.selectedModuleId ? {
        ...module,
        steps: module.steps.map((step) => step.id === stepId ? { ...step, ...patch } : step),
      } : module),
    }), toast);
  }

  /** 在草稿上修改当前步骤的双语字幕 */
  private mutateCaptions(draft: CourseProject, stepId: string, change: (captions: CaptionPair) => CaptionPair): CourseProject {
    return {
      ...draft,
      modules: draft.modules.map((module) => module.id === draft.selectedModuleId ? {
        ...module,
        steps: module.steps.map((step) => step.id === stepId ? { ...step, captions: change(step.captions) } : step),
      } : module),
    };
  }

  private updateTrack(kind: 'primary' | 'translation', patch: Partial<SubtitleTrack>): void {
    const stepId = this.currentStep?.id;
    if (!stepId) return;
    this.commit((draft) => this.mutateCaptions(draft, stepId, (captions) => {
      const track = { ...captions[kind], ...patch };
      if (kind === 'primary') {
        // 主字幕文本调整：译文保留，但必须重新确认
        const primaryChanged = 'text' in patch && patch.text !== captions.primary.text;
        return { ...captions, primary: track, translationConfirmed: primaryChanged ? false : captions.translationConfirmed };
      }
      // 重新填写译文文本后同样需要再确认
      const translationChanged = 'text' in patch && patch.text !== captions.translation.text;
      return { ...captions, translation: track, translationConfirmed: translationChanged ? false : captions.translationConfirmed };
    }));
  }

  private confirmTranslation(): void {
    const step = this.currentStep;
    if (!step) return;
    if (!step.captions.translation.text.trim()) {
      this.showToast('warning', '译文还是空的，先补上译文再确认。');
      return;
    }
    this.commit((draft) => this.mutateCaptions(draft, step.id, (captions) => ({ ...captions, translationConfirmed: true })), '译文已对照主字幕确认。');
  }

  /** 批量套用译文语言：只更新空译文或待重新确认的步骤，已有已确认译文的步骤保留，可撤销 */
  private applyBatchLanguage(): void {
    const language = this.batchLanguage;
    const targets: Array<{ moduleId: string; stepId: string; empty: boolean }> = [];
    this.project.modules.forEach((module) => module.steps.forEach((step) => {
      if (step.captions.translation.language !== language && (!step.captions.translationConfirmed || !step.captions.translation.text.trim())) {
        targets.push({ moduleId: module.id, stepId: step.id, empty: !step.captions.translation.text.trim() });
      }
    }));
    if (!targets.length) {
      this.showToast('medium', `没有需要切换为${language}的待处理译文。`);
      return;
    }
    this.commit((draft) => {
      let next = draft;
      targets.forEach(({ moduleId, stepId }) => {
        next = {
          ...next,
          modules: next.modules.map((module) => module.id === moduleId ? {
            ...module,
            steps: module.steps.map((step) => step.id === stepId
              ? { ...step, captions: { ...step.captions, translation: { ...step.captions.translation, language } } }
              : step),
          } : module),
        };
      });
      return next;
    }, `已将 ${targets.length} 条待处理译文切换为${language}，可用撤销恢复。`);
  }

  private updateCurrentModule(patch: Partial<CourseModule>): void {
    this.commit((draft) => ({
      ...draft,
      modules: draft.modules.map((module) => module.id === draft.selectedModuleId ? { ...module, ...patch } : module),
    }));
  }

  private addModule(): void {
    const index = this.project.modules.length + 1;
    const module: CourseModule = {
      id: `module-${Date.now().toString(36)}`,
      title: `模块 ${index} · 未命名`,
      summary: '说明该模块的学习目标与适用场景。',
      color: ['#15827a', '#8a3ffc', '#b34331', '#376ea8'][index % 4],
      steps: [],
    };
    this.commit((draft) => ({ ...draft, modules: [...draft.modules, module], selectedModuleId: module.id, selectedStepId: '' }), '已创建课程模块。');
  }

  private addStep(kind: LessonStep['kind'] = '示范'): void {
    const module = this.currentModule;
    if (!module) return this.addModule();
    const prior = module.steps.at(-1);
    const step: LessonStep = {
      id: `step-${Date.now().toString(36)}`,
      title: `新${kind}步骤 ${module.steps.length + 1}`,
      kind,
      duration: 45,
      demoTitle: '等待上传或录制示范片段',
      demoUrl: '',
      handshape: '描述起始手形、掌心方向和运动路径。',
      gestureZone: '中央',
      captions: createCaptionPair('填写送给学习者的字幕说明。', '', 'English', 45),
      captionPosition: '下方安全区',
      camera: '正面',
      commonMistakes: [],
      exercise: kind === '练习' ? '填写练习任务。' : '',
      exerciseFeedback: kind === '练习' ? '填写反馈方式。' : '',
      altText: '',
      prerequisiteId: prior?.id ?? '',
      difficulty: '入门',
      cuePoints: [8, 20, 32],
    };
    this.commit((draft) => ({
      ...draft,
      modules: draft.modules.map((item) => item.id === module.id ? { ...item, steps: [...item.steps, step] } : item),
      selectedStepId: step.id,
    }), '已新增学习步骤。');
  }

  private duplicateStep(): void {
    const step = this.currentStep;
    if (!step) return;
    this.commit((draft) => ({
      ...draft,
      modules: draft.modules.map((module) => {
        if (module.id !== draft.selectedModuleId) return module;
        const index = module.steps.findIndex((item) => item.id === step.id);
        const duplicate = { ...structuredClone(step), id: `step-${Date.now().toString(36)}`, title: `${step.title}（副本）` };
        return { ...module, steps: [...module.steps.slice(0, index + 1), duplicate, ...module.steps.slice(index + 1)] };
      }),
    }), '已复制当前步骤。');
  }

  private deleteStep(stepId: string): void {
    if (this.currentModule.steps.length <= 1) {
      this.showToast('warning', '模块至少保留一个学习步骤。');
      return;
    }
    this.commit((draft) => ({
      ...draft,
      modules: draft.modules.map((module) => module.id === draft.selectedModuleId ? {
        ...module,
        steps: module.steps.filter((step) => step.id !== stepId),
      } : module),
      selectedStepId: this.currentModule.steps.find((step) => step.id !== stepId)?.id ?? '',
    }), '已删除学习步骤。');
  }

  private moveStep(direction: number): void {
    const stepId = this.currentStep?.id;
    if (!stepId) return;
    this.commit((draft) => ({
      ...draft,
      modules: draft.modules.map((module) => {
        if (module.id !== draft.selectedModuleId) return module;
        const index = module.steps.findIndex((step) => step.id === stepId);
        const nextIndex = Math.max(0, Math.min(module.steps.length - 1, index + direction));
        if (index === nextIndex) return module;
        const steps = [...module.steps];
        const [item] = steps.splice(index, 1);
        steps.splice(nextIndex, 0, item);
        return { ...module, steps };
      }),
    }), '已调整步骤顺序。');
  }

  private saveDraft(showMessage = true): void {
    if (this.project.status === 'frozen') {
      this.showToast('warning', '冻结版本不可覆盖，请先创建修订版。');
      return;
    }
    this.project = { ...this.project, status: 'draft', lastSavedAt: new Date().toISOString() };
    this.persist();
    if (showMessage) this.showToast('success', '草稿已保存在浏览器本地。');
  }

  private blockingMessage(): string {
    const blocking = this.checks.filter((check) => check.severity === 'error');
    const captionBlocking = blocking.filter((check) => check.area === 'caption').length;
    if (captionBlocking) {
      return `仍有 ${blocking.length} 个阻断问题，其中 ${captionBlocking} 个与双语字幕有关（译文缺失或待重新确认），完成译文后才能提交复核。`;
    }
    return `仍有 ${blocking.length} 个阻断问题，修复后才能提交复核。`;
  }

  private submitForReview(): void {
    const blocking = this.checks.filter((check) => check.severity === 'error');
    if (blocking.length) {
      this.activePanel = 'checks';
      this.showToast('danger', this.blockingMessage());
      return;
    }
    this.commit((draft) => ({ ...draft, status: 'review' }), '课程已提交复核。');
  }

  private returnForChanges(): void {
    this.commit((draft) => ({ ...draft, status: 'changes' }), '课程已退回修改。');
  }

  private freezeVersion(): void {
    const blocking = this.checks.filter((check) => check.severity === 'error');
    if (blocking.length) {
      this.activePanel = 'checks';
      this.showToast('danger', this.blockingMessage().replace('才能提交复核', '才能冻结版本'));
      return;
    }
    this.commit((draft) => {
      const { frozenVersions, ...snapshot } = cloneProject(draft);
      const version = {
        id: `frozen-${Date.now().toString(36)}`,
        label: `冻结版本 v${frozenVersions.length + 1}`,
        createdAt: new Date().toISOString(),
        snapshot,
      };
      return { ...draft, status: 'frozen', frozenVersions: [version, ...frozenVersions] };
    }, '当前课程版本已冻结。');
    this.playing = false;
  }

  private reviseFrozen(): void {
    this.commit((draft) => ({ ...draft, status: 'draft' }), '已创建修订版，可继续编辑。');
  }

  private togglePlay(): void {
    if (this.playTimer) {
      window.clearInterval(this.playTimer);
      this.playTimer = undefined;
      this.playing = false;
      return;
    }
    const duration = Math.max(10, this.currentStep?.duration ?? 40);
    this.playing = true;
    this.playTimer = window.setInterval(() => {
      this.playProgress += 0.25 / duration;
      if (this.playProgress >= 1) {
        this.playProgress = 0;
        this.playing = false;
        if (this.playTimer) window.clearInterval(this.playTimer);
        this.playTimer = undefined;
      }
    }, 250);
  }

  private formatDate(value: string): string {
    return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  }

  private renderStatusBadge() {
    if (this.project.status === 'review') return <ion-badge color="warning">待复核</ion-badge>;
    if (this.project.status === 'changes') return <ion-badge color="danger">已退回</ion-badge>;
    if (this.project.status === 'frozen') return <ion-badge color="success">已冻结</ion-badge>;
    return <ion-badge color="medium">草稿</ion-badge>;
  }

  private renderStepListItem(step: LessonStep, index: number) {
    const active = step.id === this.currentStep?.id;
    const stepChecks = this.checks.filter((check) => check.stepId === step.id);
    const issueCount = stepChecks.filter((check) => check.severity !== 'info').length;
    const captionState = captionTranslationState(step.captions);
    const captionLabel = captionState === 'complete' ? '双语已确认' : captionState === 'stale' ? '译文待确认' : '缺译文';
    return (
      <button class={`step-list-item ${active ? 'active' : ''}`} onClick={() => this.selectStep(step.id)}>
        <span class="step-index">{String(index + 1).padStart(2, '0')}</span>
        <span class="step-copy">
          <strong>{step.title}</strong>
          <small>{step.kind} · {step.duration}s · {step.difficulty}</small>
          <em class={`caption-chip ${captionState}`}>{captionLabel}</em>
        </span>
        {issueCount > 0 && <span class="step-issue-count">{issueCount}</span>}
      </button>
    );
  }

  /** 当前步骤的字幕类检查（预览与字幕编辑区共用） */
  private captionChecksFor(step: LessonStep): ValidationCheck[] {
    return this.checks.filter((check) => check.area === 'caption' && check.stepId === step.id);
  }

  private renderCaptionTrack(kind: 'primary' | 'translation', step: LessonStep, frozen: boolean) {
    const isPrimary = kind === 'primary';
    const track = step.captions[kind];
    const label = isPrimary ? '主字幕' : '译文';
    const width = (track.text.split('\n').map((line) => lineDisplayWidth(line)).sort((a, b) => b - a)[0]) ?? 0;
    const tooLong = track.text.trim() !== '' && width > CAPTION_LINE_WIDTH_LIMIT;
    const overDuration = track.displayDuration > step.duration;
    const state = captionTranslationState(step.captions);
    const stateBadge = isPrimary
      ? <span class="track-badge primary">课堂主语言</span>
      : state === 'complete'
        ? <span class="track-badge complete">✓ 已确认</span>
        : state === 'stale'
          ? <span class="track-badge stale">⚠ 主字幕已改 · 待确认</span>
          : <span class="track-badge missing">✕ 译文缺失</span>;
    const trackWarnings = this.captionChecksFor(step).filter((check) => check.title.includes(label));
    return (
      <div class={`caption-track ${kind} ${isPrimary ? '' : state}`}>
        <div class="caption-track-head">
          <strong>{label}</strong>
          {stateBadge}
          {!isPrimary && (
            <ion-button
              size="small"
              fill={state === 'complete' ? 'clear' : 'solid'}
              color={state === 'complete' ? 'success' : 'primary'}
              class="studio-button confirm-translation"
              disabled={frozen || !track.text.trim() || state === 'complete'}
              onClick={() => this.confirmTranslation()}
            >{state === 'complete' ? '译文已确认' : '确认译文'}</ion-button>
          )}
        </div>
        <div class="form-grid two">
          <ion-select
            disabled={frozen}
            label="语言"
            labelPlacement="stacked"
            class="studio-input"
            value={track.language}
            onIonChange={(event) => this.updateTrack(kind, { language: event.detail.value as SubtitleLanguage })}
          >
            {SUBTITLE_LANGUAGES.map((language) => <ion-select-option value={language}>{language}</ion-select-option>)}
          </ion-select>
          <ion-select
            disabled={frozen}
            label="用途"
            labelPlacement="stacked"
            class="studio-input"
            value={track.purpose}
            onIonChange={(event) => this.updateTrack(kind, { purpose: event.detail.value as SubtitlePurpose })}
          >
            {CAPTION_PURPOSES.map((purpose) => <ion-select-option value={purpose}>{purpose}</ion-select-option>)}
          </ion-select>
        </div>
        <ion-textarea
          disabled={frozen}
          autoGrow
          label={`${label}文本（可多行，每行一条画面字幕）`}
          labelPlacement="stacked"
          class={`studio-input ${tooLong ? 'ion-invalid' : ''}`}
          value={track.text}
          placeholder={isPrimary ? '填写课堂使用的主语言字幕。' : '填写给听人助教与家长看的译文。'}
          onIonInput={(event) => this.updateTrack(kind, { text: event.detail.value ?? '' })}
        />
        <div class="track-meta-row">
          <label class="duration-field">
            <span>显示时长（秒）</span>
            <input
              type="number" min="1" max="600"
              disabled={frozen}
              value={track.displayDuration}
              onInput={(event) => this.updateTrack(kind, { displayDuration: Number((event.target as HTMLInputElement).value) || 0 })}
            />
          </label>
          <span class={`track-meter ${tooLong ? 'danger' : ''}`}>最长一行 {width}/{CAPTION_LINE_WIDTH_LIMIT} 字宽{tooLong ? ' · 需折短' : ''}</span>
          <span class={`track-meter ${overDuration ? 'danger' : ''}`}>步骤总时长 {step.duration}s{overDuration ? ' · 字幕超出步骤' : ''}</span>
        </div>
        {trackWarnings.length > 0 && (
          <ul class="track-warnings">
            {trackWarnings.map((check) => (
              <li class={check.severity === 'error' ? 'error' : 'warning'}>
                <span>{check.severity === 'error' ? '!' : '△'}</span>{check.title.replace(`${step.title} 的`, '').replace(`${step.title} `, '')}：{check.detail}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  private renderStepEditor() {
    const step = this.currentStep;
    if (!step) {
      return (
        <div class="empty-editor">
          <div class="empty-glyph">手</div>
          <h2>这个模块还没有学习步骤</h2>
          <p>添加示范、讲解或练习步骤，然后设置前置条件与难度。</p>
          <ion-button class="studio-button" onClick={() => this.addStep('示范')}>添加第一个步骤</ion-button>
        </div>
      );
    }
    const frozen = this.project.status === 'frozen';
    const module = this.currentModule;
    const prerequisites = module.steps.filter((candidate, index) => candidate.id !== step.id && index < module.steps.findIndex((item) => item.id === step.id));
    return (
      <div class="step-editor">
        <div class="editor-title-row">
          <div>
            <span class="eyebrow">学习步骤 {module.steps.findIndex((item) => item.id === step.id) + 1}</span>
            <h1>{step.title}</h1>
            <p>最后修改 {this.formatDate(this.project.lastSavedAt)} · 修订号 {this.project.revision}</p>
          </div>
          <div class="title-actions">
            <ion-button fill="clear" class="studio-button" onClick={() => this.moveStep(-1)} title="Alt + ↑">上移</ion-button>
            <ion-button fill="clear" class="studio-button" onClick={() => this.moveStep(1)} title="Alt + ↓">下移</ion-button>
            <ion-button fill="outline" class="studio-button" onClick={() => this.duplicateStep()}>复制</ion-button>
            <ion-button fill="outline" color="danger" class="studio-button" onClick={() => this.deleteStep(step.id)}>删除</ion-button>
          </div>
        </div>

        {frozen && (
          <div class="frozen-callout">
            <div><strong>此版本已冻结</strong><span>字段已锁定，仍可预览和运行检查。</span></div>
            <ion-button size="small" class="studio-button" onClick={() => this.reviseFrozen()}>创建修订版</ion-button>
          </div>
        )}

        <section class="form-card">
          <div class="section-title"><span>01</span><div><h2>基础设计</h2><p>标题、类型、难度和预计时长</p></div></div>
          <div class="form-grid two">
            <ion-input disabled={frozen} label="步骤标题" labelPlacement="stacked" class="studio-input" value={step.title} onIonInput={(event) => this.updateStep({ title: event.detail.value ?? '' })} />
            <ion-select disabled={frozen} label="步骤类型" labelPlacement="stacked" class="studio-input" value={step.kind} onIonChange={(event) => this.updateStep({ kind: event.detail.value as LessonStep['kind'] })}>
              <ion-select-option value="示范">示范</ion-select-option>
              <ion-select-option value="讲解">讲解</ion-select-option>
              <ion-select-option value="练习">练习</ion-select-option>
            </ion-select>
            <ion-select disabled={frozen} label="难度标签" labelPlacement="stacked" class="studio-input" value={step.difficulty} onIonChange={(event) => this.updateStep({ difficulty: event.detail.value as Difficulty })}>
              {(['入门', '进阶', '挑战'] as Difficulty[]).map((item) => <ion-select-option value={item}>{item}</ion-select-option>)}
            </ion-select>
            <ion-input disabled={frozen} type="number" min="10" max="600" label="预计时长（秒）" labelPlacement="stacked" class="studio-input" value={String(step.duration)} onIonInput={(event) => this.updateStep({ duration: Number(event.detail.value) || 0 })} />
          </div>
        </section>

        <section class="form-card">
          <div class="section-title"><span>02</span><div><h2>示范片段与镜头</h2><p>记录素材标识、手形、镜头角度和动作区域</p></div></div>
          <div class="demo-row">
            <div class={`video-thumbnail zone-${step.gestureZone}`}>
              <span class="play-mark">▶</span>
              <strong>{step.kind}片段</strong>
              <small>{step.camera}</small>
            </div>
            <div class="demo-fields">
              <ion-input disabled={frozen} label="示范片段名称" labelPlacement="stacked" class="studio-input" value={step.demoTitle} onIonInput={(event) => this.updateStep({ demoTitle: event.detail.value ?? '' })} />
              <ion-input disabled={frozen} label="本地素材地址（可空）" labelPlacement="stacked" class="studio-input" value={step.demoUrl} placeholder="例如 assets/hello.mp4" onIonInput={(event) => this.updateStep({ demoUrl: event.detail.value ?? '' })} />
            </div>
          </div>
          <div class="form-grid two">
            <ion-select disabled={frozen} label="镜头角度" labelPlacement="stacked" class="studio-input" value={step.camera} onIonChange={(event) => this.updateStep({ camera: event.detail.value as CameraAngle })}>
              {(['正面', '左侧 45°', '右侧 45°', '俯拍手部', '全身远景'] as CameraAngle[]).map((item) => <ion-select-option value={item}>{item}</ion-select-option>)}
            </ion-select>
            <ion-select disabled={frozen} label="主要手形区域" labelPlacement="stacked" class="studio-input" value={step.gestureZone} onIonChange={(event) => this.updateStep({ gestureZone: event.detail.value as GestureZone })}>
              {(['左侧', '中央', '右侧'] as GestureZone[]).map((item) => <ion-select-option value={item}>{item}</ion-select-option>)}
            </ion-select>
          </div>
          <ion-textarea disabled={frozen} autoGrow label="手形说明" labelPlacement="stacked" class="studio-input" value={step.handshape} onIonInput={(event) => this.updateStep({ handshape: event.detail.value ?? '' })} />
        </section>

        <section class="form-card">
          <div class="section-title"><span>03</span><div><h2>双语字幕编排</h2><p>每步维护主字幕与译文，记录语言、显示时长与用途</p></div></div>

          <div class="caption-batch-bar">
            <span class="batch-label">批量套用译文语言</span>
            <ion-select disabled={frozen} class="studio-input batch-language" value={this.batchLanguage} onIonChange={(event) => { this.batchLanguage = event.detail.value as SubtitleLanguage; }}>
              {SUBTITLE_LANGUAGES.filter((language) => language !== '简体中文').map((language) => <ion-select-option value={language}>{language}</ion-select-option>)}
            </ion-select>
            <ion-button size="small" fill="outline" class="studio-button" disabled={frozen} onClick={() => this.applyBatchLanguage()}>套用到待处理步骤</ion-button>
            <small>仅更新译文缺失或待确认的步骤，已确认译文不会被覆盖；操作可用撤销恢复。</small>
          </div>

          {this.renderCaptionTrack('primary', step, frozen)}
          {this.renderCaptionTrack('translation', step, frozen)}

          <div class="form-grid two caption-position-row">
            <ion-select disabled={frozen} label="字幕位置" labelPlacement="stacked" class="studio-input" value={step.captionPosition} onIonChange={(event) => this.updateStep({ captionPosition: event.detail.value as CaptionPosition })}>
              {(['下方安全区', '上移 15%', '角标提示', '画面中央'] as CaptionPosition[]).map((item) => <ion-select-option value={item}>{item}</ion-select-option>)}
            </ion-select>
            <ion-input disabled label="替代文本状态" labelPlacement="stacked" class={`studio-input ${step.altText ? '' : 'ion-invalid'}`} value={step.altText ? '已填写' : '缺失'} readonly />
          </div>
          <ion-textarea disabled={frozen} autoGrow label="替代文本（必须描述动作与表情）" labelPlacement="stacked" class={`studio-input ${step.altText ? '' : 'ion-invalid'}`} value={step.altText} onIonInput={(event) => this.updateStep({ altText: event.detail.value ?? '' })} />
        </section>

        <section class="form-card">
          <div class="section-title"><span>04</span><div><h2>学习依赖与练习</h2><p>前置步骤、常见错误、练习任务与反馈</p></div></div>
          <div class="form-grid two">
            <ion-select disabled={frozen} label="前置条件" labelPlacement="stacked" class="studio-input" value={step.prerequisiteId} onIonChange={(event) => this.updateStep({ prerequisiteId: event.detail.value ?? '' })}>
              <ion-select-option value="">无前置条件</ion-select-option>
              {prerequisites.map((item) => <ion-select-option value={item.id}>{item.title}</ion-select-option>)}
            </ion-select>
            <ion-input disabled={frozen} label="检查点（秒，用逗号分隔）" labelPlacement="stacked" class="studio-input" value={step.cuePoints.join(', ')} onIonInput={(event) => this.updateStep({ cuePoints: (event.detail.value ?? '').split(/[,，\s]+/).map(Number).filter((value) => Number.isFinite(value)) })} />
          </div>
          <ion-textarea disabled={frozen} autoGrow label="常见错误（每行一条）" labelPlacement="stacked" class="studio-input" value={step.commonMistakes.join('\n')} onIonInput={(event) => this.updateStep({ commonMistakes: (event.detail.value ?? '').split('\n').filter(Boolean) })} />
          <div class="form-grid two">
            <ion-textarea disabled={frozen} autoGrow label="练习任务" labelPlacement="stacked" class="studio-input" value={step.exercise} onIonInput={(event) => this.updateStep({ exercise: event.detail.value ?? '' })} />
            <ion-textarea disabled={frozen} autoGrow label="练习反馈" labelPlacement="stacked" class="studio-input" value={step.exerciseFeedback} onIonInput={(event) => this.updateStep({ exerciseFeedback: event.detail.value ?? '' })} />
          </div>
        </section>
      </div>
    );
  }

  private renderCaptionStage(step: LessonStep) {
    const { primary, translation } = step.captions;
    const state = captionTranslationState(step.captions);
    const showPrimary = this.captionMode === 'primary' || this.captionMode === 'bilingual';
    const showTranslation = this.captionMode === 'translation' || this.captionMode === 'bilingual';
    const primaryMissing = !primary.text.trim();
    const translationMissing = state === 'missing';
    const positionClass = `caption-${step.captionPosition.replace(/\s|%/g, '')}`;
    const cornerText = (text: string) => text.split('\n')[0]?.slice(0, 18) || '';
    const corner = step.captionPosition === '角标提示';
    const block = (kind: 'primary' | 'translation') => {
      const track = kind === 'primary' ? primary : translation;
      const missing = kind === 'primary' ? primaryMissing : translationMissing;
      const placeholder = kind === 'primary' ? '未填写主字幕' : state === 'missing' ? '译文缺失' : '译文待重新确认';
      return corner ? (
        <div class={`corner-caption ${kind} ${missing ? 'missing' : ''}`}>{missing ? placeholder : cornerText(track.text)}</div>
      ) : (
        <div class={`caption-line ${kind} ${missing ? 'missing' : ''}`}>
          {missing ? placeholder : track.text.split('\n').map((line) => <p>{line}</p>)}
        </div>
      );
    };
    return (
      <div class={`caption-stack ${positionClass} mode-${this.captionMode} ${corner ? 'is-corner' : ''}`}>
        {showPrimary && block('primary')}
        {showTranslation && block('translation')}
      </div>
    );
  }

  private renderPreviewCaptionWarnings(step: LessonStep) {
    const captionChecks = this.captionChecksFor(step);
    if (!captionChecks.length) {
      return <div class="preview-caption-allclear">✓ 当前模式字幕检查通过：语言、行宽与显示时长均正常。</div>;
    }
    return (
      <ul class="preview-caption-warnings">
        {captionChecks.map((check) => (
          <li class={check.severity}>
            <span>{check.severity === 'error' ? '!' : '△'}</span>
            <strong>{check.title.replace(`${step.title} `, '')}</strong>
            <small>{check.detail}</small>
          </li>
        ))}
      </ul>
    );
  }

  private renderPreview() {
    const step = this.currentStep;
    const progress = Math.round(this.playProgress * 100);
    return (
      <section class="preview-panel">
        <div class="preview-head">
          <div><span class="eyebrow">学习者预览</span><h2>设备与双语字幕检查</h2></div>
          <div class="preview-controls">
            <ion-segment value={this.captionMode} class="studio-segment caption-mode-segment" onIonChange={(event) => { this.captionMode = event.detail.value as CaptionPreviewMode; }}>
              <ion-segment-button value="primary">主字幕</ion-segment-button>
              <ion-segment-button value="bilingual">双语</ion-segment-button>
              <ion-segment-button value="translation">仅译文</ion-segment-button>
            </ion-segment>
            <ion-segment value={this.previewSize} class="studio-segment" onIonChange={(event) => { this.previewSize = event.detail.value as PreviewSize; }}>
              <ion-segment-button value="phone">手机</ion-segment-button>
              <ion-segment-button value="tablet">平板</ion-segment-button>
            </ion-segment>
          </div>
        </div>
        {step ? (
          <div class={`device-frame ${this.previewSize}`}>
            <div class="device-top"><span>{this.previewSize === 'phone' ? '9:16' : '4:3'}</span><span>{step.camera} · {this.captionMode === 'primary' ? step.captions.primary.language : this.captionMode === 'translation' ? step.captions.translation.language : `${step.captions.primary.language} / ${step.captions.translation.language}`}</span></div>
            <div class={`preview-stage zone-${step.gestureZone} caption-${step.captionPosition.replace(/\s|%/g, '')} ${step.captionPosition === '画面中央' && step.gestureZone === '中央' ? 'overlap-warning' : ''}`}>
              <div class="stage-grid" />
              <div class="signer">
                <div class="head"><span class="face"><i /><i /></span></div>
                <div class="torso" />
                <div class="arm arm-left"><span class="hand" /></div>
                <div class="arm arm-right"><span class="hand" /></div>
              </div>
              <div class="gesture-marker" style={{ left: step.gestureZone === '左侧' ? '18%' : step.gestureZone === '右侧' ? '70%' : '43%' }} />
              {this.renderCaptionStage(step)}
              <div class="safe-area"><span>字幕安全区</span></div>
            </div>
            <div class="player-controls">
              <button class="play-button" onClick={() => this.togglePlay()}>{this.playing ? 'Ⅱ' : '▶'}</button>
              <div class="player-timeline">
                <span style={{ width: `${progress}%` }} />
                {step.cuePoints.map((cue) => <i style={{ left: `${Math.min(100, (cue / Math.max(1, step.duration)) * 100)}%` }} title={`检查点 ${cue}s`} />)}
              </div>
              <span class="time-code">{String(Math.floor(this.playProgress * step.duration)).padStart(2, '0')} / {step.duration}s</span>
            </div>
            <div class="preview-meta">
              <div><strong>{step.kind}</strong><span>步骤类型</span></div>
              <div><strong>{step.difficulty}</strong><span>难度标签</span></div>
              <div><strong>{step.captions.translation.language}</strong><span>译文语言</span></div>
              <div><strong>{step.captions.primary.displayDuration}s</strong><span>主字幕显示</span></div>
              <div><strong>{step.captions.translation.displayDuration}s</strong><span>译文显示</span></div>
              <div><strong>{step.cuePoints.length}</strong><span>检查点</span></div>
            </div>
            <div class="preview-caption-box">
              <div class="preview-caption-head">
                <span class="eyebrow">{this.captionMode === 'primary' ? '仅主字幕' : this.captionMode === 'translation' ? '仅译文' : '双语字幕'}</span>
                {(() => {
                  const state = captionTranslationState(step.captions);
                  return state === 'complete'
                    ? <em class="caption-chip complete">双语已确认</em>
                    : state === 'stale'
                      ? <em class="caption-chip stale">译文待确认</em>
                      : <em class="caption-chip missing">缺译文</em>;
                })()}
              </div>
              <div class="preview-caption-lines">
                {(this.captionMode === 'primary' || this.captionMode === 'bilingual') && (
                  <p class={`primary ${step.captions.primary.text.trim() ? '' : 'missing'}`}><i>{step.captions.primary.language}</i>{step.captions.primary.text.trim() || '未填写主字幕'}</p>
                )}
                {(this.captionMode === 'translation' || this.captionMode === 'bilingual') && (
                  <p class={`translation ${step.captions.translation.text.trim() ? '' : 'missing'}`}><i>{step.captions.translation.language} · {step.captions.translation.purpose}</i>{step.captions.translation.text.trim() || (captionTranslationState(step.captions) === 'stale' ? '译文待重新确认' : '译文缺失')}</p>
                )}
              </div>
              {this.renderPreviewCaptionWarnings(step)}
            </div>
          </div>
        ) : <div class="empty-preview">选择步骤后显示设备预览。</div>}
      </section>
    );
  }

  private renderChecks() {
    const errors = this.checks.filter((check) => check.severity === 'error');
    const warnings = this.checks.filter((check) => check.severity === 'warning');
    const info = this.checks.filter((check) => check.severity === 'info');
    return (
      <section class="checks-panel">
        <div class="checks-summary">
          <div class="check-stat danger"><strong>{errors.length}</strong><span>阻断问题</span></div>
          <div class="check-stat warning"><strong>{warnings.length}</strong><span>需注意</span></div>
          <div class="check-stat"><strong>{info.length}</strong><span>优化建议</span></div>
        </div>
        <div class="check-list">
          {this.checks.length === 0 && <div class="all-clear"><strong>✓ 未发现问题</strong><p>字幕遮挡、步骤跳级和替代文本检查均已通过。</p></div>}
          {this.checks.map((check) => (
            <button class={`check-item ${check.severity}`} onClick={() => {
              if (check.moduleId) this.selectModule(check.moduleId);
              if (check.stepId) this.selectStep(check.stepId);
              this.activePanel = 'editor';
            }}>
              <span class="check-severity">{check.severity === 'error' ? '!' : check.severity === 'warning' ? '△' : 'i'}</span>
              <span>
                <strong>{check.title}{check.area === 'caption' && <em class="check-area-tag">双语字幕</em>}</strong>
                <small>{check.detail}</small>
              </span>
              <span class="check-arrow">→</span>
            </button>
          ))}
        </div>
      </section>
    );
  }

  render() {
    const module = this.currentModule;
    const errors = this.checks.filter((check) => check.severity === 'error').length;
    return (
      <Host>
        <ion-app>
          <ion-header class="studio-header">
            <ion-toolbar>
              <ion-buttons slot="start"><div class="logo-mark">手</div><div class="app-title"><strong>SignCourse Studio</strong><span>手语课程编排工具</span></div></ion-buttons>
              <ion-buttons slot="end" class="header-actions">
                <button class={`connection-status ${this.offline ? 'offline' : ''}`} onClick={() => { this.offline = !this.offline; this.showToast(this.offline ? 'warning' : 'success', this.offline ? '已进入离线模拟，编辑继续保存在本机。' : '已恢复在线模拟，本地草稿保持同步。'); }}><span />{this.offline ? '离线编辑中（点击恢复）' : '本地自动保存（点击模拟离线）'}</button>
                <ion-button fill="clear" class="studio-button" disabled={this.past.length === 0} onClick={() => this.undo()}>撤销</ion-button>
                <ion-button fill="clear" class="studio-button" disabled={this.future.length === 0} onClick={() => this.redo()}>重做</ion-button>
                <ion-button fill="outline" class="studio-button" onClick={() => this.saveDraft()}>保存草稿</ion-button>
                {this.project.status === 'review'
                  ? <ion-button color="success" class="studio-button" onClick={() => this.freezeVersion()}>冻结版本</ion-button>
                  : this.project.status === 'changes'
                    ? <ion-button color="warning" class="studio-button" onClick={() => this.submitForReview()}>重新提交</ion-button>
                    : this.project.status === 'frozen'
                      ? <ion-button class="studio-button" onClick={() => this.reviseFrozen()}>创建修订版</ion-button>
                      : <ion-button color="primary" class="studio-button" onClick={() => this.submitForReview()}>提交复核</ion-button>}
              </ion-buttons>
            </ion-toolbar>
          </ion-header>

          <ion-content fullscreen>
            <div class="project-ribbon">
              <div class="project-heading">
                {this.renderStatusBadge()}
                <ion-input value={this.project.title} class="project-title-input" onIonInput={(event) => { this.project = { ...this.project, title: event.detail.value ?? '' }; this.persist(); }} />
                <span>{this.project.teacher} · {this.project.audience}</span>
              </div>
              <div class="project-metrics">
                <div><strong>{this.project.modules.length}</strong><span>模块</span></div>
                <div><strong>{this.project.modules.reduce((sum, item) => sum + item.steps.length, 0)}</strong><span>步骤</span></div>
                <div><strong>{Math.ceil(this.project.modules.reduce((sum, item) => sum + item.steps.reduce((total, lesson) => total + lesson.duration, 0), 0) / 60)}</strong><span>分钟</span></div>
                <div class={errors ? 'has-errors' : ''}><strong>{errors}</strong><span>阻断问题</span></div>
              </div>
              <div class="workflow-actions">
                {this.project.status === 'review' && <ion-button fill="clear" color="danger" class="studio-button" onClick={() => this.returnForChanges()}>退回修改</ion-button>}
                {this.project.status === 'draft' && <ion-button fill="clear" class="studio-button" onClick={() => this.addModule()}>＋ 新建模块</ion-button>}
                <ion-button fill="clear" class="studio-button" onClick={() => this.addStep('练习')}>＋ 练习步骤</ion-button>
              </div>
            </div>

            <main class="studio-workspace">
              <aside class="course-panel">
                <div class="panel-heading"><div><span class="eyebrow">课程结构</span><h2>模块与步骤</h2></div><button class="add-step-button" onClick={() => this.addStep('示范')}>＋</button></div>
                <div class="module-list">
                  {this.project.modules.map((item) => (
                    <section class={`module-card ${item.id === module?.id ? 'active' : ''}`} key={item.id}>
                      <button class="module-head" onClick={() => this.selectModule(item.id)}>
                        <span class="module-color" style={{ background: item.color }} />
                        <span><strong>{item.title}</strong><small>{item.steps.length} 个学习步骤</small></span>
                      </button>
                      {item.id === module?.id && <div class="step-list">{item.steps.map((lesson, index) => this.renderStepListItem(lesson, index))}</div>}
                    </section>
                  ))}
                </div>
                <div class="module-editor">
                  <ion-input disabled={this.project.status === 'frozen'} label="当前模块标题" labelPlacement="stacked" class="studio-input" value={module?.title ?? ''} onIonInput={(event) => this.updateCurrentModule({ title: event.detail.value ?? '' })} />
                  <ion-textarea disabled={this.project.status === 'frozen'} autoGrow label="模块目标" labelPlacement="stacked" class="studio-input" value={module?.summary ?? ''} onIonInput={(event) => this.updateCurrentModule({ summary: event.detail.value ?? '' })} />
                </div>
              </aside>

              <section class="editor-panel">
                <div class="panel-switcher">
                  <button class={this.activePanel === 'editor' ? 'active' : ''} onClick={() => { this.activePanel = 'editor'; }}>步骤编排</button>
                  <button class={this.activePanel === 'checks' ? 'active' : ''} onClick={() => { this.activePanel = 'checks'; }}>发布前检查 <span>{this.checks.length}</span></button>
                </div>
                <div class="editor-scroll">{this.activePanel === 'editor' ? this.renderStepEditor() : this.renderChecks()}</div>
              </section>

              {this.renderPreview()}
            </main>
          </ion-content>
          <ion-toast isOpen={Boolean(this.toast)} message={this.toast?.message} color={this.toast?.color} duration={3200} onDidDismiss={() => { this.toast = undefined; }} />
        </ion-app>
      </Host>
    );
  }
}
