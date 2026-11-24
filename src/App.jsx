import React, { useEffect, useMemo, useRef, useState } from 'react';
import './styles.css';
import './login.css';
import {
  AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowLeft, ArrowUpDown,
  Bold, BookOpen, Check, ChevronDown, ChevronRight, ChevronsUpDown,
  CircleHelp, Clock3, Download, FilePlus2, FileText, Folder,
  FolderPlus, Italic, Link2, LogOut, Menu, Minus, MoreHorizontal, PanelLeftClose,
  Plus, Printer, Search, Settings, Share2, SlidersHorizontal, Sparkles,
  Trash2, Underline, X
} from 'lucide-react';
import { getCurrentUser, startGoogleLogin, signOut } from './backend.js';

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

function ReadDocument({ doc, theme, onBack, isShared, viewerNickname = '말하는 하마', viewerEmail = '', onOpenSettings, locked = false, password = '', onPasswordChange, onVerify, onEdit, onDelete, dialog, dialogInput, setDialogInput, closeDialog, notice, clearNotice }) {
  const themeClass = theme === 'black' ? 'theme-black' : theme === 'sky' ? 'theme-sky' : theme === 'sand' ? 'theme-sand' : theme === 'gray' ? 'theme-gray' : '';
  const palette = themePalettes[theme] || themePalettes.white;
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const menuRef = useRef(null);
  const contentColor = doc.color?.toLowerCase() === '#252525' ? palette.foreground : (doc.color || palette.foreground);
  useEffect(() => {
    const oldBodyColor = document.body.style.backgroundColor;
    const oldHtmlColor = document.documentElement.style.backgroundColor;
    document.body.style.backgroundColor = palette.background;
    document.documentElement.style.backgroundColor = palette.background;
    return () => { document.body.style.backgroundColor = oldBodyColor; document.documentElement.style.backgroundColor = oldHtmlColor; };
  }, [palette.background]);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const closeOutside = event => { if (!menuRef.current?.contains(event.target)) setMenuOpen(false); };
    document.addEventListener('pointerdown', closeOutside);
    return () => { document.removeEventListener('pointerdown', closeOutside); };
  }, [menuOpen]);
  return <main className={`app-shell reader-shell ${themeClass}`} style={{ '--app-font': doc.font || 'Pretendard', '--reader-bg': palette.background, '--reader-text': palette.foreground }}>
    <header className="reader-topbar"><button className="brand" onClick={onBack}><span className="brand-mark">w.</span><span>WBW</span></button><div className="reader-actions"><span className="reader-label">READING</span>{!isShared && !locked && <div className="reader-menu-wrap" ref={menuRef}><button className="reader-more" aria-label="글 메뉴" aria-expanded={menuOpen} onClick={() => setMenuOpen(open => !open)}><MoreHorizontal size={20}/></button>{menuOpen && <div className="row-menu reader-row-menu"><button onClick={() => { setMenuOpen(false); onEdit?.(); }}>수정하기</button><button className="danger" onClick={() => { setMenuOpen(false); onDelete?.(); }}>삭제하기</button></div>}</div>}<button className="avatar reader-avatar" aria-label="프로필 열기" onClick={() => setProfileOpen(true)}>{viewerNickname.slice(0,1) || 'W'}</button></div></header>
    {locked ? <section className="reader-password-card"><div className="reader-lock-mark">w.</div><span className="eyebrow">PASSWORD PROTECTED</span><h1>비밀번호를 입력해 주세요</h1><p>글쓴이가 공유한 글을 읽으려면 비밀번호가 필요해요.</p><form onSubmit={e => { e.preventDefault(); onVerify(); }}><input type="password" value={password} onChange={e => onPasswordChange(e.target.value)} autoFocus placeholder="열람 비밀번호"/><button className="button button-dark">글 읽기</button></form></section> : <article className="reader-paper" style={{ fontFamily: doc.font || 'Pretendard', color: palette.foreground }}>
      <div className="reader-paper-meta"><span>WRITE BY WRITING</span><span>{formatDate(doc.updated || Date.now())}</span></div>
      <h1 style={{ color: palette.foreground }}>{doc.title || '제목 없는 글'}</h1>
      <div className="reader-author">{doc.authorNickname || '말하는 하마'}</div>
      <div className="reader-body" style={{ fontFamily: doc.font || 'Pretendard', fontSize: `${doc.size || 16}px`, lineHeight: doc.line || 1.9, letterSpacing: `${doc.spacing || 0}px`, color: contentColor }} dangerouslySetInnerHTML={{ __html: doc.body || '' }}/>
    </article>}
    {dialog && <Modal title={dialog.title} close={() => closeDialog(false)}><div className="confirm-dialog-copy"><p>{dialog.message}</p></div><div className="modal-footer"><button className="button button-outline" onClick={() => closeDialog(false)}>취소</button><button className={`button ${dialog.danger?'button-danger':'button-dark'}`} onClick={() => closeDialog(true)}>{dialog.confirmLabel || '확인'}</button></div></Modal>}
    {notice && <div className="notice-veil" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)clearNotice()}}><section className="notice-dialog" role="alertdialog" aria-modal="true" aria-live="assertive"><div className="notice-icon"><Check size={18}/></div><p>{notice}</p><button className="button button-dark" onClick={clearNotice}>확인</button></section></div>}
    {profileOpen && <><div className="drawer-scrim" onClick={() => setProfileOpen(false)}/><aside className="profile-drawer"><header className="drawer-head"><span className="eyebrow">ACCOUNT</span><IconButton title="닫기" onClick={() => setProfileOpen(false)}><X size={18}/></IconButton></header><div className="profile-summary"><div className="profile-avatar">{viewerNickname.slice(0,1) || 'W'}</div><h2>{viewerNickname}</h2><p>{viewerEmail || 'WBW 사용자'}</p><span className="profile-tag">WBW WRITER</span></div><div className="drawer-rule"/><button className="drawer-link" onClick={onBack}><BookOpen size={18}/><span>{isShared ? 'WBW 둘러보기' : '내 서재'}</span><ChevronRight size={16}/></button>{onOpenSettings && <button className="drawer-link" onClick={() => { setProfileOpen(false); onOpenSettings(); }}><Settings size={18}/><span>환경 설정</span><ChevronRight size={16}/></button>}</aside></>}
  </main>;
}

export default function App() {
  const [data, setData] = useState(loadData);
  const [authUser, setAuthUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [fatalError, setFatalError] = useState(null);
  const [authSuccess, setAuthSuccess] = useState('');
  const [activeFolder, setActiveFolder] = useState('f2');
  const [folderDeleteMode, setFolderDeleteMode] = useState(false);
  const [sortMode, setSortMode] = useState('modified');
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [draftFolder, setDraftFolder] = useState(null);
  const [openDocMenu, setOpenDocMenu] = useState(null);
  const [sharePasswordInput, setSharePasswordInput] = useState('');
  const [sharePasswordVerified, setSharePasswordVerified] = useState(false);
  const [view, setView] = useState('library');
  const [profileOpen, setProfileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modal, setModal] = useState('');
  const [dialog, setDialog] = useState(null);
  const [dialogInput, setDialogInput] = useState('');
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState('');
  const [toastNotice, setToastNotice] = useState('');
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [draft, setDraft] = useState({ title: '', body: '', page: 'A4', viewMode: 'single', visibility: '비공개', scheduleEnabled: false, scheduledAt: '', marginTop: 24, marginRight: 24, marginBottom: 24, marginLeft: 24, font: 'Pretendard', size: 16, spacing: 0, line: 1.9, color: '#252525' });
  const [passwordDraft, setPasswordDraft] = useState('');
  const [saveState, setSaveState] = useState('저장됨');
  const editorRef = useRef(null);
  const timerRef = useRef(null);
  const nicknameUserIdRef = useRef(null);
  const editorSelectionRef = useRef(null);
  const currentDoc = data.docs.find(d => d.id === selectedDoc);
  const shareMatch = window.location.pathname.match(/^\/share\/([^/]+)\/?$/);
  const sharedDoc = shareMatch ? data.docs.find(doc => doc.id === shareMatch[1]) : null;
  const selectedFolder = data.folders.find(f => f.id === activeFolder);
  const childFolders = data.folders.filter(f => f.parent === activeFolder);
  const visibleDocs = useMemo(() => data.docs.filter(d => (activeFolder === null || d.folder === activeFolder) && (!query || d.title.toLowerCase().includes(query.toLowerCase()))).sort((a,b) => sortMode === 'modified' ? (b.updated ?? 0) - (a.updated ?? 0) : (b.created ?? b.updated ?? 0) - (a.created ?? a.updated ?? 0)), [data.docs, activeFolder, query, sortMode]);
  const totalCount = data.docs.length;

  function syncUserNickname(user) {
    if (!user) { nicknameUserIdRef.current = null; return; }
    if (nicknameUserIdRef.current === user.id) return;
    nicknameUserIdRef.current = user.id;
    setData(current => ({ ...current, prefs: { ...current.prefs, nickname: current.prefs.nickname || randomNames[Math.floor(Math.random() * randomNames.length)] } }));
  }

  useEffect(() => { localStorage.setItem('wbw-data', JSON.stringify(data)); }, [data]);
  useEffect(() => {
    let active = true;
    getCurrentUser().then(user => {
      if (!active) return;
      setAuthUser(user);
      syncUserNickname(user);
      if (new URLSearchParams(window.location.search).get('error') === 'oauth') setAuthError('Google 로그인에 실패했어요. 잠시 후 다시 시도해 주세요.');
      setAuthReady(true);
    }).catch(error => {
      if (!active) return;
      setAuthError(error?.message || '백엔드 서버에 연결할 수 없어요. 서버 실행 상태를 확인해 주세요.');
      setAuthReady(true);
    });
    return () => { active = false; };
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
    if (!openDocMenu) return undefined;
    const closeOutside = event => { if (!event.target.closest?.('.row-menu-wrap')) setOpenDocMenu(null); };
    document.addEventListener('pointerdown', closeOutside);
    return () => { document.removeEventListener('pointerdown', closeOutside); };
  }, [openDocMenu]);
  useEffect(() => {
    if (!toastNotice) return undefined;
    const timer = setTimeout(() => setToastNotice(''), 3000);
    return () => clearTimeout(timer);
  }, [toastNotice]);
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

  function updatePrefs(key, value) {
    setData(d => ({
      ...d,
      prefs: { ...d.prefs, [key]: value },
      ...(key === 'nickname' ? { docs: d.docs.map(doc => ({ ...doc, authorNickname: value })) } : {})
    }));
  }
  function openDoc(doc) {
    const oldMargin = doc.margin ?? 24;
    setSelectedDoc(doc.id); setDraftFolder(doc.folder ?? null); setDraft({ title: doc.title === '제목 없음' ? '' : (doc.title || ''), body: doc.body, page: doc.page || 'A4', viewMode: doc.viewMode || 'single', visibility: doc.visibility || '비공개', scheduleEnabled: doc.scheduleEnabled || false, scheduledAt: doc.scheduledAt || '', marginTop: doc.marginTop ?? oldMargin, marginRight: doc.marginRight ?? oldMargin, marginBottom: doc.marginBottom ?? oldMargin, marginLeft: doc.marginLeft ?? oldMargin, font: doc.font || data.prefs.font, size: doc.size || 16, spacing: doc.spacing || 0, line: doc.line || 1.9, color: doc.color || '#252525' }); setSaveState('저장됨'); setView('editor'); setProfileOpen(false);
  }
  function newDoc() {
    const doc = { id: crypto.randomUUID(), folder: activeFolder, title: '', body: '<p><br></p>', updated: Date.now(), visibility: '비공개', uploaded: false };
    setDraftFolder(activeFolder);
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
        : [{ id: selectedDoc, folder: draftFolder, visibility: '비공개', uploaded: false, created: now, ...savedFields }, ...d.docs] };
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
  function changeFont(font) {
    const selection = window.getSelection();
    const range = selection?.rangeCount && editorRef.current?.contains(selection.anchorNode) && !selection.isCollapsed
      ? selection.getRangeAt(0).cloneRange()
      : editorSelectionRef.current;
    if (!range || range.collapsed || !editorRef.current?.contains(range.commonAncestorContainer)) {
      changeDraft('font', font);
      return;
    }
    editorRef.current.focus({ preventScroll: true });
    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand('fontName', false, font);
    rememberEditorSelection();
    onBodyInput();
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
    setDialogInput('');
    setDialog({ type: 'prompt', title: '새 폴더', message: '폴더 이름을 입력해 주세요.', confirmLabel: '만들기', onConfirm: name => {
      if (!name?.trim()) { setNotice('폴더 이름을 입력해 주세요.'); return; }
      const folder = { id: crypto.randomUUID(), name: name.trim(), parent: activeFolder };
      setData(d => ({ ...d, folders: [...d.folders, folder] })); setNotice('폴더를 만들었어요.');
    }});
  }
  function deleteFolder(folder) {
    const descendants = new Set();
    const collect = id => data.folders.filter(item => item.parent === id).forEach(child => { descendants.add(child.id); collect(child.id); });
    collect(folder.id);
    const removed = new Set([folder.id, ...descendants]);
    const warning = descendants.size
      ? `“${folder.name}” 폴더와 하위 폴더 ${descendants.size}개, 그 안의 글 ${data.docs.filter(doc => removed.has(doc.folder)).length}개를 모두 삭제할까요? 삭제한 내용은 복구할 수 없습니다.`
      : `“${folder.name}” 폴더와 그 안의 글 ${data.docs.filter(doc => doc.folder === folder.id).length}개를 삭제할까요? 삭제한 내용은 복구할 수 없습니다.`;
    setDialog({ type: 'confirm', title: '폴더 삭제', message: warning, confirmLabel: '삭제하기', danger: true, onConfirm: () => {
      setData(current => ({ ...current, folders: current.folders.filter(item => !removed.has(item.id)), docs: current.docs.filter(doc => !removed.has(doc.folder)) }));
      if (removed.has(activeFolder)) setActiveFolder(folder.parent ?? null);
      if (removed.has(draftFolder)) { setDraftFolder(null); setView('library'); }
      setToastNotice('폴더와 포함된 글을 삭제했어요.');
    }});
  }
  function moveFolder(folderId, nextParentId) {
    const branch = new Set();
    const collect = id => data.folders.filter(item => item.parent === id).forEach(child => { branch.add(child.id); collect(child.id); });
    collect(folderId);
    if (nextParentId === folderId || branch.has(nextParentId)) { setNotice('폴더를 자기 자신이나 하위 폴더 안으로 옮길 수 없어요.'); return; }
    setData(current => ({ ...current, folders: current.folders.map(folder => folder.id === folderId ? { ...folder, parent: nextParentId } : folder) }));
    setNotice(nextParentId ? '하위 폴더로 옮겼어요.' : '최상위 폴더로 옮겼어요.');
  }
  function renameFolder(folder, nextName) { if (nextName?.trim()) setData(d => ({ ...d, folders: d.folders.map(f => f.id === folder.id ? { ...f, name: nextName.trim() } : f) })); }
  function deleteDoc(doc) {
    setDialog({ type: 'confirm', title: '글 삭제', message: `“${doc.title || '제목 없음'}” 글을 삭제할까요? 삭제한 글은 복구할 수 없습니다.`, confirmLabel: '삭제하기', danger: true, onConfirm: () => {
      setData(d => ({ ...d, docs: d.docs.filter(item => item.id !== doc.id) }));
      if (selectedDoc === doc.id) { setView('library'); setSelectedDoc(null); if (window.location.pathname.startsWith('/share/')) window.history.pushState({}, '', '/'); }
      setToastNotice('글을 삭제했어요.');
    }});
  }
  function closeDialog(confirmed = false) {
    const current = dialog;
    setDialog(null);
    if (confirmed) current?.onConfirm?.(dialogInput);
    setDialogInput('');
  }
  async function exportPdf() { setModal(''); window.print(); }
  function handleGoogleLogin() {
    setAuthError(''); setAuthSuccess('');
    setAuthLoading(true);
    startGoogleLogin();
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
  function openDocFromList(doc) {
    const wasUploaded = doc.uploaded ?? doc.visibility !== '비공개';
    if (!wasUploaded) { openDoc(doc); return; }
    setSelectedDoc(doc.id);
    setView('reader');
  }
  function editDoc(doc) { setOpenDocMenu(null); openDoc(doc); }
  function confirmSharePassword() {
    if (sharePasswordInput === sharedDoc?.sharePassword) setSharePasswordVerified(true);
    else setNotice('비밀번호가 맞지 않아요.');
  }
  function saveUpload() {
    if (!hasBodyContent(draft.body)) { setNotice('본문이 비어 있는 글은 저장하거나 업로드할 수 없어요.'); return; }
    if (draft.visibility === '비밀번호 보호' && !passwordDraft.trim()) { setNotice('열람 비밀번호를 입력해 주세요.'); return; }
    if (draft.scheduleEnabled && (!draft.scheduledAt || new Date(draft.scheduledAt) <= new Date())) { setNotice('예약 업로드는 현재보다 이후의 시간을 선택해 주세요.'); return; }
    if (!draft.title.trim()) { setNotice('업로드할 글 제목을 입력해 주세요.'); return; }
    saveDraft();
    setData(d => ({ ...d, docs: d.docs.map(doc => doc.id === selectedDoc ? { ...doc, uploaded: true, sharePassword: draft.visibility === '비밀번호 보호' ? passwordDraft : '', visibility: draft.visibility || '비공개', authorNickname: d.prefs.nickname, theme: d.prefs.theme } : doc) }));
    setModal(''); setPasswordDraft(''); setNotice(draft.scheduleEnabled ? '예약 업로드를 설정했어요.' : '글을 업로드했어요.');
  }
  const folderLabel = folder => folder?.name || '모든 글';
  function folderPath(folderId) {
    const path = [];
    let folder = data.folders.find(item => item.id === folderId);
    while (folder) {
      path.unshift(folder.name);
      folder = data.folders.find(item => item.id === folder.parent);
    }
    return path.length ? path.join(' > ') : '모든 글';
  }
  function handleFolderDrop(event, targetParentId) {
    event.preventDefault();
    const draggedId = event.dataTransfer.getData('text/wbw-folder');
    if (draggedId) moveFolder(draggedId, targetParentId);
  }
  const themeClass = data.prefs.theme === 'black' ? 'theme-black' : data.prefs.theme === 'sky' ? 'theme-sky' : data.prefs.theme === 'sand' ? 'theme-sand' : data.prefs.theme === 'gray' ? 'theme-gray' : '';
  const exportPalette = themePalettes[data.prefs.theme] || themePalettes.mono;
  const exportTextColor = draft.color?.toLowerCase() === '#252525' ? exportPalette.foreground : draft.color;
  const routePath = window.location.pathname.replace(/\/+$/, '') || '/';
  const knownErrorPath = ['/403', '/500', '/offline', '/login'].includes(routePath);
  const isShareRoute = /^\/share\/[^/]+\/?$/.test(window.location.pathname);
  const showNotFound = routePath !== '/' && routePath !== '/index.html' && !knownErrorPath && !isShareRoute;

  if (routePath === '/403') return <ErrorScreen kind="forbidden" themeClass={themeClass} font={data.prefs.font} onHome={() => window.location.assign('/')}/>;
  if (routePath === '/500') return <ErrorScreen kind="server" themeClass={themeClass} font={data.prefs.font} onHome={() => window.location.assign('/')} onRetry={() => window.location.reload()}/>;
  if (routePath === '/offline') return <ErrorScreen kind="offline" themeClass={themeClass} font={data.prefs.font} onHome={() => window.location.assign('/')} onRetry={() => window.location.reload()}/>;
  if (showNotFound) return <ErrorScreen kind="not-found" themeClass={themeClass} font={data.prefs.font} onHome={() => window.location.assign('/')}/>;
  if (fatalError) return <ErrorScreen kind={fatalError} themeClass={themeClass} font={data.prefs.font} onHome={() => window.location.assign('/')} onRetry={() => window.location.reload()}/>;

  if (isShareRoute) {
    if (!sharedDoc) return <ErrorScreen kind="not-found" themeClass={themeClass} font={data.prefs.font} onHome={() => window.location.assign('/')}/>;
    const sharedIsUploaded = sharedDoc.uploaded ?? sharedDoc.visibility !== '비공개';
    if (!sharedIsUploaded || sharedDoc.visibility === '비공개') return <ErrorScreen kind="forbidden" themeClass={themeClass} font={data.prefs.font} onHome={() => window.location.assign('/')}/>;
    if (sharedDoc.scheduleEnabled && sharedDoc.scheduledAt && new Date(sharedDoc.scheduledAt) > new Date()) return <ErrorScreen kind="not-found" themeClass={themeClass} font={data.prefs.font} onHome={() => window.location.assign('/')}/>;
    const passwordLocked = sharedDoc.visibility === '비밀번호 보호' && !sharePasswordVerified;
    return <ReadDocument doc={sharedDoc} theme={data.prefs.theme || 'white'} viewerNickname={data.prefs.nickname} viewerEmail={authUser?.email} isShared locked={passwordLocked} password={sharePasswordInput} onPasswordChange={setSharePasswordInput} onVerify={confirmSharePassword} onBack={() => window.location.assign('/')} notice={notice} clearNotice={() => setNotice('')}/>;
  }

  if (!authReady) return <main className={`app-shell login-shell ${themeClass}`}><div className="auth-loading"><span className="brand-mark">w.</span><span>WBW를 준비하고 있어요</span></div></main>;
  if (!authUser && !previewMode) return <LoginScreen
    loading={authLoading} error={authError} startGoogleLogin={handleGoogleLogin}
    onPreview={() => { setPreviewMode(true); setAuthError(''); setAuthSuccess(''); }}
  />;

  if (view === 'reader' && currentDoc) return <main className={`app-shell ${themeClass}`} style={{ '--app-font': data.prefs.font }}><ReadDocument doc={currentDoc} theme={data.prefs.theme || 'white'} viewerNickname={data.prefs.nickname} viewerEmail={authUser?.email || '로컬 미리보기 계정'} isShared={false} onBack={() => setView('library')} onEdit={() => editDoc(currentDoc)} onDelete={() => deleteDoc(currentDoc)} onOpenSettings={() => { setView('library'); setSettingsOpen(true); }} dialog={dialog} dialogInput={dialogInput} setDialogInput={setDialogInput} closeDialog={closeDialog} notice={notice} clearNotice={() => setNotice('')}/></main>;

  return <main className={`app-shell ${themeClass}`} style={{ '--app-font': data.prefs.font }}>
    <div className="topbar">
      <button className="brand" onClick={() => setView('library')}><span className="brand-mark">w.</span><span>WBW</span></button>
      <nav className="top-nav"><button className={view==='library'?'nav-current':''} onClick={() => setView('library')}>내 서재</button></nav>
      <div className="top-actions"><button className="avatar" aria-label="프로필 열기" onClick={() => setProfileOpen(true)}>{(data.prefs.nickname || 'W').slice(0,1)}</button></div>
    </div>

    {view === 'library' && <section className="library-page">
      <div className="welcome-row"><div><p className="eyebrow">MY WORKSPACE</p><h1>나의 서재<span className="period">.</span></h1><p className="subtle">생각을 모으고, 문장으로 꺼내보세요.</p></div><button className="button button-dark" onClick={newDoc}><Plus size={17}/>새 글 쓰기</button></div>
      <div className="workspace-grid">
        <aside className="folder-card"><div className="card-heading"><div><span className="eyebrow">LIBRARY</span><h2>폴더</h2></div><div className="folder-heading-actions"><IconButton title="폴더 추가" onClick={createFolder}><Plus size={18}/></IconButton><IconButton title={folderDeleteMode?'폴더 삭제 모드 닫기':'폴더 삭제 모드'} active={folderDeleteMode} onClick={()=>setFolderDeleteMode(value=>!value)}><Minus size={18}/></IconButton></div></div>
          <button className={`folder-row ${activeFolder===null?'selected':''}`} onClick={() => setActiveFolder(null)} onDragOver={event=>event.preventDefault()} onDrop={event=>handleFolderDrop(event,null)}><BookOpen size={17}/><span>모든 글</span><small>{totalCount}</small></button>
          {data.folders.filter(f => !f.parent).map(folder => <FolderTree key={folder.id} folder={folder} all={data.folders} active={activeFolder} setActive={setActiveFolder} docs={data.docs} rename={renameFolder} deleteMode={folderDeleteMode} removeFolder={deleteFolder} moveFolder={moveFolder}/>) }
        </aside>
        <section className="documents-card"><div className="documents-head"><div><div className="crumb"><span>내 서재</span><ChevronRight size={14}/><strong>{folderLabel(selectedFolder)}</strong></div><h2>{folderLabel(selectedFolder)}</h2><p className="subtle">{visibleDocs.length}개의 글</p></div><div className="list-actions"><label className="search-box"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="글 검색"/></label><button type="button" className="sort-toggle" onClick={()=>setSortMode(mode=>mode==='modified'?'created':'modified')} title="정렬 기준 전환"><ArrowUpDown size={16}/><span>{sortMode==='modified'?'최근 수정순':'만든 순'}</span></button></div></div>
          {!!childFolders.length && <div className="subfolder-strip">{childFolders.map(f=><button className="subfolder-chip" key={f.id} onClick={()=>setActiveFolder(f.id)}><Folder size={15}/>{f.name}<ChevronRight size={14}/></button>)}</div>}
          {visibleDocs.length ? <div className="doc-list">{visibleDocs.map(doc => { const uploaded = doc.uploaded ?? doc.visibility !== '비공개'; return <article className="doc-row" key={doc.id}><button className="doc-main" onClick={()=>openDocFromList(doc)}><span className="doc-icon"><FileText size={18}/></span><span className="doc-copy"><strong>{doc.title || '제목 없음'}</strong><small>{countChars(doc.body).slice(0,68) || '아직 내용이 없어요.'}</small></span><time>{formatDate(doc.updated)}</time></button>{uploaded && <span className={`visibility ${doc.visibility==='링크 공개'?'public':''}`}>{doc.visibility}</span>}<div className="row-menu-wrap"><button className="row-more" title="글 메뉴" aria-label={`${doc.title} 글 메뉴`} aria-expanded={openDocMenu===doc.id} onClick={()=>setOpenDocMenu(value=>value===doc.id?null:doc.id)}><MoreHorizontal size={18}/></button>{openDocMenu===doc.id&&<div className="row-menu">{uploaded&&<button onClick={()=>editDoc(doc)}>수정하기</button>}<button className="danger" onClick={()=>{setOpenDocMenu(null);deleteDoc(doc)}}>삭제하기</button></div>}</div></article>; })}</div> : <div className="empty-state"><span className="empty-icon"><FilePlus2 size={22}/></span><h3>아직 이 폴더에 글이 없어요</h3><p>첫 문장을 적어볼까요?</p><button className="button button-outline" onClick={newDoc}><Plus size={16}/>글 작성하기</button></div>}
        </section>
      </div>
      <div className="home-footer"><span>WRITE BY WRITING</span><span>오늘도 당신의 문장을 응원해요.</span></div>
    </section>}

    {view === 'editor' && <section className="editor-page">
      <div className="editor-top"><button className="back-link" onClick={()=>{clearTimeout(timerRef.current);saveDraft();setView('library')}}><ArrowLeft size={17}/>내 서재</button><div className="editor-breadcrumb">{folderLabel(data.folders.find(f=>f.id===draftFolder))}<ChevronRight size={14}/><span>{draft.title || '새 글'}</span></div><div className="editor-user"><span className="save-label"><i className={saveState==='저장됨'?'saved':''}/>{saveState}</span></div></div>
      <div className="toolbar"><div className="tool-group"><label className="select-wrap"><select value={draft.page} onChange={e=>changeDraft('page',e.target.value)}><option>A4</option><option>A5</option><option>Letter</option></select><ChevronDown size={13}/></label><button className="toolbar-text" onClick={()=>setModal('layout')}>레이아웃</button></div><span className="tool-divider"/><div className="tool-group"><label className="select-wrap font-select"><select value={draft.font} onMouseDown={rememberEditorSelection} onChange={e=>changeFont(e.target.value)}><option>Pretendard</option><option>Georgia</option><option>바탕</option><option>맑은 고딕</option><option>serif</option></select><ChevronDown size={13}/></label><label className="numeric-toolbar"><input type="number" min="1" max="72" step="1" aria-label="글자 크기" onMouseDown={rememberEditorSelection} value={draft.size} onChange={e=>changeFontSize(Number(e.target.value))}/><span>pt</span></label><label className="icon-button color-picker-button" title="글자색" onMouseDown={rememberEditorSelection}><span className="color-dot" style={{background:draft.color}}/><input id="color-picker" className="hidden-input" aria-label="글자색 선택" type="color" value={draft.color} onChange={e=>applyTextColor(e.target.value)}/></label></div><span className="tool-divider"/><div className="tool-group"><IconButton title="굵게" onClick={()=>exec('bold')}><Bold size={17}/></IconButton><IconButton title="기울임" onClick={()=>exec('italic')}><Italic size={17}/></IconButton><IconButton title="밑줄" onClick={()=>exec('underline')}><Underline size={17}/></IconButton></div><span className="tool-divider"/><div className="tool-group"><IconButton title="왼쪽 정렬" onClick={()=>exec('justifyLeft')}><AlignLeft size={17}/></IconButton><IconButton title="가운데 정렬" onClick={()=>exec('justifyCenter')}><AlignCenter size={17}/></IconButton><IconButton title="오른쪽 정렬" onClick={()=>exec('justifyRight')}><AlignRight size={17}/></IconButton></div><span className="tool-divider"/><div className="tool-group layout-tweaks"><button className="toolbar-text" onClick={()=>setModal('layout')}>자간 · 줄 간격</button></div><div className="toolbar-spacer"/><button className="button button-light share-button" onClick={()=>setModal('upload')}><Share2 size={15}/>업로드</button><button className="button button-dark export-button" onClick={()=>setModal('export')}><Download size={15}/>내보내기</button></div>
      <div className="writing-workspace"><div className={`paper-wrap ${draft.viewMode==='double'?'paper-wrap-double':''}`}><div className={`paper ${draft.page==='Letter'?'paper-letter':'paper-paged'} ${draft.page==='A5'?'paper-a5':draft.page==='Letter'?'paper-letter-size':'paper-a4'} ${draft.viewMode==='double'?'paper-spread':''}`} style={paperStyle(draft)}><div ref={editorRef} className="prose-editor" contentEditable suppressContentEditableWarning onInput={onBodyInput} onMouseUp={rememberEditorSelection} onKeyUp={rememberEditorSelection} data-placeholder="이곳에서 글을 시작하세요." /></div></div><aside className="writing-side"><div className="side-card"><span className="eyebrow">WORD COUNT</span><strong className="word-number">{countChars(draft.body).length.toLocaleString('ko-KR')}</strong><div className="count-line"><span>공백 포함</span><b>{countChars(draft.body).length.toLocaleString('ko-KR')}</b></div><div className="count-line"><span>공백 제외</span><b>{countChars(draft.body).replace(/\s/g,'').length.toLocaleString('ko-KR')}</b></div></div><div className="side-card"><span className="eyebrow">DOCUMENT</span><div className="doc-meta"><span>폴더</span><b>{folderPath(draftFolder)}</b></div><div className="doc-meta"><span>용지</span><b>{draft.page}</b></div><div className="doc-meta"><span>최근 저장</span><b>{saveState==='저장됨'?'방금 전':'저장 중'}</b></div></div><button className="side-link" onClick={()=>setModal('upload')}><Share2 size={15}/> 글 공유하기 <ChevronRight size={15}/></button></aside></div>
      <footer className="editor-footer"><span><span className="save-mini"/> {saveState}</span><span>{countChars(draft.body).length.toLocaleString('ko-KR')}자</span><span>{formatDate(currentDoc?.updated || Date.now())}</span></footer>
    </section>}

    {profileOpen && <><div className="drawer-scrim" onClick={()=>setProfileOpen(false)}/><aside className="profile-drawer"><header className="drawer-head"><span className="eyebrow">ACCOUNT</span><IconButton title="닫기" onClick={()=>setProfileOpen(false)}><X size={18}/></IconButton></header><div className="profile-summary"><div className="profile-avatar">{(data.prefs.nickname || 'W').slice(0,1)}</div><h2>{data.prefs.nickname}</h2><p>{authUser?.email || '로컬 미리보기 계정'}</p><span className="profile-tag">WBW WRITER</span></div><div className="drawer-rule"/><button className="drawer-link" onClick={()=>{setProfileOpen(false);setView('library')}}><BookOpen size={18}/><span>내 서재</span><ChevronRight size={16}/></button><button className="drawer-link" onClick={()=>{setProfileOpen(false);setSettingsOpen(true)}}><Settings size={18}/><span>환경 설정</span><ChevronRight size={16}/></button><div className="drawer-bottom"><p>나만의 문장을 쓰는 공간</p><button className="logout-button" onClick={doSignOut}><LogOut size={16}/>로그아웃</button></div></aside></>}

    {settingsOpen && <Modal title="환경 설정" close={()=>setSettingsOpen(false)} wide><div className="settings-body"><section className="settings-section"><div><h3>테마 색상</h3><p>서재의 분위기를 선택해요.</p></div><div className="theme-options">{[['sky','하늘','#dceefa'],['white','하양','#fff'],['black','검정','#292929'],['gray','회색','#d6d6d6'],['sand','베이지','#eee6d9']].map(([id,label,color])=><button className={`theme-option ${data.prefs.theme===id?'chosen':''}`} key={id} onClick={()=>updatePrefs('theme',id)}><i style={{background:color}}/><span>{label}</span></button>)}</div></section><section className="settings-section"><div><h3>기본 글꼴</h3><p>편집기에 사용할 글꼴을 설정해요.</p></div><select className="settings-select" value={data.prefs.font} onChange={e=>updatePrefs('font',e.target.value)}><option>Pretendard</option><option>Georgia</option><option>바탕</option><option>맑은 고딕</option><option>serif</option></select></section><section className="settings-section"><div><h3>닉네임</h3><p>서재에 표시될 이름이에요.</p></div><div className="nickname-controls"><input value={data.prefs.nickname} onChange={e=>updatePrefs('nickname',e.target.value)} maxLength={24}/><button className="button button-outline" onClick={()=>updatePrefs('nickname',randomNames[Math.floor(Math.random()*randomNames.length)])}><Sparkles size={15}/>랜덤</button></div></section><section className="danger-zone"><div><h3>계정 탈퇴</h3><p>탈퇴하면 계정과 업로드한 글이 모두 삭제됩니다.</p></div><button className="button button-danger" onClick={()=>setModal('delete-account')}><Trash2 size={15}/>계정 탈퇴</button></section></div><div className="modal-footer"><button className="button button-dark" onClick={()=>setSettingsOpen(false)}>완료</button></div></Modal>}

    {modal==='layout' && <Modal title="문서 레이아웃" close={()=>setModal('')}><div className="layout-form"><label>용지 크기<select value={draft.page} onChange={e=>changeDraft('page',e.target.value)}><option>A4</option><option>A5</option><option>Letter</option></select></label><PagePreview draft={draft}/><div className="page-view-control"><span>페이지 보기</span><div><button type="button" className={draft.viewMode==='single'?'selected':''} onClick={()=>changeDraft('viewMode','single')}>단면 보기</button><button type="button" className={draft.viewMode==='double'?'selected':''} onClick={()=>changeDraft('viewMode','double')}>양면 보기</button></div></div><fieldset className="margin-settings"><legend>여백</legend><div className="margin-grid">{[['marginTop','위쪽'],['marginRight','오른쪽'],['marginBottom','아래쪽'],['marginLeft','왼쪽']].map(([key,label])=><label className="number-setting" key={key}>{label}<span className="number-input-wrap"><input type="number" min="0" max="100" step="1" value={draft[key]} onChange={e=>changeDraft(key,Number(e.target.value))}/><small>mm</small></span></label>)}</div></fieldset><label className="number-setting">자간<span className="number-input-wrap"><input type="number" min="-1" max="10" step="0.1" value={draft.spacing} onChange={e=>changeDraft('spacing',Number(e.target.value))}/><small>px</small></span></label><label className="number-setting">줄 간격<span className="number-input-wrap"><input type="number" min="0.8" max="3" step="0.1" value={draft.line} onChange={e=>changeDraft('line',Number(e.target.value))}/><small>배</small></span></label><p className="form-note">글꼴은 이 기기에서 사용할 수 있는 글꼴을 기준으로 표시됩니다.</p></div><div className="modal-footer modal-footer-between"><button className="button button-outline" onClick={resetLayout}>기본값으로 초기화</button><button className="button button-dark" onClick={()=>setModal('')}>적용</button></div></Modal>}

    {modal==='upload' && <Modal title="글 업로드" close={()=>{setModal('');setPasswordDraft('')}}><div className="upload-form"><label>글 제목<input value={draft.title} onChange={e=>changeDraft('title',e.target.value)} placeholder="제목을 입력해 주세요"/></label><label>공개 설정<select value={draft.visibility || '비공개'} onChange={e=>{changeDraft('visibility',e.target.value);if(e.target.value!=='비밀번호 보호')setPasswordDraft('')}}><option>비공개</option><option>링크 공개</option><option>비밀번호 보호</option></select></label>{draft.visibility==='비밀번호 보호'&&<label>열람 비밀번호<input type="password" autoComplete="new-password" value={passwordDraft} onChange={e=>setPasswordDraft(e.target.value)} placeholder="비밀번호를 입력해 주세요"/></label>}<label className={`check-row ${draft.scheduleEnabled?'schedule-enabled':''}`}><input type="checkbox" checked={draft.scheduleEnabled} onChange={e=>changeDraft('scheduleEnabled',e.target.checked)}/> 예약 업로드 사용</label><label className={`schedule-time ${draft.scheduleEnabled?'schedule-enabled':''}`}>예약 시간<input type="datetime-local" min={toLocalDateTime(new Date())} value={draft.scheduledAt} onChange={e=>changeDraft('scheduledAt',e.target.value)} disabled={!draft.scheduleEnabled}/></label><div className="share-link-box"><Link2 size={16}/><span>{window.location.origin}/share/{selectedDoc || '문서링크'}</span><button onClick={shareDoc}>복사</button></div><p className="form-note">공개 링크와 비밀번호 확인은 실제 공유 배포 시 백엔드 권한 검증이 필요합니다.</p></div><div className="modal-footer"><button className="button button-dark" onClick={saveUpload}>저장하기</button></div></Modal>}

    {modal==='export' && <Modal title="문서 내보내기" close={()=>setModal('')} wide><div className="export-content"><div className="preview-area"><div className="preview-paper"><span className="preview-top">WBW · {draft.page}</span>{draft.title && <h3>{draft.title}</h3>}<div className="preview-text">{countChars(draft.body).slice(0,280) || '작성한 내용이 여기에 미리 표시됩니다.'}</div><span className="preview-page">1</span></div><span className="preview-caption">1쪽 미리보기</span></div><div className="export-options"><span className="eyebrow">FILE FORMAT</span><button onClick={exportPdf}><span className="format-icon"><Printer size={18}/></span><span><b>PDF 문서</b><small>인쇄 대화상자에서 PDF로 저장</small></span><ChevronRight size={17}/></button></div></div></Modal>}

    {modal==='delete-account' && <Modal title="계정 탈퇴" close={()=>{setModal('');setDeleteConfirmName('')}}><div className="delete-warning"><div className="warning-icon"><Trash2 size={20}/></div><h3>정말 탈퇴하시겠어요?</h3><p>탈퇴하면 계정과 업로드한 글이 모두 삭제되며 되돌릴 수 없습니다.</p><label>확인을 위해 닉네임을 입력해 주세요<input value={deleteConfirmName} placeholder={data.prefs.nickname} onChange={e=>setDeleteConfirmName(e.target.value)}/></label></div><div className="modal-footer"><button className="button button-outline" onClick={()=>{setModal('');setDeleteConfirmName('')}}>취소</button><button className="button button-danger" disabled={deleteConfirmName!==data.prefs.nickname} onClick={()=>setNotice('계정 삭제는 실제 인증·서버 연동 후 활성화됩니다.')}>영구 삭제</button></div></Modal>}

    {dialog && <Modal title={dialog.title} close={()=>closeDialog(false)}><div className="confirm-dialog-copy"><p>{dialog.message}</p>{dialog.type==='prompt'&&<input className="dialog-input" autoFocus value={dialogInput} onChange={event=>setDialogInput(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();closeDialog(true);}}} placeholder="폴더 이름"/>}</div><div className="modal-footer"><button className="button button-outline" onClick={()=>closeDialog(false)}>취소</button><button className={`button ${dialog.danger?'button-danger':'button-dark'}`} onClick={()=>closeDialog(true)}>{dialog.confirmLabel || '확인'}</button></div></Modal>}

    {notice && <div className="notice-veil" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setNotice('')}}><section className="notice-dialog" role="alertdialog" aria-modal="true" aria-live="assertive"><div className="notice-icon"><Check size={18}/></div><p>{notice}</p><button className="button button-dark" onClick={()=>setNotice('')}>확인</button></section></div>}
    {toastNotice && <div className="toast"><Check size={16}/>{toastNotice}</div>}
    <style>{`@media print{@page{size:${draft.page};margin:${draft.marginTop}mm ${draft.marginRight}mm ${draft.marginBottom}mm ${draft.marginLeft}mm}}`}</style>
    <div className="print-only" style={{ ...paperStyle(draft), '--export-background': exportPalette.background, '--export-foreground': exportTextColor }}>{draft.title && <h1>{draft.title}</h1>}<div dangerouslySetInnerHTML={{__html:draft.body}} /></div>
  </main>;
}

function LoginScreen({ loading, error, startGoogleLogin, onPreview }) {
  return <main className="login-shell">
    <header className="login-header"><a className="brand" href="#top"><span className="brand-mark">w.</span><span>WBW</span></a><span className="login-header-note">WRITE BY WRITING</span></header>
    <div className="login-layout">
      <section className="login-story"><div className="story-top"><span className="story-kicker"><i/> YOUR PERSONAL WRITING SPACE</span><span className="story-number">NO. 001</span></div><div className="story-copy"><p>당신의 문장이<br/>머무는 곳.</p><span>Write freely.<br/>Keep every word.</span></div><div className="story-paper"><div className="paper-lines"><span>오늘은 조금 천천히</span><span>문장을 골라 써보기로 했다.</span><span>마음이 따라올 때까지.</span></div><span className="paper-number">01 / 03</span></div><div className="story-bottom"><span>WORDS ARE YOURS.</span><span>EST. WBW</span></div></section>
      <section className="login-panel"><div className="login-card">
        <div className="login-heading"><span className="eyebrow">WELCOME TO WBW</span><h1>다시, 문장을 써볼까요?</h1><p>글을 쓰고, 정리하고, 오래 간직하세요.</p></div>
        {error && <p className="auth-message auth-error" role="alert">{error}</p>}
        <button className="google-button" onClick={startGoogleLogin} disabled={loading}>{loading?<span className="button-spinner"/>:<GoogleMark/>}Google 계정으로 계속하기</button>
        <div className="preview-entry"><span>먼저 둘러보고 싶다면</span><button onClick={onPreview}>로컬 미리보기 <ChevronRight size={14}/></button></div>
      </div><p className="login-legal">계속 진행하면 WBW의 이용 약관과 개인정보 처리방침에 동의하는 것으로 간주됩니다.</p></section>
    </div><footer className="login-footer"><span>© 2026 WBW</span><span>WRITE BY WRITING</span></footer>
  </main>;
}

function GoogleMark() { return <span className="google-mark" aria-hidden="true">G</span>; }

function FolderTree({ folder, all, active, setActive, docs, rename, deleteMode, removeFolder, moveFolder }) {
  const nested = all.filter(f => f.parent === folder.id);
  const count = docs.filter(d => d.folder === folder.id).length;
  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(folder.name);
  function saveName() { setEditing(false); if (editName.trim() && editName.trim() !== folder.name) rename(folder, editName); }
  return <div className="folder-branch">
    <div className={`folder-row ${active===folder.id?'selected':''}`} draggable={!editing} onDragStart={event=>{if(event.target.closest?.('.folder-delete')){event.preventDefault();return;}event.dataTransfer.setData('text/wbw-folder',folder.id);event.dataTransfer.effectAllowed='move';}} onDragOver={event=>{event.preventDefault();event.currentTarget.classList.add('drop-target');}} onDragLeave={event=>event.currentTarget.classList.remove('drop-target')} onDrop={event=>{event.preventDefault();event.stopPropagation();event.currentTarget.classList.remove('drop-target');const draggedId=event.dataTransfer.getData('text/wbw-folder');if(draggedId){setExpanded(true);moveFolder(draggedId,folder.id);}}}>
      <button type="button" className="folder-disclosure" disabled={!nested.length} aria-label={expanded?'하위 폴더 접기':'하위 폴더 펼치기'} onClick={()=>setExpanded(value=>!value)}><Folder size={17}/></button>
      <button type="button" className="folder-select" onClick={()=>!editing && setActive(folder.id)}>
        {editing ? <input className="folder-name-input" autoFocus value={editName} onChange={e=>setEditName(e.target.value)} onBlur={saveName} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();if(e.key==='Escape'){setEditName(folder.name);setEditing(false)}}}/> : <span onDoubleClick={e=>{e.stopPropagation();setEditName(folder.name);setEditing(true)}} title="더블클릭해서 이름 바꾸기">{folder.name}</span>}
      </button>
      {deleteMode ? <button type="button" className="folder-delete" aria-label={`${folder.name} 폴더 삭제`} title="폴더와 하위 폴더 삭제" onClick={event=>{event.stopPropagation();removeFolder(folder);}}><Minus size={17}/></button> : <small className="folder-count">{count}</small>}
    </div>
    {expanded && nested.map(child=><div className="nested-folder" key={child.id}><FolderTree folder={child} all={all} active={active} setActive={setActive} docs={docs} rename={rename} deleteMode={deleteMode} removeFolder={removeFolder} moveFolder={moveFolder}/></div>)}
  </div>;
}
