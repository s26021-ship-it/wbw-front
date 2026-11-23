import React, { useEffect, useMemo, useRef, useState } from 'react';
import './styles.css';
import './login.css';
import {
  AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowLeft, ArrowUpDown,
  Bold, BookOpen, Check, ChevronDown, ChevronRight, ChevronsUpDown,
  CircleHelp, Clock3, Download, FileImage, FilePlus2, FileText, Folder,
  FolderPlus, Italic, Link2, LogOut, Menu, MoreHorizontal, PanelLeftClose,
  Plus, Printer, Search, Settings, Share2, SlidersHorizontal, Sparkles,
  Trash2, Underline, X
} from 'lucide-react';
import { isSupabaseConfigured, signInWithGoogle, signOut, supabase } from './backend.js';

const initial = {
  folders: [
    { id: 'f1', name: '소설', parent: null },
    { id: 'f2', name: '단편 모음', parent: 'f1' },
    { id: 'f3', name: '커미션', parent: null },
    { id: 'f4', name: '아이디어 보관함', parent: null }
  ],
  docs: [
    { id: 'd1', folder: 'f2', title: '비가 그친 뒤의 정원', body: '<p>비가 그친 뒤, 정원에는 작은 물방울들이 남아 있었다.</p><p>나는 그 사이를 천천히 걸으며 어제 하지 못한 말을 떠올렸다.</p><p>아무도 없는 곳에서야 비로소 마음은 제 목소리를 찾았다.</p>', updated: Date.now(), visibility: '비공개' },
    { id: 'd2', folder: 'f2', title: '여름의 가장자리', body: '<p>여름은 늘 가장 늦은 오후에 시작되는 것 같았다.</p>', updated: Date.now() - 86400000, visibility: '비공개' },
    { id: 'd3', folder: 'f1', title: '이름 없는 역', body: '<p>열차는 이름 없는 역에 멈췄다.</p>', updated: Date.now() - 86400000 * 3, visibility: '링크 공개' },
    { id: 'd4', folder: 'f3', title: '의뢰 메모 — 겨울 편지', body: '<p>캐릭터 관계와 전달하고 싶은 분위기를 정리한다.</p>', updated: Date.now() - 86400000 * 4, visibility: '비공개' },
    { id: 'd5', folder: 'f4', title: '대사 조각', body: '<p>“언젠가 네가 돌아올 줄 알았어.”</p>', updated: Date.now() - 86400000 * 8, visibility: '비공개' }
  ],
  prefs: { theme: 'mono', font: 'Pretendard', nickname: '말하는 하마' }
};
const loadData = () => {
  try {
    const saved = JSON.parse(localStorage.getItem('wbw-data') || '{}');
    const merged = { ...initial, ...saved };
    const migrationTime = Date.now();
    return { ...merged, docs: merged.docs.map((doc, index) => ({ ...doc, created: doc.created ?? migrationTime - index })) };
  }
  catch { return initial; }
};
const formatDate = value => new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(value);
const toLocalDateTime = value => { const local = new Date(value.getTime() - value.getTimezoneOffset() * 60000); return local.toISOString().slice(0, 16); };
const countChars = html => (html || '').replace(/<[^>]+>/g, '').replaceAll('&nbsp;', ' ').replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>');
const hasBodyContent = html => countChars(html).replace(/[\s\u200b\ufeff]/g, '').length > 0;
const classifyFailure = error => {
  const status = error?.status ?? error?.statusCode;
  const message = String(error?.message || error || '');
  if (status === 403) return 'forbidden';
  if (status >= 500) return 'server';
  if (error?.name === 'AuthRetryableFetchError' || /fetch|network|timeout|connection|offline/i.test(message)) return 'offline';
  return null;
};
const pageSizes = {
  A4: { width: 210, height: 297, label: '210 × 297 mm' },
  A5: { width: 148, height: 210, label: '148 × 210 mm' },
  Letter: { width: 216, height: 279, label: '216 × 279 mm' }
};
const themePalettes = {
  mono: { background: '#ffffff', foreground: '#252525' },
  white: { background: '#ffffff', foreground: '#252525' },
  sky: { background: '#f0f7fa', foreground: '#254b5c' },
  black: { background: '#181818', foreground: '#f3f3f1' },
  gray: { background: '#eeeeee', foreground: '#20201f' },
  sand: { background: '#f5f0e8', foreground: '#342f28' }
};
const paperStyle = draft => ({
  '--paper-font': draft.font,
  '--paper-size': `${draft.size}px`,
  '--paper-spacing': `${draft.spacing}px`,
  '--paper-line': draft.line,
  '--paper-color': draft.color,
  '--paper-margin-top': `${draft.marginTop ?? 24}mm`,
  '--paper-margin-right': `${draft.marginRight ?? 24}mm`,
  '--paper-margin-bottom': `${draft.marginBottom ?? 24}mm`,
  '--paper-margin-left': `${draft.marginLeft ?? 24}mm`
});
const randomNames = ['말하는 하마', '느긋한 문어', '잠든 고양이', '산책하는 구름', '수줍은 여우', '책 읽는 펭귄', '느린 거북이'];

function IconButton({ title, onClick, children, active = false, className = '' }) {
  return <button type="button" title={title} aria-label={title} className={`icon-button ${active ? 'active' : ''} ${className}`} onClick={onClick}>{children}</button>;
}
function Modal({ title, close, children, wide = false }) {
  return <div className="veil" onMouseDown={e => e.target === e.currentTarget && close()}><section className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true"><header className="modal-head"><h2>{title}</h2><IconButton title="닫기" onClick={close}><X size={18}/></IconButton></header>{children}</section></div>;
}
function ErrorScreen({ kind, themeClass, font, onHome, onRetry }) {
  const content = {
    'not-found': { label: '404 NOT FOUND', title: '앗! 페이지를 찾을 수 없어요.', description: '주소가 바뀌었거나 삭제된 페이지일 수 있어요.' },
    server: { label: 'SERVER ERROR', title: '앗! 서버에 문제가 생겼어요.', description: '잠시 후 다시 시도해 주세요.' },
    forbidden: { label: '403 FORBIDDEN', title: '앗! 접근 권한이 없어요.', description: '로그인하거나 글쓴이에게 열람 권한을 요청해 주세요.' },
    offline: { label: 'OFFLINE', title: '앗! 인터넷 연결이 끊겼어요.', description: '인터넷 연결을 확인한 뒤 다시 시도해 주세요.' }
  }[kind] || { label: 'ERROR', title: '앗! 문제가 발생했어요.', description: '잠시 후 다시 시도해 주세요.' };
  const canRetry = kind === 'server' || kind === 'offline';
  return <main className={`app-shell error-screen ${themeClass}`} style={{ '--app-font': font }}>
    <section className="error-content" role="alert">
      <div className="error-mark" aria-hidden="true">!</div>
      <span className="eyebrow">WBW · {content.label}</span>
      <h1>{content.title}</h1>
      <p>{content.description}</p>
      <div className="error-actions">
        {canRetry && <button className="button button-outline" onClick={onRetry}>다시 시도</button>}
        <button className="button button-dark" onClick={onHome}>처음으로</button>
      </div>
    </section>
  </main>;
}
function PagePreview({ draft }) {
  const size = pageSizes[draft.page] || pageSizes.A4;
  const margins = {
    top: Math.min(45, (draft.marginTop / size.height) * 100),
    right: Math.min(45, (draft.marginRight / size.width) * 100),
    bottom: Math.min(45, (draft.marginBottom / size.height) * 100),
    left: Math.min(45, (draft.marginLeft / size.width) * 100)
  };
  return <div className="page-preview-wrap" aria-label={`${draft.page} 용지 미리보기`}>
    <div className={`page-preview-pages ${draft.viewMode === 'double' ? 'double' : ''}`}>
      {Array.from({ length: draft.viewMode === 'double' ? 2 : 1 }, (_, index) => <div className="page-preview-paper" key={index} style={{ aspectRatio: `${size.width} / ${size.height}` }}>
        <div className="page-preview-content" style={{ inset: `${margins.top}% ${margins.right}% ${margins.bottom}% ${margins.left}%` }}>
          <i/><i/><i/><i/><i/><i/><i/>
        </div>
      </div>)}
    </div>
    <span>{draft.page} · {size.label}</span>
  </div>;
}

export default function App() {
  const [data, setData] = useState(loadData);
  const [authUser, setAuthUser] = useState(null);
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);
  const [previewMode, setPreviewMode] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [fatalError, setFatalError] = useState(null);
  const [authSuccess, setAuthSuccess] = useState('');
  const [activeFolder, setActiveFolder] = useState('f2');
  const [sortMode, setSortMode] = useState('modified');
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [view, setView] = useState('library');
  const [profileOpen, setProfileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modal, setModal] = useState('');
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState('');
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [draft, setDraft] = useState({ title: '', body: '', page: 'A4', viewMode: 'single', visibility: '비공개', scheduleEnabled: false, scheduledAt: '', marginTop: 24, marginRight: 24, marginBottom: 24, marginLeft: 24, font: 'Pretendard', size: 16, spacing: 0, line: 1.9, color: '#252525' });
  const [passwordDraft, setPasswordDraft] = useState('');
  const [saveState, setSaveState] = useState('저장됨');
  const editorRef = useRef(null);
  const timerRef = useRef(null);
  const nicknameUserIdRef = useRef(null);
  const editorSelectionRef = useRef(null);
  const currentDoc = data.docs.find(d => d.id === selectedDoc);
  const selectedFolder = data.folders.find(f => f.id === activeFolder);
  const childFolders = data.folders.filter(f => f.parent === activeFolder);
  const visibleDocs = useMemo(() => data.docs.filter(d => (activeFolder === null || d.folder === activeFolder) && (!query || d.title.toLowerCase().includes(query.toLowerCase()))).sort((a,b) => sortMode === 'modified' ? (b.updated ?? 0) - (a.updated ?? 0) : (b.created ?? b.updated ?? 0) - (a.created ?? a.updated ?? 0)), [data.docs, activeFolder, query, sortMode]);
  const totalCount = data.docs.length;

  function syncUserNickname(user) {
    if (!user) { nicknameUserIdRef.current = null; return; }
    if (nicknameUserIdRef.current === user.id) return;
    nicknameUserIdRef.current = user.id;
    const savedNickname = user.user_metadata?.nickname?.trim();
    const nickname = savedNickname || randomNames[Math.floor(Math.random() * randomNames.length)];
    setData(current => ({ ...current, prefs: { ...current.prefs, nickname } }));
    if (!savedNickname && supabase) supabase.auth.updateUser({ data: { nickname } }).catch(() => {});
  }

  useEffect(() => { localStorage.setItem('wbw-data', JSON.stringify(data)); }, [data]);
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (!active) return;
      setAuthUser(session?.user || null);
      syncUserNickname(session?.user || null);
      if (error) {
        const failure = classifyFailure(error);
        if (failure) setFatalError(failure);
        else setAuthError(error.message);
      }
      setAuthReady(true);
    }).catch(error => {
      if (!active) return;
      setFatalError(classifyFailure(error) || 'server');
      setAuthError(error?.message || '서버에 연결할 수 없어요.');
      setAuthReady(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUser(session?.user || null);
      syncUserNickname(session?.user || null);
      setAuthReady(true);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    const handleOffline = () => setFatalError('offline');
    const handleOnline = () => setFatalError(current => current === 'offline' ? null : current);
    if (!window.navigator.onLine) handleOffline();
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 3000); return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    if (view !== 'editor' || !editorRef.current) return;
    const editor = editorRef.current;
    editor.innerHTML = draft.body || '<p><br></p>';
    editor.focus({ preventScroll: true });
    const firstBlock = editor.firstElementChild || editor;
    const range = document.createRange();
    range.setStart(firstBlock, 0);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    editorSelectionRef.current = range.cloneRange();
  }, [view, selectedDoc]);

  function updatePrefs(key, value) { setData(d => ({ ...d, prefs: { ...d.prefs, [key]: value } })); }
  function openDoc(doc) {
    const oldMargin = doc.margin ?? 24;
    setSelectedDoc(doc.id); setDraft({ title: doc.title === '제목 없음' ? '' : (doc.title || ''), body: doc.body, page: doc.page || 'A4', viewMode: doc.viewMode || 'single', visibility: doc.visibility || '비공개', scheduleEnabled: doc.scheduleEnabled || false, scheduledAt: doc.scheduledAt || '', marginTop: doc.marginTop ?? oldMargin, marginRight: doc.marginRight ?? oldMargin, marginBottom: doc.marginBottom ?? oldMargin, marginLeft: doc.marginLeft ?? oldMargin, font: doc.font || data.prefs.font, size: doc.size || 16, spacing: doc.spacing || 0, line: doc.line || 1.9, color: doc.color || '#252525' }); setSaveState('저장됨'); setView('editor'); setProfileOpen(false);
  }
  function newDoc() {
    const doc = { id: crypto.randomUUID(), folder: activeFolder, title: '제목 없음', body: '<p><br></p>', updated: Date.now(), visibility: '비공개' };
    openDoc(doc);
  }
  function saveDraft(next = draft) {
    if (!hasBodyContent(next.body)) {
      clearTimeout(timerRef.current);
      setSaveState('저장됨');
      return false;
    }
    setSaveState('저장 중');
    setData(d => {
      const now = Date.now();
      const savedFields = { title: next.title || '제목 없음', body: next.body, page: next.page, viewMode: next.viewMode || 'single', visibility: next.visibility || '비공개', scheduleEnabled: !!next.scheduleEnabled, scheduledAt: next.scheduledAt || '', marginTop: next.marginTop, marginRight: next.marginRight, marginBottom: next.marginBottom, marginLeft: next.marginLeft, font: next.font, size: next.size, spacing: next.spacing, line: next.line, color: next.color, theme: d.prefs.theme, updated: now };
      const exists = d.docs.some(doc => doc.id === selectedDoc);
      return { ...d, docs: exists
        ? d.docs.map(doc => doc.id === selectedDoc ? { ...doc, created: doc.created ?? doc.updated ?? now, ...savedFields } : doc)
        : [{ id: selectedDoc, folder: activeFolder, visibility: '비공개', created: now, ...savedFields }, ...d.docs] };
    });
    setTimeout(() => setSaveState('저장됨'), 250);
    return true;
  }
  function changeDraft(key, value) {
    const next = { ...draft, [key]: value }; setDraft(next); setSaveState('수정 중…');
    clearTimeout(timerRef.current); timerRef.current = setTimeout(() => saveDraft(next), 900);
  }
  function resetLayout() {
    const next = { ...draft, page: 'A4', viewMode: 'single', marginTop: 24, marginRight: 24, marginBottom: 24, marginLeft: 24, spacing: 0, line: 1.9 };
    setDraft(next); setSaveState('수정 중…');
    clearTimeout(timerRef.current); timerRef.current = setTimeout(() => saveDraft(next), 900);
  }
  function onBodyInput() { if (!editorRef.current) return; changeDraft('body', editorRef.current.innerHTML); }
  function applyTextColor(color) {
    const selection = window.getSelection();
    const selectedRange = selection?.rangeCount && editorRef.current?.contains(selection.anchorNode) && !selection.isCollapsed
      ? selection.getRangeAt(0).cloneRange()
      : editorSelectionRef.current;
    if (!selectedRange || selectedRange.collapsed || !editorRef.current?.contains(selectedRange.commonAncestorContainer)) {
      changeDraft('color', color);
      return;
    }
    editorRef.current.focus();
    selection.removeAllRanges();
    selection.addRange(selectedRange);
    document.execCommand('foreColor', false, color);
    rememberEditorSelection();
    onBodyInput();
  }
  function exec(command, value) { editorRef.current?.focus(); document.execCommand(command, false, value); onBodyInput(); }
  function rememberEditorSelection() {
    const selection = window.getSelection();
    if (selection?.rangeCount && editorRef.current?.contains(selection.anchorNode)) editorSelectionRef.current = selection.getRangeAt(0).cloneRange();
  }
  function changeFontSize(size) {
    if (!Number.isFinite(size) || size < 1 || size > 72) return;
    const selection = window.getSelection();
    let range = selection?.rangeCount && editorRef.current?.contains(selection.anchorNode) && !selection.isCollapsed
      ? selection.getRangeAt(0).cloneRange()
      : editorSelectionRef.current;
    if (!range || range.collapsed || !editorRef.current?.contains(range.commonAncestorContainer)) {
      changeDraft('size', size);
      return;
    }
    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand('fontSize', false, '7');
    editorRef.current.querySelectorAll('font[size="7"]').forEach(font => {
      const span = document.createElement('span');
      span.style.fontSize = `${size}px`;
      while (font.firstChild) span.appendChild(font.firstChild);
      font.replaceWith(span);
    });
    rememberEditorSelection();
    onBodyInput();
  }
  function createFolder() {
    const name = window.prompt('새 폴더 이름을 입력해 주세요.'); if (!name?.trim()) return;
    const folder = { id: crypto.randomUUID(), name: name.trim(), parent: activeFolder };
    setData(d => ({ ...d, folders: [...d.folders, folder] })); setNotice('폴더를 만들었어요.');
  }
  function renameFolder(folder, nextName) { if (nextName?.trim()) setData(d => ({ ...d, folders: d.folders.map(f => f.id === folder.id ? { ...f, name: nextName.trim() } : f) })); }
  function deleteDoc(doc) { if (!window.confirm(`“${doc.title}” 글을 삭제할까요?`)) return; setData(d => ({ ...d, docs: d.docs.filter(x => x.id !== doc.id) })); if (selectedDoc === doc.id) setView('library'); setNotice('글을 삭제했어요.'); }
  function exportText() {
    const plain = countChars(draft.body); const blob = new Blob([`${draft.title}\n\n${plain}`], { type: 'text/plain;charset=utf-8' });
    download(blob, `${draft.title || 'WBW 문서'}.txt`); setModal('');
  }
  function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href); }
  function exportImage(kind) {
    const text = countChars(draft.body); const canvas = document.createElement('canvas'); canvas.width = 1240; canvas.height = 1754;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = exportPalette.background; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.fillStyle = exportTextColor; if (draft.title) { ctx.font = `bold 48px ${draft.font}`; ctx.fillText(draft.title, 120, 150); }
    ctx.font = `${draft.size * 2}px ${draft.font}`; ctx.fillStyle = exportTextColor; ctx.textBaseline = 'top';
    const max = canvas.width - 240; const lines = []; text.split('\n').forEach(p => { let line = ''; for (const ch of p) { if (ctx.measureText(line + ch).width > max) { lines.push(line); line = ch; } else line += ch; } lines.push(line); lines.push(''); });
    lines.slice(0, 42).forEach((line, i) => ctx.fillText(line, 120, 240 + i * draft.size * 2.6));
    canvas.toBlob(blob => { if (blob) download(blob, `${draft.title || 'WBW 문서'}.${kind}`); }); setModal('');
  }
  async function exportPdf() { setModal(''); window.print(); }
  async function handleGoogleLogin() {
    setAuthError(''); setAuthSuccess('');
    if (!isSupabaseConfigured) { setAuthError('Google 로그인을 사용하려면 Supabase 프로젝트 설정이 필요해요.'); return; }
    setAuthLoading(true);
    try { await signInWithGoogle(); } catch (e) { const failure = classifyFailure(e); if (failure) setFatalError(failure); else setAuthError(e.message || 'Google 로그인에 실패했어요.'); setAuthLoading(false); }
  }
  async function handleEmailAuth({ mode, email, password }) {
    setAuthError(''); setAuthSuccess('');
    if (!supabase) { setAuthError('이메일 로그인을 사용하려면 Supabase URL과 키를 먼저 설정해 주세요.'); return; }
    setAuthLoading(true);
    try {
      if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
        if (error) throw error;
        setAuthSuccess('비밀번호 재설정 링크를 이메일로 보냈어요.');
      } else if (mode === 'signup') {
        const nickname = randomNames[Math.floor(Math.random() * randomNames.length)];
        const { data: result, error } = await supabase.auth.signUp({ email, password, options: { data: { nickname } } });
        if (error) throw error;
        setData(current => ({ ...current, prefs: { ...current.prefs, nickname } }));
        if (result.session) { setAuthUser(result.user); syncUserNickname(result.user); }
        else setAuthSuccess('인증 이메일을 보냈어요. 이메일 인증을 마치면 자동 생성된 닉네임으로 시작할 수 있어요.');
      } else {
        const { data: result, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setAuthUser(result.user);
        syncUserNickname(result.user);
      }
    } catch (e) { const failure = classifyFailure(e); if (failure) setFatalError(failure); else setAuthError(e.message || '요청을 완료하지 못했어요.'); }
    finally { setAuthLoading(false); }
  }
  function doSignOut() {
    signOut().catch(() => {}); nicknameUserIdRef.current = null; setAuthUser(null); setPreviewMode(false); setProfileOpen(false); setView('library'); setNotice('로그아웃했어요.');
  }
  async function shareDoc() {
    if (!currentDoc) return;
    const url = `${window.location.origin}/share/${currentDoc.id}`;
    try { await navigator.clipboard.writeText(url); setNotice('공유 링크를 복사했어요. 실제 링크 권한 검증은 백엔드 연결 후 동작합니다.'); }
    catch { setNotice('공유 링크 권한 검증은 백엔드 연결 후 동작합니다.'); }
  }
  const folderLabel = folder => folder?.name || '모든 글';
  const themeClass = data.prefs.theme === 'black' ? 'theme-black' : data.prefs.theme === 'sky' ? 'theme-sky' : data.prefs.theme === 'sand' ? 'theme-sand' : data.prefs.theme === 'gray' ? 'theme-gray' : '';
  const exportPalette = themePalettes[data.prefs.theme] || themePalettes.mono;
  const exportTextColor = draft.color?.toLowerCase() === '#252525' ? exportPalette.foreground : draft.color;
  const routePath = window.location.pathname.replace(/\/+$/, '') || '/';
  const knownErrorPath = ['/403', '/500', '/offline'].includes(routePath);
  const showNotFound = routePath !== '/' && routePath !== '/index.html' && !knownErrorPath;

  if (routePath === '/403') return <ErrorScreen kind="forbidden" themeClass={themeClass} font={data.prefs.font} onHome={() => window.location.assign('/')}/>;
  if (routePath === '/500') return <ErrorScreen kind="server" themeClass={themeClass} font={data.prefs.font} onHome={() => window.location.assign('/')} onRetry={() => window.location.reload()}/>;
  if (routePath === '/offline') return <ErrorScreen kind="offline" themeClass={themeClass} font={data.prefs.font} onHome={() => window.location.assign('/')} onRetry={() => window.location.reload()}/>;
  if (showNotFound) return <ErrorScreen kind="not-found" themeClass={themeClass} font={data.prefs.font} onHome={() => window.location.assign('/')}/>;
  if (fatalError) return <ErrorScreen kind={fatalError} themeClass={themeClass} font={data.prefs.font} onHome={() => window.location.assign('/')} onRetry={() => window.location.reload()}/>;

  if (!authReady) return <main className={`app-shell login-shell ${themeClass}`}><div className="auth-loading"><span className="brand-mark">w.</span><span>WBW를 준비하고 있어요</span></div></main>;
  if (!authUser && !previewMode) return <LoginScreen
    configured={isSupabaseConfigured} loading={authLoading} error={authError} success={authSuccess}
    onGoogle={handleGoogleLogin} onEmail={handleEmailAuth}
    onPreview={() => { setPreviewMode(true); setAuthError(''); setAuthSuccess(''); }}
    clearMessages={() => { setAuthError(''); setAuthSuccess(''); }}
  />;

  return <main className={`app-shell ${themeClass}`} style={{ '--app-font': data.prefs.font }}>
    <div className="topbar">
      <button className="brand" onClick={() => setView('library')}><span className="brand-mark">w.</span><span>WBW</span></button>
      <nav className="top-nav"><button className={view==='library'?'nav-current':''} onClick={() => setView('library')}>내 서재</button></nav>
      <div className="top-actions">{isSupabaseConfigured && <span className="cloud-status connected"><i/>클라우드 설정됨</span>}<button className="avatar" aria-label="프로필 열기" onClick={() => setProfileOpen(true)}>H</button></div>
    </div>

    {view === 'library' && <section className="library-page">
      <div className="welcome-row"><div><p className="eyebrow">MY WORKSPACE</p><h1>나의 서재<span className="period">.</span></h1><p className="subtle">생각을 모으고, 문장으로 꺼내보세요.</p></div><button className="button button-dark" onClick={newDoc}><Plus size={17}/>새 글 쓰기</button></div>
      <div className="workspace-grid">
        <aside className="folder-card"><div className="card-heading"><div><span className="eyebrow">LIBRARY</span><h2>폴더</h2></div><IconButton title="폴더 추가" onClick={createFolder}><Plus size={18}/></IconButton></div>
          <button className={`folder-row ${activeFolder===null?'selected':''}`} onClick={() => setActiveFolder(null)}><BookOpen size={17}/><span>모든 글</span><small>{totalCount}</small></button>
          {data.folders.filter(f => !f.parent).map(folder => <FolderTree key={folder.id} folder={folder} all={data.folders} active={activeFolder} setActive={setActiveFolder} docs={data.docs} rename={renameFolder}/>) }
          <div className="folder-footer"><button onClick={createFolder}><FolderPlus size={16}/>새 폴더</button><span>{data.folders.length}개</span></div>
        </aside>
        <section className="documents-card"><div className="documents-head"><div><div className="crumb"><span>내 서재</span><ChevronRight size={14}/><strong>{folderLabel(selectedFolder)}</strong></div><h2>{folderLabel(selectedFolder)}</h2><p className="subtle">{visibleDocs.length}개의 글</p></div><div className="list-actions"><label className="search-box"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="글 검색"/></label><button type="button" className="sort-toggle" onClick={()=>setSortMode(mode=>mode==='modified'?'created':'modified')} title="정렬 기준 전환"><ArrowUpDown size={16}/><span>{sortMode==='modified'?'최근 수정순':'만든 순'}</span></button></div></div>
          {!!childFolders.length && <div className="subfolder-strip">{childFolders.map(f=><button className="subfolder-chip" key={f.id} onClick={()=>setActiveFolder(f.id)}><Folder size={15}/>{f.name}<ChevronRight size={14}/></button>)}</div>}
          {visibleDocs.length ? <div className="doc-list">{visibleDocs.map(doc => <article className="doc-row" key={doc.id}><button className="doc-main" onClick={()=>openDoc(doc)}><span className="doc-icon"><FileText size={18}/></span><span className="doc-copy"><strong>{doc.title || '제목 없음'}</strong><small>{countChars(doc.body).slice(0,68) || '아직 내용이 없어요.'}</small></span><time>{formatDate(doc.updated)}</time></button><span className={`visibility ${doc.visibility==='링크 공개'?'public':''}`}>{doc.visibility}</span><button className="row-more" title="삭제" onClick={()=>deleteDoc(doc)}><MoreHorizontal size={18}/></button></article>)}</div> : <div className="empty-state"><span className="empty-icon"><FilePlus2 size={22}/></span><h3>아직 이 폴더에 글이 없어요</h3><p>첫 문장을 적어볼까요?</p><button className="button button-outline" onClick={newDoc}><Plus size={16}/>글 작성하기</button></div>}
        </section>
      </div>
      <div className="home-footer"><span>WRITE BY WRITING</span><span>오늘도 당신의 문장을 응원해요.</span></div>
    </section>}

    {view === 'editor' && <section className="editor-page">
      <div className="editor-top"><button className="back-link" onClick={()=>{clearTimeout(timerRef.current);saveDraft();setView('library')}}><ArrowLeft size={17}/>내 서재</button><div className="editor-breadcrumb">{folderLabel(data.folders.find(f=>f.id===currentDoc?.folder))}<ChevronRight size={14}/><span>{draft.title || '새 글'}</span></div><div className="editor-user"><span className="save-label"><i className={saveState==='저장됨'?'saved':''}/>{saveState}</span></div></div>
      <div className="toolbar"><div className="tool-group"><label className="select-wrap"><select value={draft.page} onChange={e=>changeDraft('page',e.target.value)}><option>A4</option><option>A5</option><option>Letter</option></select><ChevronDown size={13}/></label><button className="toolbar-text" onClick={()=>setModal('layout')}>레이아웃</button></div><span className="tool-divider"/><div className="tool-group"><label className="select-wrap font-select"><select value={draft.font} onChange={e=>changeDraft('font',e.target.value)}><option>Pretendard</option><option>Georgia</option><option>바탕</option><option>맑은 고딕</option><option>serif</option></select><ChevronDown size={13}/></label><label className="numeric-toolbar"><input type="number" min="1" max="72" step="1" aria-label="글자 크기" onMouseDown={rememberEditorSelection} value={draft.size} onChange={e=>changeFontSize(Number(e.target.value))}/><span>pt</span></label><label className="icon-button color-picker-button" title="글자색" onMouseDown={rememberEditorSelection}><span className="color-dot" style={{background:draft.color}}/><input id="color-picker" className="hidden-input" aria-label="글자색 선택" type="color" value={draft.color} onChange={e=>applyTextColor(e.target.value)}/></label></div><span className="tool-divider"/><div className="tool-group"><IconButton title="굵게" onClick={()=>exec('bold')}><Bold size={17}/></IconButton><IconButton title="기울임" onClick={()=>exec('italic')}><Italic size={17}/></IconButton><IconButton title="밑줄" onClick={()=>exec('underline')}><Underline size={17}/></IconButton></div><span className="tool-divider"/><div className="tool-group"><IconButton title="왼쪽 정렬" onClick={()=>exec('justifyLeft')}><AlignLeft size={17}/></IconButton><IconButton title="가운데 정렬" onClick={()=>exec('justifyCenter')}><AlignCenter size={17}/></IconButton><IconButton title="오른쪽 정렬" onClick={()=>exec('justifyRight')}><AlignRight size={17}/></IconButton></div><span className="tool-divider"/><div className="tool-group layout-tweaks"><button className="toolbar-text" onClick={()=>setModal('layout')}>자간 · 줄 간격</button></div><div className="toolbar-spacer"/><button className="button button-light share-button" onClick={()=>setModal('upload')}><Share2 size={15}/>업로드</button><button className="button button-dark export-button" onClick={()=>setModal('export')}><Download size={15}/>내보내기</button></div>
      <div className="writing-workspace"><div className={`paper-wrap ${draft.viewMode==='double'?'paper-wrap-double':''}`}><div className={`paper ${draft.page==='Letter'?'paper-letter':'paper-paged'} ${draft.page==='A5'?'paper-a5':draft.page==='Letter'?'paper-letter-size':'paper-a4'} ${draft.viewMode==='double'?'paper-spread':''}`} style={paperStyle(draft)}><div ref={editorRef} className="prose-editor" contentEditable suppressContentEditableWarning onInput={onBodyInput} onMouseUp={rememberEditorSelection} onKeyUp={rememberEditorSelection} data-placeholder="이곳에서 글을 시작하세요." /></div></div><aside className="writing-side"><div className="side-card"><span className="eyebrow">WORD COUNT</span><strong className="word-number">{countChars(draft.body).length.toLocaleString('ko-KR')}</strong><div className="count-line"><span>공백 포함</span><b>{countChars(draft.body).length.toLocaleString('ko-KR')}</b></div><div className="count-line"><span>공백 제외</span><b>{countChars(draft.body).replace(/\s/g,'').length.toLocaleString('ko-KR')}</b></div></div><div className="side-card"><span className="eyebrow">DOCUMENT</span><div className="doc-meta"><span>폴더</span><b>{folderLabel(data.folders.find(f=>f.id===currentDoc?.folder))}</b></div><div className="doc-meta"><span>용지</span><b>{draft.page}</b></div><div className="doc-meta"><span>최근 저장</span><b>{saveState==='저장됨'?'방금 전':'저장 중'}</b></div></div><button className="side-link" onClick={()=>setModal('upload')}><Share2 size={15}/> 글 공유하기 <ChevronRight size={15}/></button></aside></div>
      <footer className="editor-footer"><span><span className="save-mini"/> {saveState}</span><span>{countChars(draft.body).length.toLocaleString('ko-KR')}자</span><span>{formatDate(currentDoc?.updated || Date.now())}</span></footer>
    </section>}

    {profileOpen && <><div className="drawer-scrim" onClick={()=>setProfileOpen(false)}/><aside className="profile-drawer"><header className="drawer-head"><span className="eyebrow">ACCOUNT</span><IconButton title="닫기" onClick={()=>setProfileOpen(false)}><X size={18}/></IconButton></header><button className="settings-shortcut" aria-label="설정" onClick={()=>{setProfileOpen(false);setSettingsOpen(true)}}><Settings size={18}/></button><div className="profile-summary"><div className="profile-avatar">{(data.prefs.nickname || 'W').slice(0,1)}</div><h2>{data.prefs.nickname}</h2><p>{authUser?.email || '로컬 미리보기 계정'}</p><span className="profile-tag">WBW WRITER</span></div><div className="drawer-rule"/><button className="drawer-link" onClick={()=>{setProfileOpen(false);setView('library')}}><BookOpen size={18}/><span>내 서재</span><ChevronRight size={16}/></button><button className="drawer-link" onClick={()=>{setProfileOpen(false);setSettingsOpen(true)}}><Settings size={18}/><span>환경 설정</span><ChevronRight size={16}/></button><div className="drawer-bottom"><p>나만의 문장을 쓰는 공간</p><button className="logout-button" onClick={doSignOut}><LogOut size={16}/>로그아웃</button></div></aside></>}

    {settingsOpen && <Modal title="환경 설정" close={()=>setSettingsOpen(false)} wide><div className="settings-body"><section className="settings-section"><div><h3>테마 색상</h3><p>서재의 분위기를 선택해요.</p></div><div className="theme-options">{[['sky','하늘','#dceefa'],['white','하양','#fff'],['black','검정','#292929'],['gray','회색','#d6d6d6'],['sand','베이지','#eee6d9']].map(([id,label,color])=><button className={`theme-option ${data.prefs.theme===id?'chosen':''}`} key={id} onClick={()=>updatePrefs('theme',id)}><i style={{background:color}}/><span>{label}</span></button>)}</div></section><section className="settings-section"><div><h3>기본 글꼴</h3><p>편집기에 사용할 글꼴을 설정해요.</p></div><select className="settings-select" value={data.prefs.font} onChange={e=>updatePrefs('font',e.target.value)}><option>Pretendard</option><option>Georgia</option><option>바탕</option><option>맑은 고딕</option><option>serif</option></select></section><section className="settings-section"><div><h3>닉네임</h3><p>서재에 표시될 이름이에요.</p></div><div className="nickname-controls"><input value={data.prefs.nickname} onChange={e=>updatePrefs('nickname',e.target.value)} maxLength={24}/><button className="button button-outline" onClick={()=>updatePrefs('nickname',randomNames[Math.floor(Math.random()*randomNames.length)])}><Sparkles size={15}/>랜덤</button></div></section><section className="danger-zone"><div><h3>계정 탈퇴</h3><p>탈퇴하면 계정과 업로드한 글이 모두 삭제됩니다.</p></div><button className="button button-danger" onClick={()=>setModal('delete-account')}><Trash2 size={15}/>계정 탈퇴</button></section></div><div className="modal-footer"><button className="button button-dark" onClick={()=>setSettingsOpen(false)}>완료</button></div></Modal>}

    {modal==='layout' && <Modal title="문서 레이아웃" close={()=>setModal('')}><div className="layout-form"><label>용지 크기<select value={draft.page} onChange={e=>changeDraft('page',e.target.value)}><option>A4</option><option>A5</option><option>Letter</option></select></label><PagePreview draft={draft}/><div className="page-view-control"><span>페이지 보기</span><div><button type="button" className={draft.viewMode==='single'?'selected':''} onClick={()=>changeDraft('viewMode','single')}>단면 보기</button><button type="button" className={draft.viewMode==='double'?'selected':''} onClick={()=>changeDraft('viewMode','double')}>양면 보기</button></div></div><fieldset className="margin-settings"><legend>여백</legend><div className="margin-grid">{[['marginTop','위쪽'],['marginRight','오른쪽'],['marginBottom','아래쪽'],['marginLeft','왼쪽']].map(([key,label])=><label className="number-setting" key={key}>{label}<span className="number-input-wrap"><input type="number" min="0" max="100" step="1" value={draft[key]} onChange={e=>changeDraft(key,Number(e.target.value))}/><small>mm</small></span></label>)}</div></fieldset><label className="number-setting">자간<span className="number-input-wrap"><input type="number" min="-1" max="10" step="0.1" value={draft.spacing} onChange={e=>changeDraft('spacing',Number(e.target.value))}/><small>px</small></span></label><label className="number-setting">줄 간격<span className="number-input-wrap"><input type="number" min="0.8" max="3" step="0.1" value={draft.line} onChange={e=>changeDraft('line',Number(e.target.value))}/><small>배</small></span></label><p className="form-note">글꼴은 이 기기에서 사용할 수 있는 글꼴을 기준으로 표시됩니다.</p></div><div className="modal-footer modal-footer-between"><button className="button button-outline" onClick={resetLayout}>기본값으로 초기화</button><button className="button button-dark" onClick={()=>setModal('')}>적용</button></div></Modal>}

    {modal==='upload' && <Modal title="글 업로드" close={()=>{setModal('');setPasswordDraft('')}}><div className="upload-form"><label>글 제목<input value={draft.title} onChange={e=>changeDraft('title',e.target.value)} placeholder="제목을 입력해 주세요"/></label><label>공개 설정<select value={draft.visibility || '비공개'} onChange={e=>{changeDraft('visibility',e.target.value);if(e.target.value!=='비밀번호 보호')setPasswordDraft('')}}><option>비공개</option><option>링크 공개</option><option>비밀번호 보호</option></select></label>{draft.visibility==='비밀번호 보호'&&<label>열람 비밀번호<input type="password" autoComplete="new-password" value={passwordDraft} onChange={e=>setPasswordDraft(e.target.value)} placeholder="비밀번호를 입력해 주세요"/></label>}<label className={`check-row ${draft.scheduleEnabled?'schedule-enabled':''}`}><input type="checkbox" checked={draft.scheduleEnabled} onChange={e=>changeDraft('scheduleEnabled',e.target.checked)}/> 예약 업로드 사용</label><label className={`schedule-time ${draft.scheduleEnabled?'schedule-enabled':''}`}>예약 시간<input type="datetime-local" min={toLocalDateTime(new Date())} value={draft.scheduledAt} onChange={e=>changeDraft('scheduledAt',e.target.value)} disabled={!draft.scheduleEnabled}/></label><div className="share-link-box"><Link2 size={16}/><span>{window.location.origin}/share/{selectedDoc?.slice(0,8) || '문서링크'}</span><button onClick={shareDoc}>복사</button></div><p className="form-note">링크 공유와 비밀번호 검증은 백엔드 권한 설정이 필요합니다.</p></div><div className="modal-footer"><button className="button button-dark" onClick={()=>{if(!hasBodyContent(draft.body)){setNotice('본문이 비어 있는 글은 저장하거나 업로드할 수 없어요.');return;}if(draft.visibility==='비밀번호 보호'&&!passwordDraft.trim()){setNotice('열람 비밀번호를 입력해 주세요.');return;}if(draft.scheduleEnabled&&(!draft.scheduledAt||new Date(draft.scheduledAt)<=new Date())){setNotice('예약 업로드는 현재보다 이후의 시간을 선택해 주세요.');return;}saveDraft();setModal('');setPasswordDraft('');setNotice(draft.scheduleEnabled?'예약 설정을 저장했어요.':'현재 공개 설정을 저장했어요.')}}>저장하기</button></div></Modal>}

    {modal==='export' && <Modal title="문서 내보내기" close={()=>setModal('')} wide><div className="export-content"><div className="preview-area"><div className="preview-paper"><span className="preview-top">WBW · {draft.page}</span>{draft.title && <h3>{draft.title}</h3>}<div className="preview-text">{countChars(draft.body).slice(0,280) || '작성한 내용이 여기에 미리 표시됩니다.'}</div><span className="preview-page">1</span></div><span className="preview-caption">1쪽 미리보기</span></div><div className="export-options"><span className="eyebrow">FILE FORMAT</span><button onClick={exportPdf}><span className="format-icon"><Printer size={18}/></span><span><b>PDF 문서</b><small>인쇄 대화상자에서 PDF로 저장</small></span><ChevronRight size={17}/></button><button onClick={exportText}><span className="format-icon"><FileText size={18}/></span><span><b>텍스트 파일</b><small>UTF-8 텍스트로 다운로드</small></span><ChevronRight size={17}/></button><button onClick={()=>exportImage('png')}><span className="format-icon"><FileImage size={18}/></span><span><b>PNG 이미지</b><small>첫 페이지를 이미지로 저장</small></span><ChevronRight size={17}/></button><button onClick={()=>exportImage('jpeg')}><span className="format-icon"><FileImage size={18}/></span><span><b>JPEG 이미지</b><small>첫 페이지를 이미지로 저장</small></span><ChevronRight size={17}/></button><p className="form-note">이미지 내보내기는 첫 페이지 기준입니다. 여러 쪽 PDF는 브라우저 인쇄 기능을 사용합니다.</p></div></div></Modal>}

    {modal==='delete-account' && <Modal title="계정 탈퇴" close={()=>{setModal('');setDeleteConfirmName('')}}><div className="delete-warning"><div className="warning-icon"><Trash2 size={20}/></div><h3>정말 탈퇴하시겠어요?</h3><p>탈퇴하면 계정과 업로드한 글이 모두 삭제되며 되돌릴 수 없습니다.</p><label>확인을 위해 닉네임을 입력해 주세요<input value={deleteConfirmName} placeholder={data.prefs.nickname} onChange={e=>setDeleteConfirmName(e.target.value)}/></label></div><div className="modal-footer"><button className="button button-outline" onClick={()=>{setModal('');setDeleteConfirmName('')}}>취소</button><button className="button button-danger" disabled={deleteConfirmName!==data.prefs.nickname} onClick={()=>setNotice('계정 삭제는 실제 인증·서버 연동 후 활성화됩니다.')}>영구 삭제</button></div></Modal>}

    {notice && <div className="toast"><Check size={16}/>{notice}<button onClick={()=>setNotice('')}><X size={14}/></button></div>}
    <style>{`@media print{@page{size:${draft.page};margin:${draft.marginTop}mm ${draft.marginRight}mm ${draft.marginBottom}mm ${draft.marginLeft}mm}}`}</style>
    <div className="print-only" style={{ ...paperStyle(draft), '--export-background': exportPalette.background, '--export-foreground': exportTextColor }}>{draft.title && <h1>{draft.title}</h1>}<div dangerouslySetInnerHTML={{__html:draft.body}} /></div>
  </main>;
}

function LoginScreen({ configured, loading, error, success, onGoogle, onEmail, onPreview, clearMessages }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const chooseMode = next => { setMode(next); clearMessages(); };

  return <main className="login-shell">
    <header className="login-header"><a className="brand" href="#top"><span className="brand-mark">w.</span><span>WBW</span></a><span className="login-header-note">WRITE BY WRITING</span></header>
    <div className="login-layout">
      <section className="login-story"><div className="story-top"><span className="story-kicker"><i/> YOUR PERSONAL WRITING SPACE</span><span className="story-number">NO. 001</span></div><div className="story-copy"><p>당신의 문장이<br/>머무는 곳.</p><span>Write freely.<br/>Keep every word.</span></div><div className="story-paper"><div className="paper-lines"><span>오늘은 조금 천천히</span><span>문장을 골라 써보기로 했다.</span><span>마음이 따라올 때까지.</span></div><span className="paper-number">01 / 03</span></div><div className="story-bottom"><span>WORDS ARE YOURS.</span><span>EST. WBW</span></div></section>
      <section className="login-panel"><div className="login-card">
        <div className="login-heading"><span className="eyebrow">WELCOME TO WBW</span><h1>{mode==='signup'?'새로운 서재를 만들어요':mode==='reset'?'비밀번호를 재설정해요':'다시, 문장을 써볼까요?'}</h1><p>{mode==='signup'?'이메일 인증을 마치면 닉네임은 자동으로 만들어져요.':mode==='reset'?'가입한 이메일 주소를 입력해 주세요.':'글을 쓰고, 정리하고, 오래 간직하세요.'}</p></div>
        {mode!=='reset' && <div className="auth-tabs"><button className={mode==='login'?'active':''} onClick={()=>chooseMode('login')}>로그인</button><button className={mode==='signup'?'active':''} onClick={()=>chooseMode('signup')}>회원가입</button></div>}
        {mode!=='reset' && <button className="google-button" onClick={onGoogle} disabled={loading}><GoogleMark/>Google 계정으로 계속하기</button>}
        {mode!=='reset' && <div className="auth-divider"><span>또는 이메일로 {mode==='signup'?'가입':'로그인'}</span></div>}
        <form className="auth-form" onSubmit={e=>{e.preventDefault();onEmail({mode,email,password});}}>
          <label>이메일<input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></label>
          {mode!=='reset' && <label>비밀번호<div className="password-wrap"><input type={showPassword?'text':'password'} required minLength={6} autoComplete={mode==='signup'?'new-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder={mode==='signup'?'6자 이상 입력해 주세요':'비밀번호를 입력해 주세요'}/><button type="button" onClick={()=>setShowPassword(v=>!v)}>{showPassword?'숨기기':'보기'}</button></div></label>}
          {mode==='login' && <button type="button" className="forgot-link" onClick={()=>chooseMode('reset')}>비밀번호를 잊으셨나요?</button>}
          {error && <p className="auth-message auth-error" role="alert">{error}</p>}{success && <p className="auth-message auth-success" role="status">{success}</p>}
          <button type="submit" className="button button-dark auth-submit" disabled={loading}>{loading?<span className="button-spinner"/>:null}{mode==='signup'?'계정 만들기':mode==='reset'?'재설정 링크 보내기':'로그인'}</button>
        </form>
        {mode==='reset' && <button className="return-login" onClick={()=>chooseMode('login')}><ArrowLeft size={14}/>로그인으로 돌아가기</button>}
        {!configured && <div className="setup-hint"><span className="hint-dot"/><span>로그인을 연결하려면 관리자에게 WBW 인증 설정을 요청해 주세요.</span></div>}
        <div className="preview-entry"><span>먼저 둘러보고 싶다면</span><button onClick={onPreview}>로컬 미리보기 <ChevronRight size={14}/></button></div>
      </div><p className="login-legal">계속 진행하면 WBW의 이용 약관과 개인정보 처리방침에 동의하는 것으로 간주됩니다.</p></section>
    </div><footer className="login-footer"><span>© 2026 WBW</span><span>WRITE BY WRITING</span></footer>
  </main>;
}

function GoogleMark() { return <span className="google-mark" aria-hidden="true">G</span>; }

function FolderTree({ folder, all, active, setActive, docs, rename }) {
  const nested = all.filter(f => f.parent === folder.id);
  const count = docs.filter(d => d.folder === folder.id).length;
  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(folder.name);
  function saveName() { setEditing(false); if (editName.trim() && editName.trim() !== folder.name) rename(folder, editName); }
  return <div className="folder-branch">
    <div className={`folder-row ${active===folder.id?'selected':''}`}>
      <button type="button" className="folder-disclosure" disabled={!nested.length} aria-label={expanded?'하위 폴더 접기':'하위 폴더 펼치기'} onClick={()=>setExpanded(value=>!value)}><Folder size={17}/></button>
      <button type="button" className="folder-select" onClick={()=>!editing && setActive(folder.id)}>
        {editing ? <input className="folder-name-input" autoFocus value={editName} onChange={e=>setEditName(e.target.value)} onBlur={saveName} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();if(e.key==='Escape'){setEditName(folder.name);setEditing(false)}}}/> : <span onDoubleClick={e=>{e.stopPropagation();setEditName(folder.name);setEditing(true)}} title="더블클릭해서 이름 바꾸기">{folder.name}</span>}
        <small>{count}</small>
      </button>
    </div>
    {expanded && nested.map(child=><div className="nested-folder" key={child.id}><FolderTree folder={child} all={all} active={active} setActive={setActive} docs={docs} rename={rename}/></div>)}
  </div>;
}
