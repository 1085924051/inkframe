"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, Clapperboard, Download, FileText, Film, Layers3, Library, PackageOpen, PanelRightOpen, Plus, RefreshCw, Shield, Sparkles, Upload, WandSparkles, X, UserRound, ImageIcon, Trash2 } from "lucide-react";
import { directorStyles, writerStyles } from "@/lib/styles";
import type { Character, DirectorStyle, EpisodeSummary, GeneratedProject, NarrativePerspective, ProjectFormat, ScriptLength, Shot, ShotStatus, WriterStyle } from "@/lib/types";
import { buildCharacterReferencePrompt } from "@/lib/character-prompts";

type Step = "brief" | "style" | "characters" | "script" | "shots" | "video" | "assets";
type ProjectSummary = { id: string; title: string; topic: string; logline: string; sceneCount: number; shotCount: number; format?: string; episodeCount?: number; targetWords?: number; createdAt: string };
type TraceEntry = { stage: string; at: string; summary: string };
type JobState = { status: ShotStatus; progress: number; outputUrl?: string };
type UsageState = { inputTokens: number; outputTokens: number; costCents: number; costMicros: number; pricedRecords: number };
type AssetState = { id: string; kind: string; status: string; name: string; url?: string; provider?: string; episodeId?: string; shotId?: string; metadataJson?: string; createdAt: string };
type ImageJobState = { id: string; characterId?: string; sceneId?: string; assetType?: string; view?: string; prompt?: string; status: "queued" | "processing" | "complete" | "failed"; progress: number; outputUrl?: string; error?: string };
type ModelProfile = { id: string; name: string; kind: string; provider: string; model: string; baseUrl: string };
type StyleEditorState = { kind: "writer"; style: WriterStyle } | { kind: "director"; style: DirectorStyle };

function EpisodeBoard({ episodes, activeEpisodeNumber, onSelect }: { episodes: EpisodeSummary[]; activeEpisodeNumber: number; onSelect: (episode: EpisodeSummary) => void }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [jumpValue, setJumpValue] = useState(String(activeEpisodeNumber));
  const longSeries = episodes.length > 9;
  useEffect(() => setJumpValue(String(activeEpisodeNumber)), [activeEpisodeNumber]);
  useEffect(() => {
    if (!longSeries || !viewportRef.current) return;
    const viewport = viewportRef.current;
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      event.preventDefault();
      viewport.scrollBy({ left: event.deltaY, behavior: "smooth" });
    };
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [longSeries]);
  useEffect(() => {
    const current = viewportRef.current?.querySelector<HTMLElement>(`[data-episode-number="${activeEpisodeNumber}"]`);
    current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [activeEpisodeNumber]);
  function jumpToEpisode() {
    const number = Math.max(1, Math.min(episodes.length, Number(jumpValue) || 1));
    const episode = episodes.find((item) => item.number === number);
    if (episode) onSelect(episode);
  }
  return <section className={`episode-navigator ${longSeries ? "long-series" : ""}`}><div className="episode-navigator-heading"><div><b>当前剧集</b><small>{longSeries ? "滚轮横向浏览 · 输入集数快速定位" : `${episodes.length} 集项目`}</small></div><label>跳转第 <input type="number" min={1} max={episodes.length} value={jumpValue} onChange={(event) => setJumpValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") jumpToEpisode(); }} /> 集<button type="button" className="ghost-button" onClick={jumpToEpisode}>定位</button></label></div><div className="episode-board-viewport" ref={viewportRef}><div className="episode-board">{episodes.map((episode) => <button type="button" data-episode-number={episode.number} key={episode.id} className={`episode-item ${activeEpisodeNumber === episode.number ? "current" : ""}`} onClick={() => onSelect(episode)}><span>EP {String(episode.number).padStart(2, "0")}</span><div><b>{episode.title}</b><small>{episode.status === "draft" ? "已生成" : "待生成"} · {episode.sceneCount} 场 · {episode.shotCount} 镜头</small></div><ArrowRight size={14} /></button>)}</div></div></section>;
}

function CharacterEpisodeUsage({ project }: { project: GeneratedProject }) {
  const usage = new Map<string, Set<number>>();
  for (const episode of project.episodes || []) {
    for (const characterId of episode.characterIds || []) {
      if (!usage.has(characterId)) usage.set(characterId, new Set());
      usage.get(characterId)!.add(episode.number);
    }
  }
  for (const shot of project.shots || []) {
    const episodeNumber = shot.episodeNumber || 1;
    for (const characterId of shot.characterIds || []) {
      if (!usage.has(characterId)) usage.set(characterId, new Set());
      usage.get(characterId)!.add(episodeNumber);
    }
  }
  return <section className="character-episode-usage"><div className="character-episode-usage-heading"><b>人物集数关联</b><small>人物资产属于项目，可在多个集复用</small></div><div className="character-episode-usage-list">{(project.characters || []).map((character) => { const numbers = Array.from(usage.get(character.id) || []).sort((a, b) => a - b); return <div className="character-episode-usage-item" key={character.id}><span className="usage-avatar"><UserRound size={14} /></span><div><b>{character.name}</b><small>{character.role}</small></div><span className="usage-episodes">{numbers.length ? numbers.map((number) => <em key={number}>EP {String(number).padStart(2, "0")}</em>) : <i>暂未关联剧集</i>}</span></div>; })}</div></section>;
}

function AssetImportPanel({ kind, name, url, assets, importing, onKindChange, onNameChange, onUrlChange, onImport }: { kind: string; name: string; url: string; assets: AssetState[]; importing: boolean; onKindChange: (value: string) => void; onNameChange: (value: string) => void; onUrlChange: (value: string) => void; onImport: () => void }) {
  return <div className="asset-import"><div className="asset-import-heading"><b>导入当前集素材</b><small>{assets.length} 项可用素材</small></div><div className="asset-import-fields"><label className="field"><span>素材名称</span><input value={name} onChange={(event) => onNameChange(event.target.value)} placeholder="例如：主角定妆照" /></label><label className="field"><span>类型</span><select className="select-button" value={kind} onChange={(event) => onKindChange(event.target.value)}><option value="image">图片</option><option value="video">视频</option><option value="audio">音频</option><option value="reference">参考</option></select></label><label className="field full"><span>素材 URL</span><input value={url} onChange={(event) => onUrlChange(event.target.value)} placeholder="https://... 或 /uploads/..." /></label></div><button className="primary-button" onClick={onImport} disabled={importing || !name.trim() || !url.trim()}>{importing ? "导入中…" : "导入素材"}</button><div className="asset-grid asset-import-grid">{assets.length ? assets.map((asset) => <article className="asset-card" key={asset.id}><div className="asset-preview">{asset.url && asset.kind === "video" ? <video src={asset.url} controls preload="metadata" /> : asset.url && asset.kind === "image" ? <img src={asset.url} alt={asset.name} /> : asset.url && asset.kind === "audio" ? <audio src={asset.url} controls /> : <span>{asset.kind.toUpperCase()}</span>}</div><div className="asset-body"><b>{asset.name}</b><small>{asset.provider || "本地素材"} · {asset.status} · {asset.shotId || "未绑定镜头"}</small>{asset.url && <a href={asset.url} target="_blank" rel="noreferrer">打开素材</a>}</div></article>) : <div className="empty-state"><Library size={24} /><p>当前集暂无素材。</p></div>}</div></div>;
}

function ImagePreviewModal({ preview, onClose }: { preview: { url: string; title: string } | null; onClose: () => void }) {
  const [zoom, setZoom] = useState(1);
  const stageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!preview) return;
    setZoom(1);
    stageRef.current?.scrollTo({ left: 0, top: 0 });
  }, [preview]);
  if (!preview) return null;
  const changeZoom = (delta: number) => setZoom((value) => Math.min(4, Math.max(.5, Number((value + delta).toFixed(2)))));
  return <div className="preview-modal-backdrop" onClick={onClose}>
    <div className="preview-modal" onClick={(event) => event.stopPropagation()}>
      <div className="preview-modal-header"><b>{preview.title}</b><button className="drawer-close" aria-label="关闭预览" onClick={onClose}><X size={17} /></button></div>
      <div
        ref={stageRef}
        className="preview-stage"
        onWheel={(event) => {
          event.preventDefault();
          changeZoom(event.deltaY < 0 ? .1 : -.1);
        }}
      >
        <img
          src={preview.url}
          alt={preview.title}
          style={{ width: zoom === 1 ? "auto" : `${zoom * 100}%`, maxWidth: zoom === 1 ? "100%" : "none", height: "auto" }}
        />
      </div>
      <div className="preview-controls"><button className="ghost-button" onClick={() => changeZoom(-.25)}>缩小</button><span>{Math.round(zoom * 100)}%</span><button className="ghost-button" onClick={() => changeZoom(.25)}>放大</button><button className="ghost-button" onClick={() => { setZoom(1); stageRef.current?.scrollTo({ left: 0, top: 0 }); }}>复位</button></div>
    </div>
  </div>;
}

function SceneAssetEditor({ projectId, episodeId, scenes, assets, jobs, modelId, model, director, onGenerate }: { projectId: string; episodeId?: string; scenes: GeneratedProject["scenes"]; assets: AssetState[]; jobs: Record<string, ImageJobState>; modelId: string; model: string; director?: DirectorStyle; onGenerate: (sceneId: string, view: string, prompt: string) => void }) {
  const [prompts, setPrompts] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<{ url: string; title: string } | null>(null);
  const activeDirector = director || directorStyles[0];
  const viewLabels: Record<string, string> = { establishing: "建立", reverse: "反打", detail: "细节" };
  const promptFor = (scene: GeneratedProject["scenes"][number], view: string) => prompts[`${scene.id}:${view}`] || `${activeDirector.descriptor}; scene reference for ${scene.title}; ${scene.content}; ${view} view, coherent production design, consistent architecture, cinematic lighting, no people unless required`;
  return <section className="panel scene-asset-editor"><div className="panel-heading"><div><span className="section-index">场景资产</span><h3>编辑提示词并生成场景参考</h3></div><span className="panel-note">异步任务 · 可复用到其他集</span></div><div className="scene-asset-editor-list">{scenes.map((scene) => { const variants = assets.filter((asset) => { const meta = assetMetadata(asset); return meta.category === "scene" && meta.sceneId === scene.id && Boolean(asset.url); }); return <article className="scene-asset-editor-card" key={scene.id || scene.number}><div className="scene-asset-editor-head"><div><b>{scene.title}</b><small>{scene.content}</small></div></div><label className="field full"><span>场景提示词</span><textarea value={promptFor(scene, "establishing")} onChange={(event) => setPrompts((current) => ({ ...current, [`${scene.id}:establishing`]: event.target.value }))} /></label><div className="scene-asset-editor-actions">{["establishing", "reverse", "detail"].map((view) => { const key = `scene:${scene.id}:${view}`; const job = jobs[key]; const asset = variants.find((item) => assetMetadata(item).view === view); const busy = job?.status === "queued" || job?.status === "processing"; return <div className="scene-view-action" key={view}>{asset?.url && <button className="scene-asset-preview" type="button" onClick={() => setPreview({ url: asset.url!, title: `${scene.title} · ${viewLabels[view]}` })}><img src={asset.url} alt={`${scene.title} ${viewLabels[view]}`} /></button>}<button type="button" className="ghost-button" disabled={busy || !modelId || !model} onClick={() => scene.id && onGenerate(scene.id, view, promptFor(scene, view))}>{busy ? `生成中 ${job?.progress || 0}%` : job?.status === "failed" ? "重试生成" : asset ? `重新生成${viewLabels[view]}` : `生成${viewLabels[view]}`}</button>{busy && <small className="scene-job-status">已提交 · 后台处理中</small>}{job?.status === "complete" && <small className="scene-job-status complete">已完成</small>}{job?.status === "failed" && <small className="scene-job-status failed">生成失败</small>}</div>; })}</div></article>; })}</div><ImagePreviewModal preview={preview} onClose={() => setPreview(null)} /></section>;
}

function ShotAssociationEditor({ shot, characters, assets, onChange }: { shot: Partial<Shot>; characters: Character[]; assets: AssetState[]; onChange: (patch: Partial<Shot>) => void }) {
  const characterIds = shot.characterIds || [];
  const referenceAssetIds = shot.referenceAssetIds || [];
  const toggle = (values: string[], id: string) => values.includes(id) ? values.filter((value) => value !== id) : [...values, id];
  const referenceAssets = assets.filter((asset) => {
    const meta = assetMetadata(asset);
    return Boolean(asset.url) && (asset.kind === "reference" || asset.kind === "image") && meta.category !== "character";
  });
  return <div className="shot-associations shot-associations-separated">
    <div>
      <div className="association-heading"><b>关联人物</b><small>只管理本镜头出场的人物</small></div>
      <div className="association-options">{characters.length ? characters.map((character) => <label key={character.id} className="association-option"><input type="checkbox" checked={characterIds.includes(character.id)} onChange={() => onChange({ characterIds: toggle(characterIds, character.id) })} /><span>{character.name}</span><em>{character.id}</em></label>) : <small className="muted-line">当前剧本还没有人物。</small>}</div>
    </div>
    <div>
      <div className="association-heading"><b>场景 / 外部参考资产</b><small>只选择场景资产或手动导入的参考素材</small></div>
      <div className="association-options">{referenceAssets.length ? referenceAssets.map((asset) => <label key={asset.id} className="association-option"><input type="checkbox" checked={referenceAssetIds.includes(asset.id)} onChange={() => onChange({ referenceAssetIds: toggle(referenceAssetIds, asset.id) })} /><span>{asset.name}</span><em>{assetMetadata(asset).category === "scene" ? "场景资产" : "外部素材"}</em></label>) : <small className="muted-line">当前集还没有可用场景资产或外部参考素材。</small>}</div>
    </div>
  </div>;
}

function SelectedShotVideoPanel({ shot, status, models, modelId, provider, onModel, onGenerate }: { shot: Shot; status?: JobState; models: ModelProfile[]; modelId: string; provider: string; onModel: (model: ModelProfile | undefined) => void; onGenerate: () => void }) {
  const selected = models.find((model) => model.id === modelId);
  const busy = status?.status === "queued" || status?.status === "processing";
  return <div className="selected-shot-video-panel"><div className="selected-shot-video-head"><div><b>当前分镜视频</b><small>{busy ? `正在生成 ${status?.progress || 0}%` : status?.status === "complete" ? "已生成，可预览和下载" : status?.status === "failed" ? "生成失败，可重新提交" : "确认提示词后提交视频生成"}</small></div><label className="field"><span>视频模型</span><select value={modelId} onChange={(event) => onModel(models.find((model) => model.id === event.target.value))}><option value="">{models.length ? "选择已配置视频模型" : "Mock（本地联调）"}</option>{models.map((model) => <option key={model.id} value={model.id}>{model.name} · {model.model}</option>)}</select></label><button className="primary-button" onClick={onGenerate} disabled={busy}>{busy ? `生成中 ${status?.progress || 0}%` : status?.status === "complete" ? "重新生成视频" : "生成选中分镜视频"}</button></div>{status?.status === "complete" && status.outputUrl && <div className="selected-shot-video-preview"><video src={status.outputUrl} controls preload="metadata" /><a className="ghost-button" href={status.outputUrl} download target="_blank" rel="noreferrer">下载视频</a></div>}<small className="muted-line">当前 Provider：{selected?.provider || provider || "mock-video"} · 人物和场景参考图会随分镜关联一起提交</small></div>;
}

function WriterStyleTools({ active, pending, writer, onSavePending, onEdit, onDelete }: { active: boolean; pending: WriterStyle | null; writer?: WriterStyle; onSavePending: () => void; onEdit: (style: WriterStyle) => void; onDelete: (style: WriterStyle) => void }) {
  if (!active) return null;
  const isCustom = Boolean(writer && writer.source === "distilled");
  return <div className="style-pending-bar"><div><b>{pending ? "样本风格卡已生成" : "作家风格卡管理"}</b><small>{pending ? "当前项目已可使用，保存后会进入风格库" : "自定义作家卡支持编辑与删除，内置卡不可删除"}</small></div>{pending ? <button className="primary-button" onClick={onSavePending}><Check size={14} /> 保存为作家风格卡</button> : isCustom && writer ? <div className="style-inline-actions"><button className="ghost-button" onClick={() => onEdit(writer)}><FileText size={13} /> 编辑当前卡</button><button className="icon-danger" onClick={() => onDelete(writer)} title="删除当前作家卡"><Trash2 size={14} /></button></div> : null}</div>;
}

function StyleLibraryManager({ active, writers, directors, onEditWriter, onDeleteWriter, onEditDirector, onDeleteDirector, onCreateDirector }: { active: boolean; writers: WriterStyle[]; directors: DirectorStyle[]; onEditWriter: (style: WriterStyle) => void; onDeleteWriter: (style: WriterStyle) => void; onEditDirector: (style: DirectorStyle) => void; onDeleteDirector: (style: DirectorStyle) => void; onCreateDirector: () => void }) {
  if (!active) return null;
  return <section className="style-manager"><div className="style-manager-heading"><div><b>我的风格卡</b><small>内置卡可复制后编辑；自定义卡支持编辑与删除。</small></div><button className="ghost-button" onClick={onCreateDirector}><Plus size={13} /> 新建导演卡</button></div><div className="style-manager-grid"><div><span className="style-manager-label">作家风格</span>{writers.length ? writers.map((style) => <div className="style-manager-row" key={style.id}><span>{style.name}</span><div><button className="text-button" onClick={() => onEditWriter(style)}><FileText size={12} /> 编辑</button>{!writerStyles.some((builtin) => builtin.id === style.id) && <button className="icon-danger" title="删除作家风格卡" onClick={() => onDeleteWriter(style)}><Trash2 size={13} /></button>}</div></div>) : <small className="muted-line">暂无作家卡。</small>}</div><div><span className="style-manager-label">导演视觉</span>{directors.length ? directors.map((style) => <div className="style-manager-row" key={style.id}><span>{style.name}</span><div><button className="text-button" onClick={() => onEditDirector(style)}><FileText size={12} /> 编辑</button>{!directorStyles.some((builtin) => builtin.id === style.id) && <button className="icon-danger" title="删除导演风格卡" onClick={() => onDeleteDirector(style)}><Trash2 size={13} /></button>}</div></div>) : <small className="muted-line">暂无导演卡。</small>}</div></div></section>;
}

function StyleEditorModal({ editor, onClose, onSave }: { editor: StyleEditorState | null; onClose: () => void; onSave: (style: StyleEditorState) => void }) {
  const [draft, setDraft] = useState<StyleEditorState | null>(editor);
  useEffect(() => setDraft(editor), [editor]);
  if (!draft) return null;
  const isWriter = draft.kind === "writer";
  const writer = isWriter ? draft.style : null;
  const director = !isWriter ? draft.style : null;
  return <div className="preview-modal-backdrop style-editor-backdrop" onClick={onClose}><section className="style-editor-modal" onClick={(event) => event.stopPropagation()}><div className="preview-modal-header"><div><b>{isWriter ? "编辑作家风格卡" : "编辑导演视觉风格卡"}</b><small>修改后会保存到当前账号的风格库</small></div><button className="drawer-close" onClick={onClose}><X size={17} /></button></div><div className="style-editor-form"><label className="field"><span>名称</span><input value={draft.style.name} onChange={(event) => setDraft({ ...draft, style: { ...draft.style, name: event.target.value } } as StyleEditorState)} /></label><label className="field"><span>摘要</span><textarea value={draft.style.summary} onChange={(event) => setDraft({ ...draft, style: { ...draft.style, summary: event.target.value } } as StyleEditorState)} /></label>{isWriter && writer ? <><label className="field full"><span>标签（逗号分隔）</span><input value={writer.tags.join(", ")} onChange={(event) => setDraft({ kind: "writer", style: { ...writer, tags: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) } })} /></label><label className="field full"><span>九轴风格参数（JSON，可修改）</span><textarea className="style-editor-code" value={JSON.stringify(writer.axes, null, 2)} onChange={(event) => { try { const axes = JSON.parse(event.target.value); if (Array.isArray(axes)) setDraft({ kind: "writer", style: { ...writer, axes } }); } catch { /* 等待 JSON 编辑完成 */ } }} /></label><label className="field full"><span>样本摘要 / 风格证据</span><textarea value={writer.sample || ""} onChange={(event) => setDraft({ kind: "writer", style: { ...writer, sample: event.target.value } })} /></label></> : director ? <><label className="field full"><span>视觉提示词 descriptor</span><textarea value={director.descriptor} onChange={(event) => setDraft({ kind: "director", style: { ...director, descriptor: event.target.value } })} /></label><label className="field"><span>色板（逗号分隔）</span><input value={director.palette.join(", ")} onChange={(event) => setDraft({ kind: "director", style: { ...director, palette: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) } })} /></label><label className="field"><span>LoRA 标识</span><input value={director.lora || ""} onChange={(event) => setDraft({ kind: "director", style: { ...director, lora: event.target.value } })} /></label></> : null}</div><div className="style-editor-actions"><button className="ghost-button" onClick={onClose}>取消</button><button className="primary-button" onClick={() => onSave(draft)}><Check size={14} /> 保存风格卡</button></div></section></div>;
}

function TextModelSelector({ models, value, onChange }: { models: ModelProfile[]; value: string; onChange: (value: string) => void }) {
  const selected = models.find((model) => model.id === value);
  return <div className="text-model-selector"><div><b>文本 / vLLM 模型</b><small>创作简报、风格蒸馏、剧本、人物提取和分镜共用当前选择</small></div><select value={value} onChange={(event) => onChange(event.target.value)}><option value="">自动使用默认文本模型</option>{models.map((model) => <option key={model.id} value={model.id}>{model.name} · {model.model}</option>)}</select><span>{selected?.provider || "fallback"}</span></div>;
}

function BriefStyleSelector({ writers, directors, writerId, directorId, onWriter, onDirector }: { writers: WriterStyle[]; directors: DirectorStyle[]; writerId: string; directorId: string; onWriter: (id: string) => void; onDirector: (id: string) => void }) {
  return <div className="brief-style-selector"><div className="column-title"><span>本项目风格</span><small>WRITER × DIRECTOR</small></div><div className="style-columns"><div className="style-column"><div className="column-title"><span>作家风格</span><small>WRITER STYLE</small></div><div className="cards">{writers.map((item) => <button type="button" className={`style-card ${writerId === item.id ? "selected" : ""}`} key={item.id} onClick={() => onWriter(item.id)}><span className="radio">{writerId === item.id && <span />}</span><div className="style-card-main"><div className="style-name">{item.name}<small>{item.era}</small></div><p>{item.summary}</p><div className="tags">{item.tags.slice(0, 4).map((tag) => <em key={tag}>{tag}</em>)}</div></div></button>)}</div></div><div className="style-column"><div className="column-title"><span>导演视觉</span><small>DIRECTOR STYLE</small></div><div className="cards">{directors.map((item) => <button type="button" className={`style-card director-card ${directorId === item.id ? "selected" : ""}`} key={item.id} onClick={() => onDirector(item.id)}><span className="radio">{directorId === item.id && <span />}</span><div className="style-card-main"><div className="style-name">{item.name}<small>视觉配置</small></div><p>{item.summary}</p><div className="palette">{item.palette.map((color) => <i key={color} style={{ background: color }} />)}</div></div></button>)}</div></div></div></div>;
}

function EpisodeCharacterList({ characters, ids, busy, onToggle, onOpenCharacter }: { characters: Character[]; ids: string[]; busy: boolean; onToggle: (id: string) => void; onOpenCharacter: (id: string) => void }) {
  return <section className="episode-character-list"><div><b>本集主要人物</b><small>先确认本集人物，再进入人物资产；项目已有资产可直接复用，不必重复生图</small></div><div className="episode-character-items">{characters.length ? characters.map((character) => <article key={character.id} className={`episode-character-option ${ids.includes(character.id) ? "selected" : ""}`}><label><input type="checkbox" checked={ids.includes(character.id)} disabled={busy} onChange={() => onToggle(character.id)} /><span><strong>{character.name}</strong><code>{character.id}</code><small>{character.role}</small></span></label><button type="button" className="text-button" onClick={() => onOpenCharacter(character.id)}>打开人物资产</button></article>) : <small className="muted-line">当前集还没有识别到人物</small>}</div>{busy && <small className="muted-line">正在同步本集分镜关联…</small>}</section>;
}

function EpisodeCharacterAssociationTools({ characters, ids, busy, onToggle }: { characters: Character[]; ids: string[]; busy: boolean; onToggle: (id: string) => void }) {
  const [selectedId, setSelectedId] = useState("");
  const available = characters.filter((character) => !ids.includes(character.id));
  if (!available.length) return null;
  return <div className="episode-character-add"><div><b>新建关联人物到当前集</b><small>人物仍属于项目人物库，只把使用关系加入当前集</small></div><select className="select-button" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}><option value="">选择项目人物</option>{available.map((character) => <option key={character.id} value={character.id}>{character.name} · {character.role}</option>)}</select><button type="button" className="ghost-button" disabled={busy || !selectedId} onClick={() => { onToggle(selectedId); setSelectedId(""); }}>添加到本集</button></div>;
}

function LegacyCharacterStage({ project, characters, drafts, assets, jobs, profiles, provider, model, preparing, savingId, generatingId, actionError, onProvider, onModel, onDraft, onSave, onGenerate, onExtract, onNext }: { project: GeneratedProject | null; characters: Character[]; drafts: Record<string, Character>; assets: AssetState[]; jobs: Record<string, ImageJobState>; profiles: ModelProfile[]; provider: string; model: string; preparing: boolean; savingId: string | null; generatingId: string | null; actionError: string; onProvider: (value: string) => void; onModel: (value: string) => void; onDraft: (id: string, patch: Partial<Character>) => void; onSave: (character: Character) => void; onGenerate: (character: Character) => void; onExtract: () => void; onNext: () => void }) {
  if (!project) return <section className="panel result-panel"><div className="empty-state"><UserRound size={26} /><p>先从创作简报和风格卡初始化项目。</p></div></section>;
  return <section className="panel result-panel character-panel"><div className="panel-heading"><div><span className="section-index">03 / 人物资产包</span><h3>先固定角色，再生成剧本</h3></div><div className="panel-heading-actions"><button className="ghost-button" onClick={onExtract} disabled={preparing}><RefreshCw size={13} /> {preparing ? "提取中…" : "重新提取人物"}</button><span className="panel-note">提示词可编辑 · 参考图异步生成</span></div></div><div className="asset-package-bar character-model-bar"><div><b><UserRound size={15} /> 项目人物库</b><small>人物描述来自创作简报与 Story Bible；图像模型只负责生成人物参考资产</small></div><div className="character-model-controls"><label className="field"><span>图像渠道</span><select className="select-button" value={provider} onChange={(event) => onProvider(event.target.value)}><option value="mock-image">Mock（本地联调）</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label><label className="field"><span>图像模型</span><select className="select-button" value={model} onChange={(event) => onModel(event.target.value)}><option value="">选择已配置模型</option>{profiles.map((profile) => <option key={profile.id} value={profile.model}>{profile.model}</option>)}</select></label></div></div>{actionError && <p className="error-message asset-message" role="alert">{actionError}</p>}<div className="character-grid">{characters.length ? characters.map((character) => { const draft = drafts[character.id] || character; const job = jobs[character.id]; const reference = assets.find((asset) => asset.id === character.referenceAssetId)?.url; return <article className="character-card" key={character.id}><div className="character-preview">{reference ? <img src={reference} alt={`${character.name}参考图`} /> : <ImageIcon size={30} />}{job && <span className={`status-badge status-${job.status}`}>{job.status === "processing" ? `生成中 ${job.progress}%` : job.status === "queued" ? "排队中" : job.status === "complete" ? "已完成" : "失败"}</span>}</div><div className="character-fields"><label className="field"><span>人物名称</span><input value={draft.name} onChange={(event) => onDraft(character.id, { name: event.target.value })} /></label><label className="field"><span>叙事作用</span><input value={draft.role} onChange={(event) => onDraft(character.id, { role: event.target.value })} /></label><label className="field"><span>年龄 / 性格</span><input value={`${draft.age || ""}${draft.traits ? ` · ${draft.traits}` : ""}`} onChange={(event) => onDraft(character.id, { traits: event.target.value })} placeholder="例如：32 岁 · 克制、敏感" /></label><label className="field full"><span>外貌与服装</span><textarea value={draft.description} onChange={(event) => onDraft(character.id, { description: event.target.value })} /></label><label className="field full"><span>人物生图提示词</span><textarea value={draft.imagePrompt || draft.appearancePrompt || ""} onChange={(event) => onDraft(character.id, { imagePrompt: event.target.value })} /></label><label className="field full"><span>负面提示词</span><textarea value={draft.negativePrompt || ""} onChange={(event) => onDraft(character.id, { negativePrompt: event.target.value })} /></label></div><div className="character-actions"><button className="ghost-button" onClick={() => onSave(draft)} disabled={savingId === character.id}>{savingId === character.id ? "保存中…" : "保存人物"}</button><button className="primary-button" onClick={() => onGenerate(draft)} disabled={generatingId === character.id || savingId === character.id}>{generatingId === character.id ? <><WandSparkles size={14} /> 已提交</> : <><ImageIcon size={14} /> 生成参考图</>}</button></div></article>; }) : <div className="empty-state"><UserRound size={28} /><p>还没有提取到人物，请重新提取。</p></div>}</div><div className="panel-footer"><span className="generated-note"><Check size={14} /> {characters.length} 个角色已纳入项目连续性</span><button className="primary-button" onClick={onNext}><Clapperboard size={16} /> 进入分镜提示词</button></div></section>;
}

const CHARACTER_VIEWS = ["front", "back", "left", "right", "outfit", "accessory"] as const;
const CHARACTER_VIEW_LABEL: Record<string, string> = { front: "正面", back: "背面", left: "左侧", right: "右侧", outfit: "服装", accessory: "配饰" };
function assetMetadata(asset: AssetState) { try { return asset.metadataJson ? JSON.parse(asset.metadataJson) as Record<string, string> : {}; } catch { return {}; } }
function displayText(value: string) {
  return String(value || "")
    .replace(/(?:\\+n|\/n)+/gi, "\n")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function CharacterPromptLibrary({ active, characters, drafts, director, generatingKeys, onGenerate }: { active: boolean; characters: Character[]; drafts: Record<string, Character>; director: DirectorStyle; generatingKeys: Record<string, boolean>; onGenerate: (character: Character, view: string, prompt: string) => void }) {
  const [prompts, setPrompts] = useState<Record<string, string>>({});
  if (!active) return null;
  const promptFor = (character: Character, view: string) => {
    const cached = prompts[`${character.id}:${view}`] || "";
    return /年龄待补充|性格待补充/.test(cached) ? buildCharacterReferencePrompt(character, director.descriptor, view) : (cached || buildCharacterReferencePrompt(character, director.descriptor, view));
  };
  return <section className="panel prompt-library"><div className="panel-heading"><div><span className="section-index">人物提示词</span><h3>先调整每个参考视角，再提交生图</h3></div><span className="panel-note">已自动注入 {director.name} 导演视觉</span></div>{characters.length ? <div className="prompt-library-list">{characters.map((character) => { const draft = drafts[character.id] || character; return <article className="prompt-character" key={character.id}><div className="prompt-character-heading"><div><b>{character.name}</b><small>{character.role} · {director.descriptor}</small></div><span>6 个独立提示词</span></div><div className="prompt-view-grid">{CHARACTER_VIEWS.map((view) => { const key = `${character.id}:${view}`; const pending = Boolean(generatingKeys[key]); return <label className="prompt-view" key={key}><span><b>{CHARACTER_VIEW_LABEL[view]}</b><small>{view}</small></span><textarea value={promptFor(draft, view)} onChange={(event) => setPrompts((current) => ({ ...current, [key]: event.target.value }))} /><button className="ghost-button" onClick={() => onGenerate(draft, view, promptFor(draft, view))} disabled={pending}>{pending ? <><WandSparkles size={12} /> 已提交</> : <><ImageIcon size={12} /> 生成此视角</>}</button></label>; })}</div></article>; })}</div> : <div className="empty-state"><UserRound size={24} /><p>先提取或添加人物，再为每个视角准备提示词。</p></div>}</section>;
}

function ObsoleteCharacterStage({ project, characters, drafts, assets, jobs, profiles, modelId, model, preparing, savingId, generatingKeys, actionError, episodeId, scenes, onModel, onDraft, onSave, onGenerate, onGenerateBundle, onGenerateScene, onExtract, onAdd, onDelete, onNext }: { project: GeneratedProject | null; characters: Character[]; drafts: Record<string, Character>; assets: AssetState[]; jobs: Record<string, ImageJobState>; profiles: ModelProfile[]; modelId: string; model: string; preparing: boolean; savingId: string | null; generatingKeys: Record<string, boolean>; actionError: string; episodeId?: string; scenes: GeneratedProject["scenes"]; onModel: (value: string) => void; onDraft: (id: string, patch: Partial<Character>) => void; onSave: (character: Character) => void; onGenerate: (character: Character, view: string) => void; onGenerateBundle: (character: Character) => void; onGenerateScene: (sceneId: string, view: string) => void; onExtract: () => void; onAdd: () => void; onDelete: (character: Character) => void; onNext: () => void }) {
  const [preview, setPreview] = useState<{ url: string; title: string } | null>(null);
  const [zoom, setZoom] = useState(1);
  const generatingId = Object.keys(generatingKeys).map((key) => key.split(":")[0]).find((id) => id) || null;
  useEffect(() => {
    const stage = document.querySelector<HTMLElement>(".preview-stage");
    if (!stage || !preview) return;
    stage.scrollLeft = 0;
    stage.scrollTop = 0;
    const onWheel = (event: WheelEvent) => { event.preventDefault(); setZoom((value) => Math.min(3, Math.max(0.5, value + (event.deltaY < 0 ? 0.1 : -0.1)))); };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [preview]);
  if (!project) return <section className="panel result-panel"><div className="empty-state"><UserRound size={26} /><p>先从创作简报和风格卡初始化项目。</p></div></section>;
  const currentEpisode = project.episodes?.find((episode) => episode.id === episodeId);
  const associatedIds = new Set(currentEpisode?.characterIds || project.shots.filter((shot) => (shot.episodeNumber || 1) === (currentEpisode?.number || 1)).flatMap((shot) => shot.characterIds || []));
  characters = currentEpisode ? characters.filter((character) => associatedIds.has(character.id)) : characters;
  const characterAssets = (characterId: string) => assets.filter((asset) => { const meta = assetMetadata(asset); return meta.category === "character" && meta.characterId === characterId && Boolean(asset.url); }).sort((left, right) => Number(assetMetadata(right).episodeId === episodeId) - Number(assetMetadata(left).episodeId === episodeId));
  const sceneAssets = (sceneId: string) => assets.filter((asset) => { const meta = assetMetadata(asset); return meta.category === "scene" && meta.sceneId === sceneId && Boolean(asset.url); }).sort((left, right) => Number(assetMetadata(right).episodeId === episodeId) - Number(assetMetadata(left).episodeId === episodeId));
  return <section className="panel result-panel character-panel"><div className="panel-heading"><div><span className="section-index">03 / 人物与场景资产</span><h3>固定连续性参考，再进入剧本</h3></div><div className="panel-heading-actions"><button className="ghost-button" onClick={onExtract} disabled={preparing}><RefreshCw size={13} /> {preparing ? "提取中…" : "重新提取人物"}</button><button className="primary-button" onClick={onAdd}><Plus size={14} /> 添加人物</button></div></div><div className="asset-package-bar character-model-bar"><div><b><ImageIcon size={15} /> 图像模型</b><small>影棚纯色背景 · 多角度参考 · 当前集生成，可复用项目资产</small></div><div className="character-model-controls single-model-control"><label className="field"><span>选择模型</span><select className="select-button" value={modelId} onChange={(event) => onModel(event.target.value)}><option value="">Mock（本地联调）</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name} · {profile.model}</option>)}</select></label><span className="model-current">{model || "Mock"}</span></div></div>{actionError && <p className="error-message asset-message" role="alert">{actionError}</p>}<div className="character-grid">{characters.length ? characters.map((character) => { const draft = drafts[character.id] || character; const variants = characterAssets(character.id); const front = variants.find((asset) => assetMetadata(asset).view === "front") || variants[0]; const job = jobs[character.id]; return <article className="character-card" key={character.id}><button className="character-preview-button" onClick={() => front?.url && (setPreview({ url: front.url, title: `${character.name} · ${CHARACTER_VIEW_LABEL[assetMetadata(front).view || "front"]}` }), setZoom(1))}><div className="character-preview">{front?.url ? <img src={front.url} alt={`${character.name}参考图`} /> : <ImageIcon size={30} />}{job && <span className={`status-badge status-${job.status}`}>{job.status === "processing" ? `生成中 ${job.progress}%` : job.status === "queued" ? "排队中" : job.status === "complete" ? "已完成" : "失败"}</span>}</div></button><div className="asset-view-strip">{CHARACTER_VIEWS.map((view) => { const asset = variants.find((item) => assetMetadata(item).view === view); return <button key={view} className={asset ? "has-asset" : ""} onClick={() => asset?.url ? (setPreview({ url: asset.url!, title: `${character.name} · ${CHARACTER_VIEW_LABEL[view]}` }), setZoom(1)) : onGenerate(draft, view)}>{asset ? "✓ " : "+ "}{CHARACTER_VIEW_LABEL[view]}</button>; })}</div><div className="character-fields"><label className="field"><span>人物名称</span><input value={draft.name} onChange={(event) => onDraft(character.id, { name: event.target.value })} /></label><label className="field"><span>叙事作用</span><input value={draft.role} onChange={(event) => onDraft(character.id, { role: event.target.value })} /></label><label className="field"><span>年龄 / 性格</span><input value={`${draft.age || ""}${draft.traits ? ` · ${draft.traits}` : ""}`} onChange={(event) => onDraft(character.id, { traits: event.target.value })} placeholder="例如：32 岁 · 克制、敏感" /></label><label className="field full"><span>外貌、服装与配饰</span><textarea value={draft.description} onChange={(event) => onDraft(character.id, { description: event.target.value })} /></label><label className="field full"><span>人物生图提示词</span><textarea value={draft.imagePrompt || draft.appearancePrompt || ""} onChange={(event) => onDraft(character.id, { imagePrompt: event.target.value })} /></label><label className="field full"><span>负面提示词</span><textarea value={draft.negativePrompt || ""} onChange={(event) => onDraft(character.id, { negativePrompt: event.target.value })} /></label></div><div className="character-actions"><button className="ghost-button" onClick={() => onSave(draft)} disabled={savingId === character.id}>{savingId === character.id ? "保存中…" : "保存人物"}</button><button className="primary-button" onClick={() => onGenerateBundle(draft)} disabled={generatingId === character.id || savingId === character.id}>{generatingId === character.id ? <><WandSparkles size={14} /> 已提交</> : <><ImageIcon size={14} /> 生成全套参考</>}</button><button className="icon-danger" title="删除人物" onClick={() => onDelete(character)}><Trash2 size={14} /></button></div></article>; }) : <div className="empty-state"><UserRound size={28} /><p>还没有提取到人物，请重新提取或手动添加。</p></div>}</div><div className="scene-asset-section"><div className="scene-asset-heading"><div><b>重要场景资产</b><small>根据当前集场景生成纯色棚拍/设计参考，可被其他集复用</small></div></div><div className="scene-asset-list">{scenes.map((scene) => { const variants = scene.id ? sceneAssets(scene.id) : []; const front = variants[0]; return <div className="scene-asset-row" key={scene.id || scene.number}><div className="scene-asset-thumb">{front?.url ? <button onClick={() => (setPreview({ url: front.url!, title: `${scene.title} · 场景参考` }), setZoom(1))}><img src={front.url} alt={scene.title} /></button> : <ImageIcon size={20} />}</div><div><b>{scene.title}</b><small>{variants.length ? `${variants.length} 个参考视图` : "尚未生成参考资产"}</small></div><div className="scene-asset-actions">{["establishing", "reverse", "detail"].map((view) => <button key={view} onClick={() => scene.id && onGenerateScene(scene.id, view)}>{variants.some((asset) => assetMetadata(asset).view === view) ? "✓ " : "+ "}{view === "establishing" ? "建立" : view === "reverse" ? "反打" : "细节"}</button>)}</div></div>; })}</div></div><div className="panel-footer"><span className="generated-note"><Check size={14} /> {characters.length} 个角色 · {scenes.length} 个场景纳入当前项目</span><button className="primary-button" onClick={onNext}><Clapperboard size={16} /> 进入剧本生成</button></div>{preview && <div className="preview-modal-backdrop" onClick={() => setPreview(null)}><div className="preview-modal" onClick={(event) => event.stopPropagation()}><div className="preview-modal-header"><b>{preview.title}</b><button className="drawer-close" onClick={() => setPreview(null)}><X size={17} /></button></div><div className="preview-stage"><img src={preview.url} alt={preview.title} style={{ transform: `scale(${zoom})` }} /></div><div className="preview-controls"><button className="ghost-button" onClick={() => setZoom((value) => Math.max(.5, value - .25))}>缩小</button><span>{Math.round(zoom * 100)}%</span><button className="ghost-button" onClick={() => setZoom((value) => Math.min(3, value + .25))}>放大</button></div></div></div>}</section>;
}

function CharacterStage({ project, characters, drafts, assets, jobs, profiles, modelId, model, director, preparing, savingId, generatingKeys, actionError, episodeId, scenes, onModel, onDraft, onSave, onGenerate, onGenerateScene, onExtract, onAdd, onDelete, onNext }: { project: GeneratedProject | null; characters: Character[]; drafts: Record<string, Character>; assets: AssetState[]; jobs: Record<string, ImageJobState>; profiles: ModelProfile[]; modelId: string; model: string; director?: DirectorStyle; preparing: boolean; savingId: string | null; generatingKeys: Record<string, boolean>; actionError: string; episodeId?: string; scenes: GeneratedProject["scenes"]; onModel: (value: string) => void; onDraft: (id: string, patch: Partial<Character>) => void; onSave: (character: Character) => void; onGenerate: (character: Character, view: string, prompt: string) => void; onGenerateBundle?: (character: Character) => void; onGenerateScene: (sceneId: string, view: string) => void; onExtract: () => void; onAdd: () => void; onDelete: (character: Character) => void; onNext: () => void }) {
  const [preview, setPreview] = useState<{ url: string; title: string } | null>(null);
  const [selectedViews, setSelectedViews] = useState<Record<string, string>>({});
  const [viewPrompts, setViewPrompts] = useState<Record<string, string>>({});
  if (!director) director = directorStyles[0];
  const activeDirector = director || directorStyles[0];
  if (!project) return <section className="panel result-panel"><div className="empty-state"><UserRound size={26} /><p>先从创作简报和风格卡初始化项目。</p></div></section>;
  const characterAssets = (characterId: string) => assets.filter((asset) => { const meta = assetMetadata(asset); return meta.category === "character" && meta.characterId === characterId && Boolean(asset.url); }).sort((left, right) => Number(assetMetadata(right).episodeId === episodeId) - Number(assetMetadata(left).episodeId === episodeId));
  const sceneAssets = (sceneId: string) => assets.filter((asset) => { const meta = assetMetadata(asset); return meta.category === "scene" && meta.sceneId === sceneId && Boolean(asset.url); }).sort((left, right) => Number(assetMetadata(right).episodeId === episodeId) - Number(assetMetadata(left).episodeId === episodeId));
  const promptFor = (character: Character, view: string) => {
    const cached = viewPrompts[`${character.id}:${view}`] || "";
    return /年龄待补充|性格待补充/.test(cached) ? buildCharacterReferencePrompt(character, activeDirector.descriptor, view) : (cached || buildCharacterReferencePrompt(character, activeDirector.descriptor, view));
  };
  return <section className="panel result-panel character-panel"><div className="panel-heading"><div><span className="section-index">04 / 人物与场景资产</span><h3>选择视角，确认提示词后生成</h3></div><div className="panel-heading-actions"><button className="ghost-button" onClick={onExtract} disabled={preparing}><RefreshCw size={13} /> {preparing ? "提取中…" : "重新提取人物"}</button><button className="primary-button" onClick={onAdd}><Plus size={14} /> 添加人物</button></div></div><div className="asset-package-bar character-model-bar"><div><b><ImageIcon size={15} /> 图像模型</b><small>影棚纯色背景 · 导演风格已注入 · 只生成当前选中视角</small></div><div className="character-model-controls single-model-control"><label className="field"><span>选择模型</span><select className="select-button" value={modelId} onChange={(event) => onModel(event.target.value)}><option value="">请选择已配置图像模型</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name} · {profile.model}</option>)}</select></label><span className="model-current">{model || "未选择图像模型"}</span></div></div>{actionError && <p className="error-message asset-message" role="alert">{actionError}</p>}<div className="character-grid">{characters.length ? characters.map((character) => { const draft = drafts[character.id] || character; const variants = characterAssets(character.id); const selectedView = selectedViews[character.id] || "front"; const selectedAsset = variants.find((asset) => assetMetadata(asset).view === selectedView); const prompt = promptFor(draft, selectedView); const taskKey = `${character.id}:${selectedView}`; const pending = Boolean(generatingKeys[taskKey]); return <article className="character-card" key={character.id}><button className="character-preview-button" onClick={() => selectedAsset?.url && setPreview({ url: selectedAsset.url, title: `${character.name} · ${CHARACTER_VIEW_LABEL[selectedView]}` })}><div className="character-preview">{selectedAsset?.url ? <img src={selectedAsset.url} alt={`${character.name}${CHARACTER_VIEW_LABEL[selectedView]}参考图`} /> : <div className="character-preview-empty"><ImageIcon size={28} /><span>尚未生成{CHARACTER_VIEW_LABEL[selectedView]}参考图</span></div>}{pending && <span className="status-badge status-processing">生成中</span>}</div></button><div className="asset-view-strip">{CHARACTER_VIEWS.map((view) => { const asset = variants.find((item) => assetMetadata(item).view === view); return <button type="button" key={view} className={`${asset ? "has-asset" : ""} ${selectedView === view ? "selected" : ""}`} onClick={() => setSelectedViews((current) => ({ ...current, [character.id]: view }))}>{asset ? "✓ " : ""}{CHARACTER_VIEW_LABEL[view]}</button>; })}</div><div className="character-fields"><label className="field"><span>人物名称</span><input value={draft.name} onChange={(event) => onDraft(character.id, { name: event.target.value })} /></label><label className="field"><span>叙事作用</span><input value={draft.role} onChange={(event) => onDraft(character.id, { role: event.target.value })} /></label><label className="field"><span>年龄 / 性格</span><input value={`${draft.age || ""}${draft.traits ? ` · ${draft.traits}` : ""}`} onChange={(event) => onDraft(character.id, { traits: event.target.value })} placeholder="例如：32 岁 · 克制、敏感" /></label><label className="field full"><span>外貌、服装与配饰</span><textarea value={draft.description} onChange={(event) => onDraft(character.id, { description: event.target.value })} /></label><label className="field full"><span>{CHARACTER_VIEW_LABEL[selectedView]}提示词 <small>已注入 {director.name} · 可编辑</small></span><textarea value={prompt} onChange={(event) => setViewPrompts((current) => ({ ...current, [`${character.id}:${selectedView}`]: event.target.value }))} /></label><label className="field full"><span>负面提示词</span><textarea value={draft.negativePrompt || ""} onChange={(event) => onDraft(character.id, { negativePrompt: event.target.value })} /></label></div><div className="character-actions"><button className="ghost-button" onClick={() => onSave(draft)} disabled={savingId === character.id}>{savingId === character.id ? "保存中…" : "保存人物"}</button><button className="primary-button" onClick={() => onGenerate(draft, selectedView, prompt)} disabled={pending || savingId === character.id}>{pending ? <><WandSparkles size={14} /> 已提交</> : <><ImageIcon size={14} /> 生成当前视角</>}</button><button className="icon-danger" title="删除人物" onClick={() => onDelete(character)}><Trash2 size={14} /></button></div></article>; }) : <div className="empty-state"><UserRound size={28} /><p>还没有提取到人物，请重新提取或手动添加。</p></div>}</div><div className="scene-asset-section"><div className="scene-asset-heading"><div><b>重要场景资产</b><small>根据当前集场景生成参考，可被其他集复用</small></div></div><div className="scene-asset-list">{scenes.map((scene) => { const variants = scene.id ? sceneAssets(scene.id) : []; const front = variants[0]; return <div className="scene-asset-row" key={scene.id || scene.number}><div className="scene-asset-thumb">{front?.url ? <button onClick={() => setPreview({ url: front.url!, title: `${scene.title} · 场景参考` })}><img src={front.url} alt={scene.title} /></button> : <ImageIcon size={20} />}</div><div><b>{scene.title}</b><small>{variants.length ? `${variants.length} 个参考视图` : "尚未生成参考资产"}</small></div><div className="scene-asset-actions">{["establishing", "reverse", "detail"].map((view) => <button key={view} onClick={() => scene.id && onGenerateScene(scene.id, view)}>{variants.some((asset) => assetMetadata(asset).view === view) ? "✓ " : "+ "}{view === "establishing" ? "建立" : view === "reverse" ? "反打" : "细节"}</button>)}</div></div>; })}</div></div><div className="panel-footer"><span className="generated-note"><Check size={14} /> {characters.length} 个角色 · {scenes.length} 个场景纳入当前项目</span><button className="primary-button" onClick={onNext}><Clapperboard size={16} /> 进入分镜提示词</button></div><ImagePreviewModal preview={preview} onClose={() => setPreview(null)} /></section>;
}

function WorkflowBar({ steps, activeStep, project, onSelect }: { steps: { id: Step; label: string; icon: typeof Clapperboard }[]; activeStep: Step; project: GeneratedProject | null; onSelect: (step: Step) => void }) {
  const activeIndex = steps.findIndex((step) => step.id === activeStep);
  return <nav className="workflow-topbar" aria-label="创作阶段"><div className="workflow"><div className="step-line" />{steps.map((step, index) => { const Icon = step.icon; const active = activeStep === step.id; const done = activeIndex > index || Boolean(project && (step.id === "brief" || step.id === "style")); return <button type="button" key={step.id} onClick={() => onSelect(step.id)} className={`step ${active ? "current" : ""} ${done ? "done" : ""}`}><span className="step-icon">{done && !active ? <Check size={14} /> : <Icon size={15} />}</span><span><b>0{index + 1}</b>{step.label}</span></button>; })}</div></nav>;
}

const SHOT_STATUS_LABEL: Record<ShotStatus, string> = {
  draft: "草稿",
  queued: "排队中",
  processing: "生成中",
  complete: "已完成",
  failed: "失败",
};

export default function Home() {
  const [activeStep, setActiveStepState] = useState<Step>("brief");
  const setActiveStep = (step: Step) => {
    if (step === "style" && activeStep === "brief") {
      void continueFromBrief();
      return;
    }
    setActiveStepState(step);
  };
  const [writerId, setWriterId] = useState("luxun");
  const [directorId, setDirectorId] = useState("wong-kar-wai");
  const [topic, setTopic] = useState("一个人决定在周五下午说出真话");
  const [scriptLength, setScriptLength] = useState<ScriptLength>("short");
  const [narrativePerspective, setNarrativePerspective] = useState<NarrativePerspective>("third-person");
  const [projectFormat, setProjectFormat] = useState<ProjectFormat>("single");
  const [episodeCount, setEpisodeCount] = useState(1);
  const [wordsPerEpisode, setWordsPerEpisode] = useState(500);
  const [storyBible, setStoryBible] = useState("");
  useEffect(() => {
    if (topic.length > 500) setTopic(topic.slice(0, 500));
  }, [topic]);
  const [project, setProject] = useState<GeneratedProject | null>(null);
  const [customWriter, setCustomWriter] = useState<WriterStyle | null>(null);
  const [savedWriters, setSavedWriters] = useState<WriterStyle[]>([]);
  const [savedDirectors, setSavedDirectors] = useState<typeof directorStyles>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [trace, setTrace] = useState<TraceEntry[]>([]);
  const [jobStatus, setJobStatus] = useState<Record<string, JobState>>({});
  const [isDistilling, setIsDistilling] = useState(false);
  const [isQueuing, setIsQueuing] = useState(false);
  const [queuedCount, setQueuedCount] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const generatingRef = useRef(false);
  const [generationError, setGenerationError] = useState("");
  const [isLoadingProject, setIsLoadingProject] = useState(false);
  const [user, setUser] = useState<{ id: string; email: string; name: string; role: string } | null>(null);
  const [usage, setUsage] = useState<UsageState | null>(null);
  const [retakingShotId, setRetakingShotId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [styleMessage, setStyleMessage] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const [styleToolsOpen, setStyleToolsOpen] = useState(false);
  const [showAllProjects, setShowAllProjects] = useState(false);
  const projectListRef = useRef<HTMLDivElement>(null);
  const [styleEditor, setStyleEditor] = useState<StyleEditorState | null>(null);
  const [assetToolsOpen, setAssetToolsOpen] = useState(false);
  const [pendingWriterStyle, setPendingWriterStyle] = useState<WriterStyle | null>(null);
  const [videoProvider, setVideoProvider] = useState("mock-video");
  const [videoModelId, setVideoModelId] = useState("");
  const [videoModels, setVideoModels] = useState<ModelProfile[]>([]);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);
  const [assets, setAssets] = useState<AssetState[]>([]);
  const [assetKind, setAssetKind] = useState("image");
  const [assetName, setAssetName] = useState("");
  const [assetUrl, setAssetUrl] = useState("");
  const [isImportingAsset, setIsImportingAsset] = useState(false);
  const [isGeneratingAssetPackage, setIsGeneratingAssetPackage] = useState(false);
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);
  const [isUpdatingEpisodeCharacters, setIsUpdatingEpisodeCharacters] = useState(false);
  const [shotDraft, setShotDraft] = useState<Partial<Shot>>({});
  const [isSavingShot, setIsSavingShot] = useState(false);
  const [activeEpisodeNumber, setActiveEpisodeNumber] = useState(1);
  const [generatingEpisodeId, setGeneratingEpisodeId] = useState<string | null>(null);
  const [isPreparingCharacters, setIsPreparingCharacters] = useState(false);
  const [isExtractingCharacters, setIsExtractingCharacters] = useState(false);
  const [characterDrafts, setCharacterDrafts] = useState<Record<string, Character>>({});
  const [imageJobs, setImageJobs] = useState<Record<string, ImageJobState>>({});
  const [savingCharacterId, setSavingCharacterId] = useState<string | null>(null);
  const [generatingImageKeys, setGeneratingImageKeys] = useState<Record<string, boolean>>({});
  const [imageProvider, setImageProvider] = useState("");
  const [imageModel, setImageModel] = useState("");
  const [imageProfiles, setImageProfiles] = useState<ModelProfile[]>([]);
  const [textModelId, setTextModelId] = useState("");
  const [textModels, setTextModels] = useState<ModelProfile[]>([]);
  const workspaceProjectIdRef = useRef<string | null>(null);
  const projectLoadRequestRef = useRef(0);

  const writerOptions = useMemo(() => Array.from(new Map([...(pendingWriterStyle ? [pendingWriterStyle] : []), ...(customWriter ? [customWriter] : []), ...savedWriters, ...writerStyles].map((style) => [style.id, style])).values()), [customWriter, pendingWriterStyle, savedWriters]);
  const directorOptions = useMemo(() => Array.from(new Map([...savedDirectors, ...directorStyles].map((style) => [style.id, style])).values()), [savedDirectors]);
  const writer = useMemo(() => writerOptions.find((item) => item.id === writerId) ?? writerOptions[0], [writerId, writerOptions]);
  const director = useMemo(() => directorOptions.find((item) => item.id === directorId) ?? directorOptions[0], [directorId, directorOptions]);
  const completedShots = useMemo(() => Object.values(jobStatus).filter((state) => state.status === "complete").length, [jobStatus]);
  const activeEpisode = project?.episodes?.find((episode) => episode.number === activeEpisodeNumber);
  const activeEpisodeId = activeEpisode?.id;
  const episodeIsPlanned = Boolean(project?.projectFormat === "series" && activeEpisode && activeEpisode.status !== "draft");
  const activeScenes = useMemo(() => {
    if (!project) return [];
    return project.scenes.filter((scene) => activeEpisodeNumber === 1 ? !scene.episodeNumber || scene.episodeNumber === 1 : scene.episodeNumber === activeEpisodeNumber);
  }, [project, activeEpisodeNumber]);
  const activeShots = useMemo(() => {
    if (!project) return [];
    return project.shots.filter((shot) => activeEpisodeNumber === 1 ? !shot.episodeNumber || shot.episodeNumber === 1 : shot.episodeNumber === activeEpisodeNumber);
  }, [project, activeEpisodeNumber]);
  const activeEpisodeScript = displayText(activeEpisode?.script || (activeEpisodeNumber === 1 ? project?.script : "") || "");
  const activeEpisodeLogline = activeEpisode?.logline || (activeEpisodeNumber === 1 ? project?.logline : "") || "";
  const activeCompletedShots = useMemo(() => activeShots.filter((shot) => shotStatusOf(shot.id, shot.status) === "complete").length, [activeShots, jobStatus]);
  const characters = project?.characters || [];
  const continuityCharacterIds = activeEpisode?.continuity?.characterState?.map((state) => characters.find((character) => character.name === state.name)?.id).filter((id): id is string => Boolean(id)) || [];
  const activeEpisodeCharacterIds = Array.from(new Set(activeEpisode?.characterIds?.length ? activeEpisode.characterIds : activeShots.flatMap((shot) => shot.characterIds || []).concat(continuityCharacterIds)));
  const visibleEpisodeCharacters = activeEpisode ? characters.filter((character) => activeEpisodeCharacterIds.includes(character.id)) : characters;

  function shotTitle(shot: Shot, index: number, shots: Shot[]) {
    const title = shot.title?.trim();
    if (title && !/^(?:分镜|shot)\s*\d*$/i.test(title) && !/[·・]\s*分镜\s*$/i.test(title) && !shots.slice(0, index).some((item) => item.title?.trim().toLocaleLowerCase() === title.toLocaleLowerCase())) return title;
    const sceneTitle = project?.scenes.find((scene) => scene.number === shot.scene)?.title || `场景 ${shot.scene}`;
    const number = shots.slice(0, index + 1).filter((item) => item.scene === shot.scene).length;
    return `${sceneTitle} · 镜头 ${number}`;
  }

  useEffect(() => {
    const shots = activeShots;
    if (!shots.length) { setSelectedShotId(null); setShotDraft({}); return; }
    const index = Math.max(0, shots.findIndex((shot) => shot.id === selectedShotId));
    const shot = shots[index];
    setSelectedShotId(shot.id);
    setShotDraft({ ...shot, title: shotTitle(shot, index, shots) });
  }, [project?.id, activeShots, activeEpisodeNumber]);

  useEffect(() => {
    if (!selectedShotId || shotDraft.characterIds || shotDraft.referenceAssetIds) return;
    const shot = activeShots.find((item) => item.id === selectedShotId);
    if (shot) selectShot(shot);
  }, [selectedShotId]);

  useEffect(() => {
    if (!project?.characters?.length) return;
    setCharacterDrafts((current) => Object.fromEntries(project.characters!.map((character) => [character.id, { ...character, ...(current[character.id] || {}) }])));
  }, [project?.id, project?.characters]);

  useEffect(() => {
    setCharacterDrafts((current) => {
      let changed = false;
      const next = Object.fromEntries(Object.entries(current).map(([id, character]) => {
        const age = character.age === "年龄待补充" ? "" : character.age;
        const traits = character.traits === "性格待补充" ? "" : character.traits;
        if (age !== character.age || traits !== character.traits) changed = true;
        return [id, { ...character, age, traits }];
      }));
      return changed ? next : current;
    });
  }, [project?.id]);

  useEffect(() => {
    if (activeStep === "characters") setActionError("");
  }, [activeStep]);

  async function loadProjects() {
    try {
      const response = await fetch("/api/projects");
      if (response.ok) {
        const data = await response.json();
        setProjects(Array.isArray(data.projects) ? data.projects : []);
      }
    } catch { /* 忽略列表加载失败 */ }
  }

  async function loadStyles() {
    try {
      const response = await fetch("/api/styles");
      if (!response.ok) return;
      const data = await response.json();
      if (Array.isArray(data.writers)) setSavedWriters(data.writers as WriterStyle[]);
      if (Array.isArray(data.directors)) setSavedDirectors(data.directors);
    } catch { /* static style cards remain available */ }
  }

  async function continueFromBrief() {
    if (isLoadingProject || isGenerating || !topic.trim()) {
      if (!topic.trim()) setGenerationError("请先填写故事主题");
      return;
    }
    setIsLoadingProject(true);
    setGenerationError("");
    const payload = { writerId, directorId, topic, scriptLength, narrativePerspective, format: projectFormat, episodeCount, wordsPerEpisode, storyBible };
    try {
      const response = await fetch(project?.id ? `/api/projects/${project.id}` : "/api/projects/draft", {
        method: project?.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => null) as { project?: GeneratedProject; error?: string } | null;
      if (!response.ok || !data?.project) throw new Error(data?.error || "保存创作简报失败");
      workspaceProjectIdRef.current = data.project.id || null;
      setProject(data.project);
      setActiveEpisodeNumber(1);
      setActiveStep("script");
      setTrace([]);
      setActionError("");
      void loadProjects();
      if (data.project.id) { void loadAssets(data.project); void loadVideoJobs(data.project); }
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : "保存创作简报失败");
    } finally {
      setIsLoadingProject(false);
    }
  }

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => { if (d.user) { setUser(d.user); void loadProjects(); void loadStyles(); } else { window.location.href = "/login"; } }).catch(() => { window.location.href = "/login"; });
  }, []);

  useEffect(() => {
    if (project?.id) void loadVideoJobs(project);
    if (project?.id) void loadAssets(project);
    if (project?.id) void loadImageJobs(project.id);
  }, [project?.id, activeEpisodeId]);

  useEffect(() => {
    fetch("/api/model-catalog?kind=video").then((response) => response.ok ? response.json() : null).then((data: { models?: ModelProfile[] } | null) => {
      const models = data?.models || [];
      setVideoModels(models);
      if (models.length && !videoModelId) {
        setVideoModelId(models[0].id);
        setVideoProvider(models[0].provider || "mock-video");
      }
    }).catch(() => { /* 未配置视频模型时保留 Mock 联调 */ });
  }, []);

  useEffect(() => {
    if (activeStep === "shots") void syncActiveEpisodeAssetReferences().catch(() => { /* 资产同步失败时保留手动关联入口 */ });
  }, [activeStep, activeEpisodeId, assets.length]);

  useEffect(() => {
    if (activeStep !== "shots") return;
    const strip = document.querySelector<HTMLElement>(".shot-strip");
    if (!strip) return;
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX) || strip.scrollWidth <= strip.clientWidth) return;
      event.preventDefault();
      strip.scrollBy({ left: event.deltaY, behavior: "smooth" });
    };
    strip.addEventListener("wheel", onWheel, { passive: false });
    return () => strip.removeEventListener("wheel", onWheel);
  }, [activeStep, activeShots.length]);

  useEffect(() => {
    fetch("/api/model-catalog?kind=image").then((response) => response.ok ? response.json() : null).then((data: { models?: ModelProfile[] } | null) => {
      const profiles = data?.models || [];
      setImageProfiles(profiles);
      if (profiles.length && !imageProvider) { setImageProvider(profiles[0].id); setImageModel(profiles[0].model); }
    }).catch(() => { /* 使用 Mock 继续联调 */ });
  }, [imageProvider]);

  useEffect(() => {
    fetch("/api/model-catalog?kind=text").then((response) => response.ok ? response.json() : null).then((data: { models?: ModelProfile[] } | null) => {
      const models = data?.models || [];
      setTextModels(models);
      if (models.length && !textModelId) setTextModelId(models[0].id);
    }).catch(() => { /* 未配置文本模型时由后端回退本地管线 */ });
  }, [textModelId]);

  useEffect(() => {
    if (!styleToolsOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setStyleToolsOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [styleToolsOpen]);

  useEffect(() => {
    if (!assetToolsOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setAssetToolsOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [assetToolsOpen]);

  async function generate() {
    if (generatingRef.current) return;
    generatingRef.current = true;
    setIsGenerating(true);
    setGenerationError("");
    try {
      const response = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: project?.id, writerId, directorId, topic, scriptLength, narrativePerspective, format: projectFormat, episodeCount, wordsPerEpisode, storyBible, modelId: textModelId || undefined, writerStyle: writer.source === "distilled" ? writer : undefined, directorStyle: director }) });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message = data && typeof data === "object" && "error" in data && typeof data.error === "string" ? data.error : `生成失败（HTTP ${response.status}）`;
        throw new Error(message);
      }
      if (!data || typeof data !== "object" || !("project" in data) || !data.project || typeof data.project !== "object" || !("id" in data.project) || typeof data.project.id !== "string") {
        throw new Error("生成服务返回的数据无效，请稍后重试");
      }
      const result = data as { project: GeneratedProject; trace?: TraceEntry[] };
      workspaceProjectIdRef.current = result.project.id || null;
      setProject(result.project);
      setTopic(result.project.topic || topic);
      setActiveEpisodeNumber(1);
      void loadUsage(result.project.id!);
      setTrace(Array.isArray(result.trace) ? result.trace : []);
      setJobStatus({});
      setQueuedCount(0);
      setActiveStep("script");
      void loadProjects();
    } catch (error) {
      setGenerationError(error instanceof TypeError ? "网络连接失败，请检查网络后重试" : error instanceof Error ? error.message : "生成失败，请稍后重试");
    } finally {
      generatingRef.current = false;
      setIsGenerating(false);
    }
  }

  function clearProjectWorkspace() {
    workspaceProjectIdRef.current = null;
    setProject(null);
    setAssets([]);
    setImageJobs({});
    setCharacterDrafts({});
    setGeneratingImageKeys({});
    setJobStatus({});
    setTrace([]);
    setUsage(null);
    setShotDraft({});
    setSelectedShotId(null);
    setActiveEpisodeNumber(1);
    setQueuedCount(0);
    setActionError("");
    setGenerationError("");
    setIsUpdatingEpisodeCharacters(false);
  }

  async function openProject(id: string) {
    const requestId = projectLoadRequestRef.current + 1;
    projectLoadRequestRef.current = requestId;
    workspaceProjectIdRef.current = null;
    clearProjectWorkspace();
    setIsLoadingProject(true);
    try {
      const response = await fetch(`/api/projects/${id}`);
      if (response.ok) {
        const data = await response.json();
        if (projectLoadRequestRef.current !== requestId) return;
        workspaceProjectIdRef.current = id;
        setProject(data.project);
        setTopic(data.project.topic || "");
        if (data.project.writerStyleId) setWriterId(data.project.writerStyleId);
        if (data.project.directorStyleId) setDirectorId(data.project.directorStyleId);
        setProjectFormat(data.project.projectFormat === "series" ? "series" : "single");
        setEpisodeCount(data.project.episodeCount || 1);
        setWordsPerEpisode(data.project.wordsPerEpisode || 500);
        setScriptLength(data.project.scriptLength || "short");
        setNarrativePerspective(data.project.narrativePerspective || "third-person");
        setStoryBible(data.project.storyBible || "");
        void loadUsage(id);
        setActiveStep(data.project.script ? "script" : data.project.characters?.length ? "characters" : "brief");
        await Promise.all([loadVideoJobs(data.project), loadAssets(data.project)]);
      }
    } finally {
      if (projectLoadRequestRef.current === requestId) setIsLoadingProject(false);
    }
  }

  async function generateEpisode() {
    const regenerate = Boolean(activeEpisode?.status === "draft" && activeEpisodeScript);
    if (!project?.id || !activeEpisode || (activeEpisode.status !== "planned" && !regenerate) || generatingEpisodeId) return;
    setGeneratingEpisodeId(activeEpisode.id);
    setActionError("");
    try {
      const response = await fetch(`/api/projects/${project.id}/episodes/${activeEpisode.id}/generate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modelId: textModelId || undefined, regenerate }) });
      const data = await response.json().catch(() => null) as { project?: GeneratedProject; error?: string } | null;
      if (!response.ok || !data?.project) throw new Error(data?.error || "生成本集失败");
      setProject(data.project);
      setActiveStep("script");
      setActionError("");
      void loadProjects();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "生成本集失败");
    } finally {
      setGeneratingEpisodeId(null);
    }
  }

  async function loadVideoJobs(currentProject: GeneratedProject | null) {
    if (!currentProject?.id) return;
    if (workspaceProjectIdRef.current && workspaceProjectIdRef.current !== currentProject.id) return;
    setIsLoadingJobs(true);
    try {
      const response = await fetch(`/api/video/jobs?projectId=${encodeURIComponent(currentProject.id)}`);
      if (!response.ok) return;
      const data = await response.json() as { jobs?: { id: string; shotId: string; status: ShotStatus; progress: number; outputUrl?: string }[] };
      const states: Record<string, JobState> = {};
      const active: { shotId: string; jobId: string }[] = [];
      for (const job of data.jobs ?? []) {
        states[job.shotId] = { status: job.status, progress: job.progress ?? 0, outputUrl: job.outputUrl };
        if (job.status === "queued" || job.status === "processing") active.push({ shotId: job.shotId, jobId: job.id });
      }
      if (workspaceProjectIdRef.current !== currentProject.id) return;
      setJobStatus(states);
      setQueuedCount(Object.keys(states).length);
      if (active.length) void pollJobs(active, currentProject.id);
    } finally { setIsLoadingJobs(false); }
  }

  async function loadUsage(id: string) {
    try {
      const response = await fetch(`/api/projects/${id}/usage`);
      if (response.ok && workspaceProjectIdRef.current === id) setUsage((await response.json()).usage as UsageState);
    } catch { /* usage is supplementary */ }
  }

  async function loadAssets(currentProject: GeneratedProject | string | null) {
    const projectId = typeof currentProject === "string" ? currentProject : currentProject?.id;
    if (!projectId || (workspaceProjectIdRef.current && workspaceProjectIdRef.current !== projectId)) return;
    const response = await fetch(`/api/projects/${projectId}/assets`);
    if (response.ok && workspaceProjectIdRef.current === projectId) { const data = await response.json(); setAssets(Array.isArray(data.assets) ? data.assets : []); }
  }

  async function loadImageJobs(projectId: string) {
    try {
      if (workspaceProjectIdRef.current && workspaceProjectIdRef.current !== projectId) return;
      const response = await fetch(`/api/projects/${projectId}/image-jobs`);
      if (!response.ok) return;
      const data = await response.json() as { jobs?: ImageJobState[] };
      const next: Record<string, ImageJobState> = {};
      for (const job of data.jobs || []) {
        if (job.characterId && !next[job.characterId]) next[job.characterId] = job;
        if (job.sceneId && job.view && !next[`scene:${job.sceneId}:${job.view}`]) next[`scene:${job.sceneId}:${job.view}`] = job;
      }
      if (workspaceProjectIdRef.current !== projectId) return;
      setImageJobs(next);
      const completedKeys = (data.jobs || [])
        .filter((job) => job.view && (job.status === "complete" || job.status === "failed"))
        .map((job) => job.characterId ? `${job.characterId}:${job.view}` : job.sceneId ? `scene:${job.sceneId}:${job.view}` : "")
        .filter(Boolean);
      if (completedKeys.length) setGeneratingImageKeys((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !completedKeys.includes(key))));
      if (Object.values(next).some((job) => job.status === "queued" || job.status === "processing")) {
        window.setTimeout(() => void loadImageJobs(projectId), 1600);
        const refreshed = await fetch(`/api/projects/${projectId}`);
        if (refreshed.ok && workspaceProjectIdRef.current === projectId) setProject((await refreshed.json()).project as GeneratedProject);
      }
      if (Object.values(next).some((job) => job.status === "complete")) {
        void loadAssets(projectId);
        const refreshed = await fetch(`/api/projects/${projectId}`);
        if (refreshed.ok && workspaceProjectIdRef.current === projectId) setProject((await refreshed.json()).project as GeneratedProject);
      }
    } catch { /* 状态轮询失败不影响当前编辑 */ }
  }

  async function prepareCharacters() {
    if (activeStep === "style") {
      setIsPreparingCharacters(true);
      try { await generate(); } finally { setIsPreparingCharacters(false); }
      return;
    }
    setIsPreparingCharacters(true);
    setActionError("");
    try {
      let currentProject = project;
      if (!currentProject?.id) {
        const response = await fetch("/api/projects/draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ writerId, directorId, topic, scriptLength, narrativePerspective, format: projectFormat, episodeCount, wordsPerEpisode, storyBible }) });
        const data = await response.json() as { project?: GeneratedProject; error?: string };
        if (!response.ok || !data.project) throw new Error(data.error || "项目初始化失败");
        currentProject = data.project;
        workspaceProjectIdRef.current = data.project.id || null;
        setProject(currentProject);
        void loadProjects();
      }
      const response = await fetch(`/api/projects/${currentProject.id}/characters/extract`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modelId: textModelId || undefined, episodeId: activeEpisodeId || undefined }) });
      const data = await response.json() as { characters?: Character[]; episodeCharacterIds?: string[]; error?: string };
      if (!response.ok || !data.characters) throw new Error(data.error || "人物提取失败");
      setProject((value) => value ? { ...value, characters: data.characters, episodes: value.episodes?.map((episode) => episode.id === activeEpisodeId && data.episodeCharacterIds ? { ...episode, characterIds: data.episodeCharacterIds } : episode) } : value);
      setActiveStep("characters");
    } catch (error) { setActionError(error instanceof Error ? error.message : "人物提取失败"); }
    finally { setIsPreparingCharacters(false); }
  }

  async function saveCharacter(character: Character) {
    if (!project?.id) return;
    setSavingCharacterId(character.id);
    try {
      const { id: _id, imageStatus: _status, referenceAssetId: _asset, ...editable } = character;
      const response = await fetch(`/api/projects/${project.id}/characters/${character.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editable) });
      const data = await response.json() as { character?: Character; error?: string };
      if (!response.ok || !data.character) throw new Error(data.error || "人物保存失败");
      setProject((value) => value ? { ...value, characters: value.characters?.map((item) => item.id === character.id ? { ...item, ...data.character } : item) } : value);
      setCharacterDrafts((value) => ({ ...value, [character.id]: { ...character, ...data.character } }));
    } catch (error) { setActionError(error instanceof Error ? error.message : "人物保存失败"); }
    finally { setSavingCharacterId(null); }
  }

  async function generateCharacterImage(character: Character, view = "front", promptOverride?: string) {
    if (!project?.id) return;
    if (!imageProvider || !imageModel) { setActionError("请先在设置中配置并选择图像模型"); return; }
    const taskKey = `${character.id}:${view}`;
    let accepted = false;
    setGeneratingImageKeys((current) => ({ ...current, [taskKey]: true }));
    setActionError("");
    try {
      const viewPrompt = promptOverride || buildCharacterReferencePrompt(character, director.descriptor, view);
      const response = await fetch(`/api/projects/${project.id}/characters/${character.id}/image`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modelId: imageProvider || undefined, model: imageModel, view, episodeId: activeEpisodeId, prompt: viewPrompt, negativePrompt: character.negativePrompt }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "图像任务提交失败");
      accepted = true;
      void loadImageJobs(project.id);
    } catch (error) { setActionError(error instanceof Error ? error.message : "图像任务提交失败"); }
    finally { if (!accepted) setGeneratingImageKeys((current) => { const next = { ...current }; delete next[taskKey]; return next; }); }
  }

  async function generateCharacterBundle(character: Character) {
    await Promise.all(["front", "back", "left", "right", "outfit", "accessory"].map((view) => generateCharacterImage(character, view)));
  }

  async function generateSceneImage(sceneId: string, view: string, prompt?: string) {
    if (!project?.id) return;
    if (!imageProvider || !imageModel) { setActionError("请先在设置中配置并选择图像模型"); return; }
    const taskKey = `scene:${sceneId}:${view}`;
    setGeneratingImageKeys((current) => ({ ...current, [taskKey]: true }));
    let accepted = false;
    try {
      const response = await fetch(`/api/projects/${project.id}/scenes/${sceneId}/image`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modelId: imageProvider || undefined, model: imageModel, view, episodeId: activeEpisodeId, prompt }) });
      if (!response.ok) { const data = await response.json().catch(() => null) as { error?: string } | null; throw new Error(data?.error || "场景资产任务提交失败"); }
      accepted = true;
      setActionError("场景资产已提交，正在后台生成");
      void loadImageJobs(project.id);
    } catch (error) { setActionError(error instanceof Error ? error.message : "场景资产任务提交失败"); }
    finally { if (!accepted) setGeneratingImageKeys((current) => { const next = { ...current }; delete next[taskKey]; return next; }); }
  }

  async function addCharacter() {
    if (!project?.id) return;
    const response = await fetch(`/api/projects/${project.id}/characters`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "新人物", role: "待定义", description: "", wardrobe: "", imagePrompt: "影棚纯色背景，人物正面定妆参考图" }) });
    const data = await response.json() as { character?: Character; error?: string };
    if (!response.ok || !data.character) { setActionError(data.error || "添加人物失败"); return; }
    setProject((value) => value ? { ...value, characters: [...(value.characters || []), data.character!] } : value);
  }

  async function deleteCharacter(character: Character) {
    if (!project?.id || !window.confirm(`删除人物“${character.name}”？`)) return;
    const response = await fetch(`/api/projects/${project.id}/characters/${character.id}`, { method: "DELETE" });
    if (!response.ok) { const data = await response.json().catch(() => null) as { error?: string } | null; setActionError(data?.error || "删除人物失败"); return; }
    setProject((value) => value ? { ...value, characters: value.characters?.filter((item) => item.id !== character.id) } : value);
  }

  async function importAsset() {
    if (!project?.id || !assetName.trim() || !assetUrl.trim() || isImportingAsset) return;
    setIsImportingAsset(true);
    setActionError("");
    try {
      const response = await fetch(`/api/projects/${project.id}/assets`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: assetName.trim(), url: assetUrl.trim(), kind: assetKind, episodeId: activeEpisode?.id }) });
      const data = await response.json().catch(() => null) as { asset?: AssetState; error?: string } | null;
      if (!response.ok || !data?.asset) throw new Error(data?.error || "导入素材失败");
      setAssets((current) => [data.asset!, ...current]);
      setAssetName("");
      setAssetUrl("");
    } catch (error) { setActionError(error instanceof Error ? error.message : "导入素材失败"); }
    finally { setIsImportingAsset(false); }
  }

  async function generateAssetPackage() {
    if (!project?.id || isGeneratingAssetPackage) return;
    setIsGeneratingAssetPackage(true);
    setActionError("");
    try {
      const response = await fetch(`/api/projects/${project.id}/assets/package`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = await response.json().catch(() => null) as { assets?: AssetState[]; createdCount?: number; error?: string } | null;
      if (!response.ok || !data?.assets) throw new Error(data?.error || "资产包生成失败");
      setAssets(data.assets);
      setActionError(data.createdCount ? `已生成 ${data.createdCount} 项资产清单，可继续补充图片或视频地址。` : "资产包已是最新状态。");
    } catch (error) { setActionError(error instanceof Error ? error.message : "资产包生成失败"); }
    finally { setIsGeneratingAssetPackage(false); }
  }

  function inferredShotCharacterIds(shot: Shot) {
    const text = [shot.title, shot.imagePrompt, shot.videoPrompt, shot.characterContext].filter(Boolean).join(" ");
    const mentioned = characters.filter((character) => character.name && text.includes(character.name)).map((character) => character.id);
    if (mentioned.length) return mentioned;
    const scene = activeScenes.find((item) => item.number === shot.scene);
    const sceneText = [scene?.title, scene?.content].filter(Boolean).join(" ");
    const sceneMentioned = characters.filter((character) => character.name && sceneText.includes(character.name)).map((character) => character.id);
    return sceneMentioned.length ? sceneMentioned : (activeEpisodeCharacterIds.length === 1 ? activeEpisodeCharacterIds : []);
  }

  async function ensureShotAssociations(shot: Shot, draft: Partial<Shot>) {
    if (!project?.id) return;
    const characterIds = draft.characterIds?.length ? draft.characterIds : inferredShotCharacterIds(shot);
    const sceneId = activeScenes.find((scene) => scene.number === shot.scene)?.id;
    const autoAssetIds = assets.filter((asset) => {
      if (!asset.url) return false;
      const meta = assetMetadata(asset);
      return (meta.category === "character" && characterIds.includes(meta.characterId || "")) || (meta.category === "scene" && meta.sceneId === sceneId);
    }).map((asset) => asset.id);
    const referenceAssetIds = Array.from(new Set([...(draft.referenceAssetIds || []), ...autoAssetIds]));
    const needsUpdate = JSON.stringify(characterIds) !== JSON.stringify(shot.characterIds || []) || referenceAssetIds.some((id) => !(shot.referenceAssetIds || []).includes(id));
    if (!needsUpdate) return;
    const response = await fetch(`/api/projects/${project.id}/shots/${shot.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ characterIds, referenceAssetIds }) });
    const data = await response.json().catch(() => null) as { project?: GeneratedProject; error?: string } | null;
    if (!response.ok || !data?.project) throw new Error(data?.error || "自动关联人物和场景资产失败");
    setProject(data.project);
    const updated = data.project.shots.find((item) => item.id === shot.id);
    if (updated) setShotDraft((current) => ({ ...current, ...updated, characterIds: updated.characterIds || characterIds, referenceAssetIds: updated.referenceAssetIds || referenceAssetIds }));
  }

  function selectShot(shot: Shot) {
    if (isSavingShot || (shot.id !== selectedShotId && selectedShotId && activeShots.some((item, index) => {
      if (item.id !== selectedShotId) return false;
      const original = { ...item, title: shotTitle(item, index, activeShots) };
      return (["title", "duration", "size", "camera", "movement", "imagePrompt", "videoPrompt", "negativePrompt"] as const).some((field) => (shotDraft[field] ?? "") !== (original[field] ?? ""));
    }) && !window.confirm("当前分镜有未保存的修改，确定切换并放弃修改吗？"))) return;
    setSelectedShotId(shot.id);
    const shots = activeShots;
    const characterIds = shot.characterIds?.length ? shot.characterIds : inferredShotCharacterIds(shot);
    const sceneId = activeScenes.find((scene) => scene.number === shot.scene)?.id;
    const referenceAssetIds = Array.from(new Set([...(shot.referenceAssetIds || []), ...assets.filter((asset) => {
      const meta = assetMetadata(asset);
      return Boolean(asset.url) && ((meta.category === "character" && characterIds.includes(meta.characterId || "")) || (meta.category === "scene" && meta.sceneId === sceneId));
    }).map((asset) => asset.id)]));
    const nextDraft = { ...shot, characterIds, referenceAssetIds, title: shotTitle(shot, shots.findIndex((item) => item.id === shot.id), shots) };
    setShotDraft(nextDraft);
    void ensureShotAssociations(shot, nextDraft).catch((error) => setActionError(error instanceof Error ? error.message : "自动关联失败"));
  }

  async function saveShot() {
    if (!project?.id || !selectedShotId) return;
    const shot = activeShots.find((item) => item.id === selectedShotId);
    if (!shot || ["queued", "processing"].includes(shotStatusOf(shot.id, shot.status))) { setActionError("镜头正在生成视频，完成后再编辑"); return; }
    const fields = ["title", "duration", "size", "camera", "movement", "imagePrompt", "videoPrompt", "negativePrompt"] as const;
    const unifiedPrompt = String(shotDraft.videoPrompt || shotDraft.imagePrompt || "").trim();
    const promptPayload: Record<string, string> = Object.fromEntries(fields.map((field) => [field, field === "imagePrompt" || field === "videoPrompt" ? unifiedPrompt : String(shotDraft[field] ?? "").trim()]));
    const payload: any = { ...promptPayload, characterIds: shotDraft.characterIds || [], referenceAssetIds: shotDraft.referenceAssetIds || [] };
    if (fields.some((field) => field !== "negativePrompt" && !payload[field])) { setActionError("请填写标题、镜头信息及图片/视频提示词"); return; }
    if (activeShots.some((item, index) => item.id !== shot.id && shotTitle(item, index, activeShots).toLocaleLowerCase() === payload.title.toLocaleLowerCase())) { setActionError("分镜标题不能重复"); return; }
    setIsSavingShot(true);
    try {
      const response = await fetch(`/api/projects/${project.id}/shots/${selectedShotId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "保存分镜失败");
    setProject(data.project);
      setActionError("");
    } catch (error) { setActionError(error instanceof Error ? error.message : "保存分镜失败"); }
    finally { setIsSavingShot(false); }
  }

  async function updateShotAssociation(patch: Partial<Shot>) {
    if (!project?.id || !selectedShotId) return;
    const nextDraft = { ...shotDraft, ...patch };
    setShotDraft(nextDraft);
    const payload: { characterIds?: string[]; referenceAssetIds?: string[] } = {};
    if (patch.characterIds) {
      const characterIds = patch.characterIds;
      const preserved = (shotDraft.referenceAssetIds || []).filter((assetId) => {
        const asset = assets.find((item) => item.id === assetId);
        const meta = asset ? assetMetadata(asset) : {};
        return meta.category !== "character" || characterIds.includes(meta.characterId || "");
      });
      const characterAssetIds = assets.filter((asset) => {
        const meta = assetMetadata(asset);
        return Boolean(asset.url) && meta.category === "character" && characterIds.includes(meta.characterId || "");
      }).map((asset) => asset.id);
      payload.characterIds = characterIds;
      payload.referenceAssetIds = Array.from(new Set(preserved.concat(characterAssetIds)));
      setShotDraft((current) => ({ ...current, characterIds, referenceAssetIds: payload.referenceAssetIds }));
    }
    if (patch.referenceAssetIds) payload.referenceAssetIds = patch.referenceAssetIds;
    try {
      const response = await fetch(`/api/projects/${project.id}/shots/${selectedShotId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json().catch(() => null) as { project?: GeneratedProject; error?: string } | null;
      if (!response.ok || !data?.project) throw new Error(data?.error || "保存分镜关联失败");
      setProject(data.project);
      const updatedShot = data.project.shots.find((item) => item.id === selectedShotId);
      if (updatedShot) setShotDraft((current) => ({ ...current, ...updatedShot }));
      setActionError("");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "保存分镜关联失败");
    }
  }

  async function toggleEpisodeCharacter(characterId: string) {
    if (!project?.id || isUpdatingEpisodeCharacters) return;
    const nextIds = activeEpisodeCharacterIds.includes(characterId)
      ? activeEpisodeCharacterIds.filter((id) => id !== characterId)
      : [...activeEpisodeCharacterIds, characterId];
    setIsUpdatingEpisodeCharacters(true);
    setActionError("");
    try {
      if (activeEpisodeId) {
        const response = await fetch(`/api/projects/${project.id}/episodes/${activeEpisodeId}/characters`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ characterIds: nextIds }) });
        const data = await response.json().catch(() => null) as { project?: GeneratedProject; error?: string } | null;
        if (!response.ok || !data?.project) throw new Error(data?.error || "同步本集人物关联失败");
        setProject(data.project);
        setShotDraft((current) => ({ ...current, characterIds: nextIds }));
        return;
      }
      const updatedShots: Shot[] = [];
      for (const shot of activeShots) {
        const sceneId = activeScenes.find((scene) => scene.number === shot.scene)?.id;
        const referenceAssetIds = assets.filter((asset) => {
          const meta = assetMetadata(asset);
          return Boolean(asset.url) && ((meta.category === "character" && nextIds.includes(meta.characterId || "")) || (meta.category === "scene" && meta.sceneId === sceneId));
        }).map((asset) => asset.id);
        const response = await fetch(`/api/projects/${project.id}/shots/${shot.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ characterIds: nextIds, referenceAssetIds }) });
        const data = await response.json().catch(() => null) as { project?: GeneratedProject; error?: string } | null;
        if (!response.ok || !data?.project) throw new Error(data?.error || "同步分镜人物关联失败");
        updatedShots.push(...(data.project.shots || []).filter((item) => item.episodeNumber === activeEpisodeNumber || (activeEpisodeNumber === 1 && !item.episodeNumber)));
      }
      setProject((current) => current ? { ...current, shots: current.shots.map((shot) => updatedShots.find((item) => item.id === shot.id) || shot) } : current);
      setShotDraft((current) => ({ ...current, characterIds: nextIds }));
    } catch (error) { setActionError(error instanceof Error ? error.message : "同步分镜人物关联失败"); }
    finally { setIsUpdatingEpisodeCharacters(false); }
  }

  async function syncActiveEpisodeAssetReferences() {
    if (!project?.id || !activeEpisodeId || !activeShots.length || !assets.length) return;
    const sceneByNumber = new Map(activeScenes.map((scene) => [scene.number, scene.id]));
    let changed = false;
    for (const shot of activeShots) {
      const characterIds = shot.characterIds?.length ? shot.characterIds : inferredShotCharacterIds(shot);
      const sceneId = sceneByNumber.get(shot.scene);
      const reusable = assets.filter((asset) => {
        if (!asset.url) return false;
        const meta = assetMetadata(asset);
        return (meta.category === "character" && characterIds.includes(meta.characterId || "")) || (meta.category === "scene" && meta.sceneId === sceneId);
      }).map((asset) => asset.id);
      const nextIds = Array.from(new Set([...(shot.referenceAssetIds || []), ...reusable]));
      if (nextIds.length === (shot.referenceAssetIds || []).length && nextIds.every((id) => (shot.referenceAssetIds || []).includes(id)) && JSON.stringify(characterIds) === JSON.stringify(shot.characterIds || [])) continue;
      const response = await fetch(`/api/projects/${project.id}/shots/${shot.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ characterIds, referenceAssetIds: nextIds }) });
      if (response.ok) changed = true;
    }
    if (changed) {
      const response = await fetch(`/api/projects/${project.id}`);
      if (response.ok && workspaceProjectIdRef.current === project.id) setProject((await response.json()).project as GeneratedProject);
    }
  }

  function openCharacterAsset(characterId: string) {
    setActiveStepState("characters");
    const name = project?.characters?.find((character) => character.id === characterId)?.name;
    window.setTimeout(() => {
      const card = name ? Array.from(document.querySelectorAll<HTMLElement>(".character-card")).find((item) => item.textContent?.includes(name)) : undefined;
      card?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
  }

  async function retakeShot(shotId: string) {
    if (!project?.id) return;
    setRetakingShotId(shotId);
    setActionError("");
    try {
      const response = await fetch(`/api/projects/${project.id}/shots/${shotId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "重拍失败");
      setProject(data.project);
      setJobStatus({});
      setQueuedCount(0);
      if (data.project?.id) void loadUsage(data.project.id);
      void loadProjects();
    } catch (error) { setActionError(error instanceof Error ? error.message : "重拍失败"); }
    finally { setRetakingShotId(null); }
  }

  function newProject() {
    projectLoadRequestRef.current += 1;
    clearProjectWorkspace();
    setTopic("");
    setScriptLength("short");
    setNarrativePerspective("third-person");
    setProjectFormat("single");
    setEpisodeCount(1);
    setWordsPerEpisode(500);
    setStoryBible("");
    setWriterId("luxun");
    setDirectorId("wong-kar-wai");
    setActiveStep("brief");
  }

  function openProjectNavigator() {
    setStyleToolsOpen(false);
    setAssetToolsOpen(false);
    setActiveStep(project?.script ? "script" : "brief");
    window.requestAnimationFrame(() => projectListRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  }

  async function distillSample(file?: File) {
    if (!file) return;
    setIsDistilling(true);
    try {
      const form = new FormData();
      form.append("name", file.name.replace(/\.[^.]+$/, ""));
      form.append("file", file);
      if (textModelId) form.append("modelId", textModelId);
      const response = await fetch("/api/styles/distill", { method: "POST", body: form });
      const data = await response.json().catch(() => null) as { style?: WriterStyle; digest?: { plotSummary?: string; storyBible?: string; format?: ProjectFormat; episodeCount?: number; wordsPerEpisode?: number; scriptLength?: ScriptLength; narrativePerspective?: NarrativePerspective }; error?: string } | null;
      if (!response.ok || !data?.style) throw new Error(data?.error || "文本拆分失败");
      setPendingWriterStyle(data.style);
      setWriterId(data.style.id);
      if (data.digest?.plotSummary) setTopic(data.digest.plotSummary.slice(0, 500));
      if (data.digest?.storyBible) setStoryBible(data.digest.storyBible);
      if (data.digest?.format) setProjectFormat(data.digest.format);
      if (typeof data.digest?.episodeCount === "number") setEpisodeCount(Math.max(1, Math.min(100, data.digest.episodeCount)));
      if (typeof data.digest?.wordsPerEpisode === "number") setWordsPerEpisode(Math.max(100, data.digest.wordsPerEpisode));
      if (data.digest?.scriptLength) setScriptLength(data.digest.scriptLength);
      if (data.digest?.narrativePerspective) setNarrativePerspective(data.digest.narrativePerspective);
      setActionError("样本已蒸馏为当前项目可用的风格卡；是否入库可在风格卡阶段确认。");
    } catch (error) { setActionError(error instanceof Error ? error.message : "文本拆分失败"); }
    finally { setIsDistilling(false); }
  }

  async function savePendingWriterStyle() {
    if (!pendingWriterStyle) return;
    try {
      const response = await fetch("/api/styles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "writer", style: pendingWriterStyle }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "保存作家风格卡失败");
      setSavedWriters((items) => [data.style as WriterStyle, ...items.filter((item) => item.id !== pendingWriterStyle.id)]);
      setPendingWriterStyle(null);
      setCustomWriter(null);
      setWriterId(data.style.id);
      setActionError("作家风格卡已保存到风格库。");
    } catch (error) { setActionError(error instanceof Error ? error.message : "保存作家风格卡失败"); }
  }

  function openWriterStyleEditor(style: WriterStyle) {
    const editable = writerStyles.some((builtin) => builtin.id === style.id)
      ? { ...style, id: `custom-${crypto.randomUUID()}`, source: "distilled" as const, isPublic: false, shareToken: undefined }
      : style;
    setStyleEditor({ kind: "writer", style: editable });
  }
  function openDirectorStyleEditor(style: DirectorStyle) {
    const editable = directorStyles.some((builtin) => builtin.id === style.id)
      ? { ...style, id: `custom-${crypto.randomUUID()}`, isPublic: false, shareToken: undefined }
      : style;
    setStyleEditor({ kind: "director", style: editable });
  }

  async function saveStyleEditor(editor: StyleEditorState) {
    try {
      const response = await fetch("/api/styles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: editor.kind, style: editor.style }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "保存风格卡失败");
      if (editor.kind === "writer") {
        setSavedWriters((items) => [data.style as WriterStyle, ...items.filter((item) => item.id !== editor.style.id)]);
        setWriterId((data.style as WriterStyle).id);
        if (pendingWriterStyle?.id === editor.style.id) setPendingWriterStyle(data.style as WriterStyle);
        if (customWriter?.id === editor.style.id) setCustomWriter(data.style as WriterStyle);
      } else {
        setSavedDirectors((items) => [data.style as DirectorStyle, ...items.filter((item) => item.id !== editor.style.id)]);
        setDirectorId((data.style as DirectorStyle).id);
      }
      setStyleEditor(null);
      setStyleMessage("风格卡已保存");
    } catch (error) { setStyleMessage(error instanceof Error ? error.message : "保存风格卡失败"); }
  }

  async function editWriterStyle(style: WriterStyle) {
    if (!style.id.startsWith("custom-")) return;
    const name = window.prompt("作家风格卡名称", style.name)?.trim();
    if (!name) return;
    const summary = window.prompt("风格摘要", style.summary)?.trim();
    if (!summary) return;
    try {
      const response = await fetch("/api/styles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "writer", style: { ...style, name, summary } }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "编辑作家风格卡失败");
      setSavedWriters((items) => items.map((item) => item.id === style.id ? data.style : item));
      if (pendingWriterStyle?.id === style.id) setPendingWriterStyle(data.style);
      setActionError("作家风格卡已更新。");
    } catch (error) { setActionError(error instanceof Error ? error.message : "编辑作家风格卡失败"); }
  }

  async function deleteWriterStyle(style: WriterStyle) {
    if (writerStyles.some((builtin) => builtin.id === style.id) || !window.confirm(`删除作家风格卡“${style.name}”？`)) return;
    try {
      const response = await fetch(`/api/styles?kind=writer&id=${encodeURIComponent(style.id)}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "删除作家风格卡失败");
      setSavedWriters((items) => items.filter((item) => item.id !== style.id));
      if (writerId === style.id) setWriterId(writerStyles[0]?.id || "luxun");
      setStyleMessage("作家风格卡已删除。");
    } catch (error) { setStyleMessage(error instanceof Error ? error.message : "删除作家风格卡失败"); }
  }

  async function importDirectorStyle(file?: File) {
    if (!file) return;
    try {
      const style = JSON.parse(await file.text()) as DirectorStyle;
      const importedStyle = { ...style, id: style.id?.startsWith("custom-") ? style.id : `custom-${crypto.randomUUID()}` };
      const response = await fetch("/api/styles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "director", style: importedStyle }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "导入导演风格失败");
      setSavedDirectors((current) => [data.style as DirectorStyle, ...current.filter((item) => item.id !== importedStyle.id)]);
      setDirectorId((data.style as DirectorStyle).id);
    } catch (error) { setActionError(error instanceof Error ? error.message : "导入导演风格失败"); }
  }

  async function createDirectorStyle() {
    const name = window.prompt("导演风格卡名称", "我的导演风格")?.trim();
    if (!name) return;
    const summary = window.prompt("风格摘要", "可替换的视觉风格配置")?.trim();
    if (!summary) return;
    const descriptor = window.prompt("视觉 descriptor", "cinematic composition, coherent lighting, controlled color palette")?.trim();
    if (!descriptor) return;
    const style: DirectorStyle = { id: `custom-${crypto.randomUUID()}`, name, summary, descriptor, palette: ["#d65e3b", "#257b70", "#e8c98a"], lora: "" };
    try {
      const response = await fetch("/api/styles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "director", style }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "创建导演风格卡失败");
      setSavedDirectors((items) => [data.style as DirectorStyle, ...items.filter((item) => item.id !== style.id)]);
      setDirectorId(style.id);
    } catch (error) { setActionError(error instanceof Error ? error.message : "创建导演风格卡失败"); }
  }

  async function editDirectorStyle(style: DirectorStyle) {
    if (!style.id.startsWith("custom-")) return;
    const name = window.prompt("导演风格卡名称", style.name)?.trim();
    if (!name) return;
    const summary = window.prompt("风格摘要", style.summary)?.trim();
    if (!summary) return;
    const descriptor = window.prompt("视觉 descriptor", style.descriptor)?.trim();
    if (!descriptor) return;
    try {
      const response = await fetch("/api/styles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "director", style: { ...style, name, summary, descriptor } }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "编辑导演风格卡失败");
      setSavedDirectors((items) => items.map((item) => item.id === style.id ? data.style as DirectorStyle : item));
    } catch (error) { setActionError(error instanceof Error ? error.message : "编辑导演风格卡失败"); }
  }

  async function deleteDirectorStyle(style: DirectorStyle) {
    if (directorStyles.some((builtin) => builtin.id === style.id) || !window.confirm(`删除导演风格卡“${style.name}”？`)) return;
    try {
      const response = await fetch(`/api/styles?kind=director&id=${encodeURIComponent(style.id)}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "删除导演风格卡失败");
      setSavedDirectors((items) => items.filter((item) => item.id !== style.id));
      if (directorId === style.id) setDirectorId(directorStyles[0]?.id || "wong-kar-wai");
    } catch (error) { setActionError(error instanceof Error ? error.message : "删除导演风格卡失败"); }
  }

  async function shareStyle(styleKind: "writer" | "director", id: string, isPublic: boolean) {
    setShareMessage("");
    try {
      const response = await fetch("/api/styles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "sharing", styleKind, id, isPublic }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "分享设置失败");
      const update = <T extends { id: string; isPublic?: boolean; shareToken?: string }>(items: T[]) => items.map((item) => item.id === id ? { ...item, isPublic: data.isPublic, shareToken: data.shareToken } : item);
      if (styleKind === "writer") setSavedWriters(update(savedWriters)); else setSavedDirectors(update(savedDirectors));
      setShareMessage(data.isPublic ? `${window.location.origin}/api/styles/share/${data.shareToken}` : "分享链接已停用");
    } catch (error) { setActionError(error instanceof Error ? error.message : "分享设置失败"); }
  }

  async function importSharedStyle() {
    const shareToken = window.prompt("粘贴分享链接中的 token");
    if (!shareToken) return;
    try {
      const response = await fetch("/api/styles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "import", shareToken: shareToken.trim().split("/").pop() }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "导入分享卡失败");
      if (data.kind === "writer") { setSavedWriters((items) => [data.style, ...items]); setWriterId(data.style.id); }
      else { setSavedDirectors((items) => [data.style, ...items]); setDirectorId(data.style.id); }
    } catch (error) { setActionError(error instanceof Error ? error.message : "导入分享卡失败"); }
  }

  async function pollJobs(jobs: { shotId: string; jobId: string }[], projectId = project?.id) {
    if (!projectId) return;
    const remaining = new Set(jobs.map((job) => job.jobId));
    while (remaining.size) {
      if (workspaceProjectIdRef.current !== projectId) return;
      await new Promise((resolve) => setTimeout(resolve, 700));
      for (const job of jobs) {
        if (!remaining.has(job.jobId)) continue;
        try {
          const response = await fetch(`/api/video/jobs/${job.jobId}?projectId=${encodeURIComponent(projectId)}`);
          if (!response.ok) continue;
          const data = await response.json();
          const current = data.job;
          if (workspaceProjectIdRef.current === projectId) setJobStatus((prev) => ({ ...prev, [job.shotId]: { status: current.status as ShotStatus, progress: current.progress ?? 0, outputUrl: current.outputUrl } }));
          if (current.status === "complete" || current.status === "failed") remaining.delete(job.jobId);
        } catch { /* 继续轮询 */ }
      }
    }
  }

  async function queueVideos(input?: unknown) {
    const shots = Array.isArray(input) ? input as Shot[] : activeShots;
    if (shots === activeShots && activeStep === "shots" && !selectedShotId) {
      setActionError("请先选择一个分镜");
      return;
    }
    const targetShots = shots === activeShots && activeStep === "shots" && selectedShotId
      ? activeShots.filter((shot) => shot.id === selectedShotId)
      : shots;
    if (!project?.id || !targetShots.length) return;
    if (activeStep === "shots" && targetShots.length === 1 && ["queued", "processing"].includes(shotStatusOf(targetShots[0].id, targetShots[0].status))) {
      setActionError("当前分镜已经提交或完成，无需重复生成");
      return;
    }
    setIsQueuing(true);
    setQueuedCount(0);
    const jobs: { shotId: string; jobId: string }[] = [];
    try {
      for (const shot of targetShots) {
        const existing = jobStatus[shot.id];
        if (existing?.status === "queued" || existing?.status === "processing") continue;
        const selectedVideoModel = videoModels.find((model) => model.id === videoModelId);
        const response = await fetch("/api/video/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: project.id, shotId: shot.id, provider: selectedVideoModel?.provider || videoProvider, model: selectedVideoModel?.model || undefined, modelId: selectedVideoModel?.id || videoModelId || undefined }) });
        const data = await response.json().catch(() => null) as { job?: { id: string }; error?: string; missing?: string[] } | null;
        if (!response.ok || !data?.job) {
          const setupHint = data?.missing?.length ? `；请到后台「模型配置」填写 ${data.missing.join("、")}` : "";
          throw new Error(`${data?.error || "视频任务提交失败"}${setupHint}`);
        }
        jobs.push({ shotId: shot.id, jobId: data.job.id });
        setJobStatus((prev) => ({ ...prev, [shot.id]: { status: "queued", progress: 0 } }));
        setQueuedCount((count) => count + 1);
      }
    } catch (error) { setActionError(error instanceof Error ? error.message : "视频任务提交失败"); } finally { setIsQueuing(false); }
    if (jobs.length) void pollJobs(jobs, project.id);
  }

  async function queueSelectedVideo() {
    const selected = selectedShotId ? activeShots.find((shot) => shot.id === selectedShotId) : undefined;
    if (!selected) {
      setActionError("请先选择一个分镜");
      return;
    }
    await queueVideos([selected]);
  }

  async function retryFailedVideos() {
    if (!project?.id) return;
    setJobStatus((current) => Object.fromEntries(Object.entries(current).filter(([, state]) => state.status !== "failed")));
    await queueVideos(activeShots.filter((shot) => shotStatusOf(shot.id, shot.status) === "failed"));
  }

  function downloadTemplate(path: string) {
    const anchor = document.createElement("a");
    anchor.href = path;
    anchor.download = path.split("/").pop() ?? "template.json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  async function readJsonTemplate(file?: File) {
    if (!file) return null;
    const value: unknown = JSON.parse(await file.text());
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("模板必须是 JSON 对象");
    return value as Record<string, unknown>;
  }

  async function importBriefTemplate(file?: File) {
    try {
      const template = await readJsonTemplate(file);
      if (!template) return;
      if (typeof template.topic === "string") setTopic(template.topic.slice(0, 500));
      if (typeof template.scriptLength === "string" && ["micro", "short", "medium", "long", "feature", "series"].includes(template.scriptLength)) setScriptLength(template.scriptLength as ScriptLength);
      if (typeof template.narrativePerspective === "string" && ["third-person", "first-person", "observational", "multi-perspective", "epistolary", "unreliable-narrator"].includes(template.narrativePerspective)) setNarrativePerspective(template.narrativePerspective as NarrativePerspective);
      if (template.format === "single" || template.format === "series") setProjectFormat(template.format as ProjectFormat);
      if (typeof template.episodeCount === "number" && Number.isFinite(template.episodeCount)) setEpisodeCount(Math.max(1, Math.min(100, Math.round(template.episodeCount))));
      if (typeof template.wordsPerEpisode === "number" && Number.isFinite(template.wordsPerEpisode)) setWordsPerEpisode(Math.max(100, Math.round(template.wordsPerEpisode)));
      if (typeof template.storyBible === "string") setStoryBible(template.storyBible.slice(0, 20000));
      setActionError("");
    } catch (error) { setActionError(error instanceof Error ? error.message : "导入创作简报模板失败"); }
  }

  async function importShotTemplate(file?: File) {
    try {
      const template = await readJsonTemplate(file);
      if (!template) return;
      const fields = ["title", "duration", "size", "camera", "movement", "imagePrompt", "videoPrompt", "negativePrompt"] as const;
      const patch: Partial<Shot> = {};
      for (const field of fields) if (typeof template[field] === "string") patch[field] = template[field] as never;
      if (!Object.keys(patch).length) throw new Error("分镜模板没有可导入的字段");
      setShotDraft((current) => ({ ...current, ...patch }));
      setActionError("");
    } catch (error) { setActionError(error instanceof Error ? error.message : "导入分镜模板失败"); }
  }

  async function importAssetTemplate(file?: File) {
    try {
      const template = await readJsonTemplate(file);
      if (!template) return;
      if (typeof template.name === "string") setAssetName(template.name.slice(0, 200));
      if (typeof template.url === "string") setAssetUrl(template.url.slice(0, 2000));
      if (typeof template.kind === "string" && ["image", "video", "audio", "reference"].includes(template.kind)) setAssetKind(template.kind);
      setActionError("");
    } catch (error) { setActionError(error instanceof Error ? error.message : "导入素材模板失败"); }
  }

  async function importWriterStyle(file?: File) {
    if (!file) return;
    try {
      const style = JSON.parse(await file.text()) as WriterStyle;
      if (!style.name || !Array.isArray(style.axes) || style.axes.length !== 9) throw new Error("作家风格模板必须包含 name 和 9 个 axes");
      const importedStyle = { ...style, id: style.id?.startsWith("custom-") ? style.id : `custom-${crypto.randomUUID()}` };
      const response = await fetch("/api/styles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "writer", style: importedStyle }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "导入作家风格失败");
      setSavedWriters((items) => [data.style, ...items.filter((item) => item.id !== data.style.id)]);
      setWriterId(data.style.id);
      setActionError("");
    } catch (error) { setActionError(error instanceof Error ? error.message : "导入作家风格失败"); }
  }



  function shotStatusOf(shotId: string, base?: ShotStatus): ShotStatus {
    return jobStatus[shotId]?.status ?? base ?? "draft";
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const steps: { id: Step; label: string; icon: typeof FileText }[] = [
    { id: "brief", label: "创作简报", icon: FileText }, { id: "script", label: "剧本", icon: Clapperboard }, { id: "characters", label: "人物资产", icon: UserRound }, { id: "shots", label: "分镜提示词", icon: Film }
  ];
  const workflowSteps = steps.filter((step) => step.id !== "assets" && step.id !== "video");
  const styleLibraryCount = writerOptions.length + directorOptions.length;
  const activeShotIds = new Set(activeShots.map((shot) => shot.id));
  // Assets belong to the project and may be reused by later episodes. The
  // current episode is only a priority/filter in the UI, never a hard boundary.
  const visibleAssets = assets;

  return <main className="app-shell">
    <input id="writer-style-upload" type="file" accept=".json,application/json" hidden onChange={(event) => void importWriterStyle(event.target.files?.[0])} />
    <input id="director-style-upload" type="file" accept=".json,application/json" hidden onChange={(event) => void importDirectorStyle(event.target.files?.[0])} />
    {activeStep === "shots" && project && <><button className="style-tools-trigger asset-tools-trigger" aria-expanded={assetToolsOpen} aria-controls="asset-tools-drawer" onClick={() => setAssetToolsOpen(true)}><PackageOpen size={16} /> 外部素材</button><div className={`style-tools-backdrop ${assetToolsOpen ? "open" : ""}`} aria-hidden="true" onClick={() => setAssetToolsOpen(false)} /><aside id="asset-tools-drawer" className={`style-actions asset-tools-drawer ${assetToolsOpen ? "open" : ""}`} aria-hidden={!assetToolsOpen}><div className="style-tools-heading"><div><b>当前集外部素材</b><small>导入可供分镜手动关联的图片、视频与参考文件</small></div><button className="drawer-close" aria-label="关闭外部素材" onClick={() => setAssetToolsOpen(false)}><X size={17} /></button></div><div className="template-actions drawer-template-actions"><button className="ghost-button" onClick={() => downloadTemplate("/templates/asset-import.template.json")}><Download size={13} /> 素材模板</button><label className="ghost-button template-upload" htmlFor="asset-template-upload"><Upload size={13} /> 导入模板</label></div><AssetImportPanel kind={assetKind} name={assetName} url={assetUrl} assets={visibleAssets} importing={isImportingAsset} onKindChange={setAssetKind} onNameChange={setAssetName} onUrlChange={setAssetUrl} onImport={() => void importAsset()} /></aside></>}
    {activeStep === "style" && <><button className="style-tools-trigger" aria-expanded={styleToolsOpen} aria-controls="style-tools-drawer" onClick={() => setStyleToolsOpen(true)}><PanelRightOpen size={16} /> 风格工具</button><div className={`style-tools-backdrop ${styleToolsOpen ? "open" : ""}`} aria-hidden="true" onClick={() => setStyleToolsOpen(false)} /><aside id="style-tools-drawer" className={`style-actions ${styleToolsOpen ? "open" : ""}`} aria-hidden={!styleToolsOpen}><div className="style-tools-heading"><div><b>风格卡工具</b><small>模板、导入与分享</small></div><button className="drawer-close" aria-label="关闭风格工具" onClick={() => setStyleToolsOpen(false)}><X size={17} /></button></div><button className="ghost-button" onClick={() => downloadTemplate("/templates/writer-style.template.json")}><Download size={13} /> 作家卡模板</button><label className="ghost-button template-upload" htmlFor="writer-style-upload"><Upload size={13} /> 导入作家卡</label><button className="ghost-button" onClick={() => downloadTemplate("/templates/director-style.template.json")}><Download size={13} /> 导演卡模板</button><label className="ghost-button template-upload" htmlFor="director-style-upload"><Upload size={13} /> 导入导演卡</label><div className="drawer-divider" /><button className="ghost-button" onClick={() => void shareStyle("writer", writer.id, !writer.isPublic)} disabled={!writer.id.startsWith("custom-")}>{writer.isPublic ? "停止分享作家卡" : "分享当前作家卡"}</button><button className="ghost-button" onClick={() => void shareStyle("director", director.id, !director.isPublic)} disabled={!director.id.startsWith("custom-")}>{director.isPublic ? "停止分享导演卡" : "分享当前导演卡"}</button><button className="ghost-button" onClick={() => void importSharedStyle()}>导入分享卡</button>{shareMessage && <small>{shareMessage}</small>}</aside></>}


    <StyleEditorModal editor={styleEditor} onClose={() => setStyleEditor(null)} onSave={(editor) => void saveStyleEditor(editor)} />
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Sparkles size={17} /></div><span>INKFRAME</span><small>STUDIO</small></div>
      <div className="workspace-label">创作空间</div>
      <button className="new-project" onClick={newProject}><Plus size={16} /> 新建项目 <span>⌘ N</span></button>
      <nav className="side-nav side-nav-functional" aria-label="工作区导航">
        <button type="button" className={`side-nav-link ${!styleToolsOpen && (activeStep !== "shots" || !project) ? "active" : ""}`} onClick={() => { setStyleToolsOpen(false); setAssetToolsOpen(false); setActiveStep(activeStep === "shots" && project ? "script" : "brief"); }}><Clapperboard size={17} /> <span>工作台</span></button>
        <button type="button" className={`side-nav-link ${styleToolsOpen || activeStep === "style" ? "active" : ""}`} onClick={() => { setAssetToolsOpen(false); setActiveStepState("style"); setStyleToolsOpen(true); }}><Library size={17} /> <span>风格库</span> <em>{styleLibraryCount}</em></button>
        <button type="button" className={`side-nav-link ${project ? "active" : ""}`} onClick={openProjectNavigator}><Film size={17} /> <span>我的项目</span> <em>{projects.length}</em></button>
      </nav>
      <nav className="side-nav">
        <a className={activeStep !== "shots" || !project ? "active" : ""} onClick={() => setActiveStep(activeStep === "shots" && project ? "script" : "brief")}><Clapperboard size={17} /> 工作台</a>
         <a onClick={() => { setActiveStep("brief"); setStyleToolsOpen(true); }}><Library size={17} /> 风格库 <em>{styleLibraryCount}</em></a>
        <a><Film size={17} /> 我的项目 <em>{projects.length}</em></a>
      </nav>
      <div className="sidebar-section-heading"><span>最近项目</span><small>{projects.length ? `${projects.length} 个` : "暂无"}</small></div>
      <div ref={projectListRef} className="side-project-list enhanced">
        {(showAllProjects ? projects : projects.slice(0, 8)).map((item) => (
          <button key={item.id} className={`side-project ${project?.id === item.id ? "current" : ""}`} onClick={() => void openProject(item.id)} title={item.title}>
            <span className="sp-dot" />
            <span className="sp-main"><b>{item.title}</b><small>{item.sceneCount} 场 · {item.shotCount} 镜头</small></span>
          </button>
        ))}
        {projects.length === 0 && <div className="side-project-empty">暂无项目</div>}
      </div>
      {projects.length > 8 && <button type="button" className="side-project-more" onClick={() => setShowAllProjects((current) => !current)}>{showAllProjects ? "收起项目" : `查看全部 ${projects.length} 个项目`}<ArrowRight size={13} className={showAllProjects ? "rotated" : ""} /></button>}
      <div className="side-project-list">
        {projects.slice(0, 8).map((item) => (
          <button key={item.id} className={`side-project ${project?.id === item.id ? "current" : ""}`} onClick={() => void openProject(item.id)} title={item.title}>
            <span className="sp-dot" />
            <span className="sp-main"><b>{item.title}</b><small>{item.sceneCount} 场 · {item.shotCount} 镜</small></span>
          </button>
        ))}
        {projects.length === 0 && <div className="side-project-empty">暂无项目</div>}
      </div>
      <div className="side-bottom"><div className="status-dot" /> <span>{isLoadingProject ? "读取中…" : "本地工作区"}</span><button>···</button></div>
    </aside>

    <section className="main-area">
      <header className="topbar"><div><span className="eyebrow">WORKSPACE / 01</span><h1>短剧生成工作台</h1></div><div className="top-actions">{user && <span className="save-state"><Check size={14} /> {user.role === "ADMIN" ? "管理员" : "已登录"} · {user.name}</span>}{user?.role === "ADMIN" && <a className="admin-link" href="/admin"><Shield size={15} /> 后台管理</a>}<button className="avatar">{user?.name?.charAt(0) ?? "?"}</button><button className="logout-link" onClick={() => void logout()}>退出</button></div></header>
       <section className="hero-top"><div><div className="kicker"><span className="pulse" /> AI STORY PIPELINE</div><h2>把文字的气质<br /><i>拍成一部短剧</i></h2><p>从创作简报和风格出发，让每一个场景都拥有自己的叙事温度。</p></div><div className="hero-meta"><div className="meta-number">0{Math.max(1, workflowSteps.findIndex((item) => item.id === activeStep) + 1)}<span>/ 04</span></div><div className="meta-copy">当前阶段<br /><strong>{workflowSteps.find((item) => item.id === activeStep)?.label || "创作简报"}</strong></div></div></section>
        <WorkflowBar steps={workflowSteps} activeStep={activeStep} project={project} onSelect={(step) => { setActionError(""); setActiveStep(step); }} />
      <div className="content-wrap">
    <input id="sample-upload" type="file" accept=".txt,text/plain" hidden onChange={(event) => void distillSample(event.target.files?.[0])} />
        <TextModelSelector models={textModels} value={textModelId} onChange={setTextModelId} />
        {project?.projectFormat === "series" && activeStep !== "brief" && activeStep !== "script" && project.episodes && <EpisodeBoard episodes={project.episodes} activeEpisodeNumber={activeEpisodeNumber} onSelect={(episode) => { setActiveEpisodeNumber(episode.number); setActionError(episode.status === "planned" ? "该集尚未生成，请先在剧本阶段生成本集" : ""); }} />}
        <WriterStyleTools active={activeStep === "brief" || activeStep === "style"} pending={pendingWriterStyle} writer={writer} onSavePending={() => void savePendingWriterStyle()} onEdit={openWriterStyleEditor} onDelete={(style) => void deleteWriterStyle(style)} />
        <StyleLibraryManager active={activeStep === "brief" || activeStep === "style"} writers={writerOptions} directors={directorOptions} onEditWriter={openWriterStyleEditor} onDeleteWriter={(style) => void deleteWriterStyle(style)} onEditDirector={openDirectorStyleEditor} onDeleteDirector={(style) => void deleteDirectorStyle(style)} onCreateDirector={() => void createDirectorStyle()} />
        {(activeStep === "brief" || activeStep === "style") && styleMessage && <p className="style-library-message" role="status">{styleMessage}</p>}
        {activeStep === "script" && project && !episodeIsPlanned && !activeEpisodeScript && <div className="script-generation-action"><div><b>当前集还没有剧本</b><small>生成后会同步拆出场景、分镜和本集人物列表。</small></div><button className="primary-button" onClick={() => void generate()} disabled={isGenerating}><WandSparkles size={15} /> {isGenerating ? "生成中…" : `生成第 ${activeEpisodeNumber} 集剧本`}</button></div>}
        {activeStep === "shots" && project && selectedShotId && <ShotAssociationEditor shot={shotDraft} characters={characters} assets={visibleAssets} onChange={(patch) => void updateShotAssociation(patch)} />}

        {activeStep === "characters" && project && <div className="character-tabs"><button className="character-tab current" onClick={() => void addCharacter()}><Plus size={14} /> 添加人物</button><span className="character-tab-label">人物资产包</span></div>}
        {activeStep === "script" && project && !episodeIsPlanned && activeEpisodeScript && <><EpisodeCharacterList characters={characters} ids={activeEpisodeCharacterIds} busy={isUpdatingEpisodeCharacters} onToggle={(id) => void toggleEpisodeCharacter(id)} onOpenCharacter={openCharacterAsset} /><EpisodeCharacterAssociationTools characters={characters} ids={activeEpisodeCharacterIds} busy={isUpdatingEpisodeCharacters} onToggle={(id) => void toggleEpisodeCharacter(id)} /></>}
        {activeStep === "script" && project && !episodeIsPlanned && activeEpisodeScript && activeEpisode && <div className="episode-regenerate-action"><button className="ghost-button" onClick={() => void generateEpisode()} disabled={Boolean(generatingEpisodeId)}><RefreshCw size={14} /> {generatingEpisodeId === activeEpisode.id ? "重新生成中…" : "重新生成本集"}</button><small>只替换当前集，其他集、人物资产和项目简报保持不变。</small></div>}
        <input id="brief-template-upload" type="file" accept=".json,application/json" hidden onChange={(event) => void importBriefTemplate(event.target.files?.[0])} />
        {activeStep === "brief" && <BriefStyleSelector writers={writerOptions} directors={directorOptions} writerId={writerId} directorId={directorId} onWriter={setWriterId} onDirector={setDirectorId} />}
        <input id="shot-template-upload" type="file" accept=".json,application/json" hidden onChange={(event) => void importShotTemplate(event.target.files?.[0])} />
        <input id="asset-template-upload" type="file" accept=".json,application/json" hidden onChange={(event) => void importAssetTemplate(event.target.files?.[0])} />
        {activeStep === "characters" && project && <CharacterEpisodeUsage project={project} />}
        {activeStep === "characters" && project && <SceneAssetEditor projectId={project.id!} episodeId={activeEpisodeId} scenes={activeScenes} assets={assets} jobs={imageJobs} modelId={imageProvider} model={imageModel} director={director} onGenerate={(sceneId, view, prompt) => void generateSceneImage(sceneId, view, prompt)} />}
        {activeStep === "characters" && <CharacterStage project={project} characters={visibleEpisodeCharacters} drafts={characterDrafts} assets={assets} jobs={imageJobs} profiles={imageProfiles} modelId={imageProvider} model={imageModel} director={director} episodeId={activeEpisodeId} scenes={activeScenes} preparing={isPreparingCharacters} savingId={savingCharacterId} generatingKeys={generatingImageKeys} actionError={actionError} onModel={(value) => { setImageProvider(value); const profile = imageProfiles.find((item) => item.id === value); if (profile) setImageModel(profile.model); else setImageModel(""); }} onDraft={(id, patch) => setCharacterDrafts((current) => ({ ...current, [id]: { ...(current[id] || characters.find((character) => character.id === id)!), ...patch } }))} onSave={(character) => void saveCharacter(character)} onGenerate={(character, view, prompt) => void generateCharacterImage(character, view, prompt)} onGenerateScene={(sceneId, view) => void generateSceneImage(sceneId, view)} onExtract={() => void prepareCharacters()} onAdd={() => void addCharacter()} onDelete={(character) => void deleteCharacter(character)} onNext={() => { setActionError(""); setActiveStep("shots"); }} />}

        {activeStep === "brief" && <div className="template-actions brief-template-actions"><button className="ghost-button" onClick={() => downloadTemplate("/templates/project-brief.template.json")}><Download size={13} /> 简报模板</button><label className="ghost-button template-upload" htmlFor="brief-template-upload"><Upload size={13} /> 导入简报</label></div>}
        {activeStep === "shots" && project && <div className="template-actions shot-template-actions"><button className="ghost-button" onClick={() => downloadTemplate("/templates/shot-prompt.template.json")}><Download size={13} /> 分镜模板</button><label className="ghost-button template-upload" htmlFor="shot-template-upload"><Upload size={13} /> 导入到当前分镜</label></div>}
        {activeStep === "assets" && project && <div className="template-actions asset-template-actions"><button className="ghost-button" onClick={() => downloadTemplate("/templates/asset-import.template.json")}><Download size={13} /> 素材模板</button><label className="ghost-button template-upload" htmlFor="asset-template-upload"><Upload size={13} /> 导入素材模板</label></div>}
        {activeStep === "assets" && project && <div className="asset-package-bar"><div><b>制作素材库</b><small>镜头视频、场景参考和后期素材按项目与当前集隔离保存</small></div><button className="primary-button" onClick={() => void generateAssetPackage()} disabled={isGeneratingAssetPackage}><PackageOpen size={14} /> {isGeneratingAssetPackage ? "整理中…" : "整理制作素材"}</button></div>}
        {activeStep === "assets" && project && <AssetImportPanel kind={assetKind} name={assetName} url={assetUrl} assets={visibleAssets} importing={isImportingAsset} onKindChange={setAssetKind} onNameChange={setAssetName} onUrlChange={setAssetUrl} onImport={() => void importAsset()} />}
        {project && episodeIsPlanned && activeEpisode && <div className="planned-episode-action"><span><Library size={16} /> 第 {activeEpisode.number} 集尚未生成剧本、场景与分镜</span><button className="primary-button" onClick={() => void generateEpisode()} disabled={Boolean(generatingEpisodeId)}>{generatingEpisodeId === activeEpisode.id ? <><WandSparkles size={16} /> 正在生成本集…</> : <>生成第 {activeEpisode.number} 集 <ArrowRight size={16} /></>}</button></div>}

        {activeStep === "brief" && <section className="panel brief-panel"><div className="panel-heading"><div><span className="section-index">01 / 创作简报</span><h3>先给故事一个起点</h3></div><span className="panel-note">风格已在本页选择 · 约 30 秒完成</span></div><div className="brief-grid"><label className="field full"><span>这次想讲什么？</span><textarea value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="例如：一个人在公司年会上突然决定辞职" /><small>{topic.length} / 500</small></label><label className="field"><span>剧本长度</span><select className="select-button" value={scriptLength} onChange={(event) => setScriptLength(event.target.value as ScriptLength)}><option value="micro">极短 · 约 300 字</option><option value="short">短剧 · 约 500 字</option><option value="medium">中篇 · 约 1200 字</option><option value="long">完整 · 约 3000 字</option><option value="feature">长篇 · 8000+ 字</option><option value="series">多集 · 按单集规格</option></select></label><label className="field"><span>叙事视角</span><select className="select-button" value={narrativePerspective} onChange={(event) => setNarrativePerspective(event.target.value as NarrativePerspective)}><option value="third-person">第三人称 · 电影感</option><option value="first-person">第一人称 · 内心独白</option><option value="observational">旁观视角 · 镜头观察</option><option value="multi-perspective">多视角 · 角色轮换</option><option value="epistolary">书信体 · 记录体</option><option value="unreliable-narrator">不可靠叙事者</option></select></label></div><div className="long-form-options"><label className="field"><span>项目形态</span><select className="select-button" value={projectFormat} onChange={(event) => setProjectFormat(event.target.value as ProjectFormat)}><option value="single">单集短剧</option><option value="series">长篇多集</option></select></label><label className="field"><span>集数</span><input className="select-button" type="number" min={1} max={100} value={episodeCount} onChange={(event) => setEpisodeCount(Math.max(1, Math.min(100, Number(event.target.value) || 1)))} disabled={projectFormat !== "series"} /></label><label className="field"><span>单集目标字数</span><input className="select-button" type="number" min={100} step={100} value={wordsPerEpisode} onChange={(event) => setWordsPerEpisode(Math.max(100, Number(event.target.value) || 100))} /></label><label className="field full"><span>故事 Bible / 世界观约束</span><textarea value={storyBible} onChange={(event) => setStoryBible(event.target.value)} placeholder="角色关系、时间线、固定场景、每集主线与禁用设定……" /></label></div><div className="panel-footer"><label className="upload-hint" htmlFor="sample-upload"><Upload size={15} /><span>{isDistilling ? "正在蒸馏样本…" : <>有参考文本？<b>上传样本文章</b></>}</span><small>支持 .txt</small></label><button className="primary-button" onClick={() => void continueFromBrief()}>进入剧本 <ArrowRight size={16} /></button></div></section>}

        {activeStep === "style" && <section className="panel style-panel"><div className="panel-heading"><div><span className="section-index">02 / 风格卡</span><h3>选择文字与镜头的灵魂</h3></div><span className="panel-note">风格与内容分离，可随时替换</span></div><div className="style-columns"><div className="style-column"><div className="column-title"><span>作家风格</span><small>WRITER STYLE</small></div><div className="cards">{writerOptions.map((item) => <button className={`style-card ${writerId === item.id ? "selected" : ""}`} key={item.id} onClick={() => setWriterId(item.id)}><span className="radio">{writerId === item.id && <span />}</span><div className="style-card-main"><div className="style-name">{item.name}<small>{item.era}</small></div><p>{item.summary}</p><div className="tags">{item.tags.map((tag) => <em key={tag}>{tag}</em>)}</div></div><div className="mini-bars">{item.axes.slice(0, 3).map((axis) => <span key={axis.label} style={{ height: `${Math.max(10, axis.value / 3)}px` }} />)}</div></button>)}</div><label className="text-button" htmlFor="sample-upload"><Plus size={14} /> {isDistilling ? "正在蒸馏样本…" : "上传文章，蒸馏我的作家风格卡"}</label></div><div className="style-column"><div className="column-title"><span>导演视觉</span><small>DIRECTOR STYLE</small></div><div className="cards">{directorOptions.map((item) => <button className={`style-card director-card ${directorId === item.id ? "selected" : ""}`} key={item.id} onClick={() => setDirectorId(item.id)}><span className="radio">{directorId === item.id && <span />}</span><div className="style-card-main"><div className="style-name">{item.name}<small>{item.id === "wong-kar-wai" ? "光影情绪" : item.id === "makoto-shinkai" ? "天空与远方" : "时间与空间"}</small></div><p>{item.summary}</p><div className="palette">{item.palette.map((color) => <i key={color} style={{ background: color }} />)}</div></div><span className="lora-pill">{item.lora?.split("//")[1]}</span></button>)}</div><label className="text-button" htmlFor="director-style-upload"><Plus size={14} /> 导入导演风格配置</label></div></div>{generationError && <p className="error-message" role="alert">{generationError}</p>}<div className="panel-footer"><div className="selection-summary"><span className="summary-dot" /> 已选择 <b>{writer.name}</b> × <b>{director.name}</b></div><button className="primary-button" onClick={() => void generate()} disabled={isGenerating}>{isGenerating ? <><WandSparkles size={16} /> 正在生成剧本…</> : <>下一步：生成剧本 <ArrowRight size={16} /></>}</button></div></section>}

        {activeStep === "script" && <section className="panel result-panel"><div className="panel-heading"><div><span className="section-index">02 / 风格化剧本</span><h3>{project?.title ?? "等待生成剧本"}</h3></div><button className="ghost-button" onClick={() => setActiveStep("brief")}>调整简报与风格</button></div>{project?.projectFormat === "series" && project.episodes && <EpisodeBoard episodes={project.episodes} activeEpisodeNumber={activeEpisodeNumber} onSelect={(episode) => { setActiveEpisodeNumber(episode.number); setActionError(episode.status === "planned" ? "该集尚未生成，请先生成本集剧本" : ""); }} />}{project ? (episodeIsPlanned ? <div className="planned-episode-empty"><Library size={24} /><p>第 {activeEpisodeNumber} 集已规划，尚未生成剧本、场景与分镜。</p><small>生成时会自动读取上一集结尾、角色状态和本集目标。</small></div> : <><div className="logline"><span>LOGLINE</span><p>{activeEpisodeLogline}</p></div>{activeEpisode?.continuity?.openThreads?.length ? <div className="continuity-note">连续性线索：{activeEpisode.continuity.openThreads.join(" · ")}</div> : null}{trace.length > 0 && <div className="trace-strip">{trace.map((entry, index) => <span key={index} className="trace-item"><i>0{index + 1}</i>{entry.stage}<em>·</em><small>{entry.summary}</small></span>)}</div>}<div className="script-layout"><div className="script-copy"><div className="script-toolbar"><span><FileText size={15} /> SCRIPT / V1</span><span>约 {activeEpisodeScript.length} 字 · {activeScenes.length} 场</span></div><pre>{activeEpisodeScript}</pre></div><div className="scene-list"><div className="scene-list-title">场景结构 <small>{activeScenes.length} SCENES</small></div>{activeScenes.map((scene) => <button key={scene.number} className="scene-item" onClick={() => setActiveStep("shots")}><span>0{scene.number}</span><div><b>{scene.title}</b><small>{scene.mood}</small></div><ArrowRight size={14} /></button>)}</div></div><div className="panel-footer"><span className="generated-note"><Check size={14} /> 已完成风格化蒸馏</span><button className="primary-button" onClick={() => setActiveStep("shots")}>生成分镜提示词 <ArrowRight size={16} /></button></div></>) : <div className="empty-state"><WandSparkles size={24} /><p>还没有剧本，先在风格卡阶段生成一版。</p><button className="primary-button" onClick={() => setActiveStep("brief")}>返回创作简报</button></div>}</section>}

{activeStep === "shots" && <section className="panel result-panel"><div className="panel-heading"><div><span className="section-index">04 / 分镜提示词</span><h3>把每一句话变成可拍的画面</h3></div><span className="panel-note">角色一致性已开启 · 视频按镜头单独生成</span></div>{project ? (episodeIsPlanned ? <div className="planned-episode-empty"><Library size={24} /><p>第 {activeEpisodeNumber} 集已规划，尚未生成分镜。</p></div> : <><div className="shot-strip">{activeShots.map((shot, index) => { const status = shotStatusOf(shot.id, shot.status); return <div className="shot-card-wrap" key={shot.id}><button type="button" className={`shot-card ${selectedShotId === shot.id ? "selected" : ""}`} onClick={() => selectShot(shot)}><div className="shot-cover"><span>SCENE 0{shot.scene}</span><b>{shotTitle(shot, index, activeShots)}</b></div><div className="shot-card-body"><div><b>{shot.size}</b><span>{shot.duration}</span></div><p>{displayText(shot.videoPrompt || shot.imagePrompt || "")}</p><small>{shot.camera} · {shot.movement}</small><span className={`status-badge status-${status}`}>{SHOT_STATUS_LABEL[status]}</span>{(status === "queued" || status === "processing") && <small className="shot-inline-progress">视频生成中 {jobStatus[shot.id]?.progress || 0}%</small>}</div></button>{selectedShotId === shot.id && <SelectedShotVideoPanel shot={shot} status={jobStatus[shot.id]} models={videoModels} modelId={videoModelId} provider={videoProvider} onModel={(model) => { setVideoModelId(model?.id || ""); setVideoProvider(model?.provider || "mock-video"); }} onGenerate={() => void queueSelectedVideo()} />}{(status === "queued" || status === "processing") && <div className="shot-video-progress"><span>视频生成中 {jobStatus[shot.id]?.progress || 0}%</span><progress value={jobStatus[shot.id]?.progress || 0} max={100} /></div>}{status === "complete" && jobStatus[shot.id]?.outputUrl && selectedShotId !== shot.id && <div className="shot-video-preview"><video src={jobStatus[shot.id].outputUrl} controls preload="metadata" /><a href={jobStatus[shot.id].outputUrl} download target="_blank" rel="noreferrer">下载视频</a></div>}<button type="button" className="ghost-button shot-retake-button" onClick={(event) => { event.stopPropagation(); void retakeShot(shot.id); }} disabled={retakingShotId === shot.id}>{retakingShotId === shot.id ? "重拍中…" : "重拍镜头"}</button></div>; })}</div>{selectedShotId && <div className="shot-editor"><div className="prompt-label">编辑当前分镜 <span>保存后可直接用于后续视频任务</span></div><div className="shot-editor-grid"><label className="field"><span>分镜标题</span><input value={String(shotDraft.title || "")} onChange={(event) => setShotDraft((draft) => ({ ...draft, title: event.target.value }))} /></label><label className="field"><span>时长</span><input value={String(shotDraft.duration || "")} onChange={(event) => setShotDraft((draft) => ({ ...draft, duration: event.target.value }))} /></label><label className="field"><span>景别</span><input value={String(shotDraft.size || "")} onChange={(event) => setShotDraft((draft) => ({ ...draft, size: event.target.value }))} /></label><label className="field"><span>机位</span><input value={String(shotDraft.camera || "")} onChange={(event) => setShotDraft((draft) => ({ ...draft, camera: event.target.value }))} /></label><label className="field"><span>运镜</span><input value={String(shotDraft.movement || "")} onChange={(event) => setShotDraft((draft) => ({ ...draft, movement: event.target.value }))} /></label><label className="field full"><span>统一分镜提示词</span><textarea value={String(shotDraft.videoPrompt || shotDraft.imagePrompt || "")} onChange={(event) => setShotDraft((draft) => ({ ...draft, imagePrompt: event.target.value, videoPrompt: event.target.value }))} placeholder="动作、对白、口型、情绪、镜头运动；参考图只负责一致性" /></label><label className="field full"><span>负面提示词</span><textarea value={String(shotDraft.negativePrompt || "")} onChange={(event) => setShotDraft((draft) => ({ ...draft, negativePrompt: event.target.value }))} /></label></div><div className="shot-editor-actions"><button className="ghost-button" onClick={() => activeShots.find((shot) => shot.id === selectedShotId) && selectShot(activeShots.find((shot) => shot.id === selectedShotId)!)}>撤销修改</button><button className="primary-button" onClick={() => void saveShot()} disabled={isSavingShot || isLoadingJobs || ["queued", "processing"].includes(shotStatusOf(selectedShotId, activeShots.find((shot) => shot.id === selectedShotId)?.status))}>{isSavingShot ? "保存中…" : "保存分镜修改"}</button></div></div>}<div className="prompt-preview"><div className="prompt-label">SELECTED SHOT / VIDEO PROMPT <span>已注入 {director.name} 风格</span></div><code>{displayText(String(shotDraft.videoPrompt || activeShots[0]?.videoPrompt || ""))}</code><div className="prompt-label negative">NEGATIVE PROMPT</div><code>{displayText(String(shotDraft.negativePrompt || activeShots[0]?.negativePrompt || ""))}</code></div><div className="panel-footer"><span className="generated-note"><Check size={14} /> {isQueuing ? `正在提交 ${queuedCount} / ${activeShots.length}` : activeCompletedShots ? `${activeCompletedShots} / ${activeShots.length} 个镜头已完成` : queuedCount ? `${queuedCount} 个镜头已进入队列，后台生成中` : `${activeShots.length} 个镜头已就绪`}</span></div></>) : <div className="empty-state"><Film size={24} /><p>生成剧本后，这里会自动拆出场景与分镜提示词。</p><button className="primary-button" onClick={() => setActiveStep("script")}>开始生成</button></div>}</section>}

        {activeStep === "assets" && <section className="panel result-panel"><div className="panel-heading"><div><span className="section-index">05 / 素材库</span><h3>统一管理图片、视频与参考素材</h3></div><button className="ghost-button" onClick={() => void loadAssets(project)}>刷新素材</button></div>{project ? <div className="asset-grid">{assets.length ? assets.map((asset) => <article className="asset-card" key={asset.id}><div className="asset-preview">{asset.url && asset.kind === "video" ? <video src={asset.url} controls preload="metadata" /> : <span>{asset.kind.toUpperCase()}</span>}</div><div className="asset-body"><b>{asset.name}</b><small>{asset.provider || "本地素材"} · {asset.status} · {asset.shotId || "未绑定镜头"}</small>{asset.url && <a href={asset.url} target="_blank" rel="noreferrer">打开素材</a>}</div></article>) : <div className="empty-state"><Library size={24} /><p>镜头视频完成后会自动出现在这里，也可以通过 API 导入图片、音频和参考素材。</p></div>}</div> : <div className="empty-state"><Library size={24} /><p>请先打开或生成一个项目。</p></div>}</section>}

        <footer className="page-footer"><span>INKFRAME / 从文字到镜头</span><span>Phase 02 · Persistence + Async Worker <i>●</i></span></footer>
      </div>
    </section>
  </main>;
}
