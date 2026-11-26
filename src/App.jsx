import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { getCurrentUser, startGoogleLogin, signOut, getFolders, createFolder as apiCreateFolder, updateFolder as apiUpdateFolder, removeFolder as apiRemoveFolder, getDocuments, getDocument, createDocument, updateDocument, moveDocument, deleteDocument, getShares, createShare, updateShare, getSettings, getFonts, updateSettings as apiUpdateSettings, getPublicShare, verifyPublicShare, downloadDocumentPdf } from './backend.js';

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
    return { ...merged, docs: merged.docs.map((doc, index) => {
      const { scheduleEnabled: _scheduleEnabled, scheduledAt: _scheduledAt, ...fields } = doc;
      return { ...fields, created: doc.created ?? migrationTime - index };
    }) };
  }
  catch { return initial; }
};
const formatDate = value => new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(value);
const countChars = html => (html || '').replace(/<[^>]+>/g, '').replaceAll('&nbsp;', ' ').replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>');
const hasBodyContent = html => countChars(html).replace(/[\s\u200b\ufeff]/g, '').length > 0;
// Placeholder visibility must treat typed spaces as input, even though a whitespace-only
// document is still considered empty for saving/upload validation.
const hasEditorInput = html => {
  if (!html) return false;
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  return (parsed.body.textContent || '').length > 0;
};
function transferContainsImageOrVideo(transfer) {
  if (!transfer) return false;
  const isImageOrVideoFile = file => {
    const type = String(file?.type || '').toLowerCase();
    const name = String(file?.name || '').toLowerCase();
    return type.startsWith('image/') || type.startsWith('video/') || /\.(png|jpe?g|gif|webp|bmp|avif|heic|svg|mp4|mov|webm|mkv|avi|ogv)$/i.test(name);
  };
  if (Array.from(transfer.files || []).some(isImageOrVideoFile)) return true;
  if (Array.from(transfer.items || []).some(item => item.kind === 'file' && isImageOrVideoFile({ type: item.type }))) return true;
  const html = transfer.getData?.('text/html') || '';
  if (!html) return false;
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  return Boolean(parsed.querySelector('img, video, picture, source, iframe, object, embed, svg')) || /data:(image|video)\//i.test(html);
}
function documentListTitle(doc) {
  const title = String(doc?.title || '').trim();
  if (title && title !== '제목 없음') return title;
  let firstParagraph = '';
  if (doc?.contentJson?.content) {
    const paragraph = doc.contentJson.content.find(node => node.type === 'paragraph' && !node.attrs?.pageBreak);
    const readNode = node => node.type === 'text' ? node.text || '' : node.type === 'hardBreak' ? '\n' : (node.content || []).map(readNode).join('');
    firstParagraph = paragraph ? readNode(paragraph).replace(/[\r\n]+/g, ' ').trim() : '';
  }
  if (!firstParagraph && doc?.body) {
    const parsed = new DOMParser().parseFromString(doc.body, 'text/html');
    const paragraph = parsed.body.querySelector('p') || parsed.body.firstElementChild;
    firstParagraph = paragraph ? htmlToPlainText(paragraph.outerHTML).replace(/[\r\n]+/g, ' ').trim() : '';
  }
  if (!firstParagraph && !doc?.backendId) firstParagraph = String(doc?.preview || '').split(/\n/)[0].trim();
  return firstParagraph.slice(0, 10) || '내용 없음';
}
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
function htmlToPlainText(html) {
  const body = new DOMParser().parseFromString(html || '', 'text/html').body;
  const blockTags = new Set(['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'BLOCKQUOTE', 'PRE']);
  const read = node => {
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || '';
    if (node.nodeType !== Node.ELEMENT_NODE) return [...node.childNodes].map(read).join('');
    if (node.tagName === 'BR') return '\n';
    const content = [...node.childNodes].map(read).join('');
    return blockTags.has(node.tagName) ? `${content}\n` : content;
  };
  return [...body.childNodes].map(read).join('').replace(/\n{3,}/g, '\n\n').trim();
}
function htmlToTipTap(html, attrs = {}) {
  const parsed = new DOMParser().parseFromString(html || '<p></p>', 'text/html');
  const metaStyle = attrs?.wbw?.style || {};
  const defaultTextStyle = {
    fontSize: metaStyle.fontSize == null ? undefined : `${metaStyle.fontSize}px`,
    letterSpacing: metaStyle.letterSpacing,
    color: metaStyle.color
  };
  Object.keys(defaultTextStyle).forEach(key => {
    if (defaultTextStyle[key] == null || defaultTextStyle[key] === '') delete defaultTextStyle[key];
  });
  const defaultIndent = attrs?.wbw?.layout?.firstLineIndent ?? true;
  const inline = node => {
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue ? [{ type: 'text', text: node.nodeValue }] : [];
    if (node.nodeType !== Node.ELEMENT_NODE) return [];
    const tag = node.tagName.toLowerCase();
    if (tag === 'br') return [{ type: 'hardBreak' }];
    let content = [...node.childNodes].flatMap(inline);
    let marks = [];
    if (tag === 'b' || tag === 'strong') marks.push({ type: 'bold' });
    if (tag === 'i' || tag === 'em') marks.push({ type: 'italic' });
    if (tag === 'u') marks.push({ type: 'underline' });
    if (tag === 's' || tag === 'strike' || tag === 'del') marks.push({ type: 'strike' });
    const style = node.getAttribute('style') || '';
    const attrs = {};
    const fontFamily = node.getAttribute('face') || node.style?.fontFamily;
    if (fontFamily) attrs.fontFamily = fontFamily.replaceAll('"', '').replaceAll("'", '');
    const size = node.style?.fontSize;
    if (size) attrs.fontSize = size;
    const color = node.style?.color || (tag === 'font' ? node.getAttribute('color') : null);
    if (color) attrs.color = color;
    if (Object.keys(attrs).length) marks.push({ type: 'textStyle', attrs });
    if (style.includes('text-decoration') && style.includes('underline') && !marks.some(mark => mark.type === 'underline')) marks.push({ type: 'underline' });
    return content.map(item => marks.length ? { ...item, marks: [...(item.marks || []), ...marks] } : item);
  };
  const block = node => {
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue.trim() ? [{ type: 'paragraph', content: inline(node) }] : [];
    if (node.nodeType !== Node.ELEMENT_NODE) return [];
    const tag = node.tagName.toLowerCase();
    // Shift+Enter로 넣은 쪽 나누기 표시는 빈 문단(pageBreak 속성)으로 저장해 다시 불러올 때 복원한다.
    if (tag === 'div' && node.classList.contains('wbw-page-break')) return [{ type: 'paragraph', attrs: { pageBreak: true, textIndent: 0 } }];
    if (tag === 'ul' || tag === 'ol') return [{ type: tag === 'ul' ? 'bulletList' : 'orderedList', content: [...node.children].flatMap(block) }];
    if (tag === 'li') return [{ type: 'listItem', content: [...node.childNodes].flatMap(child => ['p','h1','h2','h3'].includes(child.tagName?.toLowerCase()) ? block(child) : inline(child)).filter(Boolean) }];
    if (tag === 'blockquote') return [{ type: 'blockquote', content: [...node.childNodes].flatMap(block) }];
    if (tag === 'hr') return [{ type: 'horizontalRule' }];
    if (tag === 'pre') return [{ type: 'codeBlock', content: inline(node) }];
    if (tag === 'p' || /^h[1-3]$/.test(tag) || tag === 'div') {
      const type = /^h[1-3]$/.test(tag) ? 'heading' : 'paragraph';
      const attrs = {};
      if (type === 'heading') attrs.level = Number(tag[1]);
      if (node.style?.textAlign) attrs.textAlign = node.style.textAlign;
      const textIndent = node.style?.textIndent ? Number.parseFloat(node.style.textIndent) : Number(defaultIndent);
      attrs.textIndent = Number.isFinite(textIndent) ? textIndent : (defaultIndent ? 1 : 0);
      if (metaStyle.lineHeight != null) attrs.lineHeight = Number(metaStyle.lineHeight);
      if (metaStyle.paragraphSpacing != null) attrs.paragraphSpacing = Number(metaStyle.paragraphSpacing);
      return [{ type, ...(Object.keys(attrs).length ? { attrs } : {}), content: inline(node) }];
    }
    return inline(node).length ? [{ type: 'paragraph', content: inline(node) }] : [];
  };
  const content = [...parsed.body.childNodes].flatMap(block);
  const applyDefaultStyles = node => {
    if (node.type === 'text') {
      const marks = node.marks || [];
      const styleMarks = marks.filter(mark => mark.type === 'textStyle');
      if (Object.keys(defaultTextStyle).length || styleMarks.length) {
        const explicit = [...styleMarks].reverse().reduce((result, mark) => ({ ...result, ...(mark.attrs || {}) }), {});
        const combinedStyle = { ...defaultTextStyle, ...explicit };
        if (explicit.fontFamily && metaStyle.fontFamily && uiFont(explicit.fontFamily) === uiFont(metaStyle.fontFamily)) delete combinedStyle.fontFamily;
        if (combinedStyle.fontFamily) combinedStyle.fontFamily = apiFont(combinedStyle.fontFamily);
        return { ...node, marks: [...marks.filter(mark => mark.type !== 'textStyle'), { type: 'textStyle', attrs: combinedStyle }] };
      }
      return node;
    }
    if (!node.content) return node;
    return { ...node, content: node.content.map(applyDefaultStyles) };
  };
  return { type: 'doc', ...(Object.keys(attrs).length ? { attrs } : {}), content: (content.length ? content : [{ type: 'paragraph', attrs: { textIndent: defaultIndent ? 1 : 0 } }]).map(applyDefaultStyles) };
}
function tipTapToHtml(doc, defaultFont = doc?.attrs?.wbw?.style?.fontFamily) {
  const defaultUiFont = defaultFont ? uiFont(defaultFont) : null;
  const renderInline = node => {
    if (node.type === 'hardBreak') return '<br>';
    if (node.type !== 'text') return '';
    let out = escapeHtml(node.text || '');
    for (const mark of node.marks || []) {
      if (mark.type === 'bold') out = `<strong>${out}</strong>`;
      else if (mark.type === 'italic') out = `<em>${out}</em>`;
      else if (mark.type === 'underline') out = `<u>${out}</u>`;
      else if (mark.type === 'strike') out = `<s>${out}</s>`;
      else if (mark.type === 'textStyle') { const a = mark.attrs || {}; const fontFamily = a.fontFamily && (!defaultUiFont || uiFont(a.fontFamily) !== defaultUiFont) ? a.fontFamily : ''; const css = [`font-family:${fontFamily}`, `font-size:${a.fontSize || ''}`, `color:${a.color || ''}`].filter(x => !x.endsWith(':')).join(';'); if (css) out = `<span style="${escapeHtml(css)}">${out}</span>`; }
    }
    return out;
  };
  const render = node => {
    const children = (node.content || []).map(render).join('');
    if (node.type === 'text' || node.type === 'hardBreak') return renderInline(node);
    if (node.type === 'doc') return children;
    if (node.type === 'paragraph' && node.attrs?.pageBreak) return '<div class="wbw-page-break" contenteditable="false" aria-hidden="true"></div>';
    if (node.type === 'paragraph' || node.type === 'heading') { const tag = node.type === 'heading' ? `h${node.attrs?.level || 1}` : 'p'; const style = [`text-align:${node.attrs?.textAlign || ''}`, `line-height:${node.attrs?.lineHeight || ''}`, `margin-bottom:${node.attrs?.paragraphSpacing ? `${node.attrs.paragraphSpacing}em` : ''}`].filter(x => !x.endsWith(':')).join(';'); return `<${tag}${style ? ` style="${style}"` : ''}>${children || '<br>'}</${tag}>`; }
    if (node.type === 'bulletList') return `<ul>${children}</ul>`;
    if (node.type === 'orderedList') return `<ol>${children}</ol>`;
    if (node.type === 'listItem') return `<li>${children}</li>`;
    if (node.type === 'blockquote') return `<blockquote>${children}</blockquote>`;
    if (node.type === 'codeBlock') return `<pre>${children}</pre>`;
    if (node.type === 'horizontalRule') return '<hr>';
    return children;
  };
  return render(doc || { type: 'doc', content: [] });
}
function authorNicknameFrom(source) {
  return source?.authorNickname || source?.writerNickname || source?.authorName || source?.author?.nickname || source?.author?.name || source?.writer?.nickname || source?.owner?.nickname || '';
}
function normalizeServerDocument(serverDoc, fallback = {}, prefs = {}) {
  const content = serverDoc?.content ?? serverDoc?.contentJson ?? fallback.contentJson;
  const wbwMeta = content?.attrs?.wbw || {};
  const layout = wbwMeta.layout || {};
  const style = wbwMeta.style || {};
  const rawSpacing = serverDoc?.letterSpacing ?? serverDoc?.spacing ?? fallback.spacing ?? style.letterSpacing ?? (prefs.letterSpacing == null ? 0 : `${prefs.letterSpacing}em`);
  const rawSpacingValue = Number.parseFloat(rawSpacing);
  const spacingBaseSize = Number(serverDoc?.fontSize ?? fallback.size ?? style.fontSize ?? prefs.fontSize ?? 16);
  const spacing = Number.isFinite(rawSpacingValue) ? (typeof rawSpacing === 'string' && rawSpacing.trim().endsWith('em') ? rawSpacingValue * spacingBaseSize : rawSpacingValue) : 0;
  const rawPageSize = serverDoc?.pageSize ?? serverDoc?.page ?? fallback.page ?? layout.page ?? 'A4';
  const pageSize = String(rawPageSize).toUpperCase() === 'LETTER' ? 'Letter' : rawPageSize;
  return {
    ...fallback,
    ...serverDoc,
    id: String(serverDoc?.id ?? fallback.id ?? ''),
    backendId: serverDoc?.id ?? fallback.backendId,
    folder: (serverDoc?.folderId ?? fallback.folderId ?? fallback.folder) == null ? null : String(serverDoc?.folderId ?? fallback.folderId ?? fallback.folder),
    title: serverDoc?.title ?? fallback.title ?? '',
    body: content ? tipTapToHtml(content, serverDoc?.fontFamily ?? serverDoc?.font ?? fallback.font ?? style.fontFamily ?? prefs.font) : (serverDoc?.body ?? fallback.body ?? ''),
    contentJson: content,
    page: pageSize,
    viewMode: serverDoc?.viewMode ?? fallback.viewMode ?? layout.viewMode ?? 'single',
    marginTop: serverDoc?.marginTop ?? fallback.marginTop ?? layout.marginTop,
    marginRight: serverDoc?.marginRight ?? fallback.marginRight ?? layout.marginRight,
    marginBottom: serverDoc?.marginBottom ?? fallback.marginBottom ?? layout.marginBottom,
    marginLeft: serverDoc?.marginLeft ?? fallback.marginLeft ?? layout.marginLeft,
    font: uiFont(serverDoc?.fontFamily ?? serverDoc?.font ?? fallback.font ?? style.fontFamily ?? prefs.font),
    size: serverDoc?.fontSize ?? serverDoc?.size ?? fallback.size ?? style.fontSize ?? prefs.fontSize ?? 16,
    spacing,
    line: serverDoc?.lineHeight ?? serverDoc?.line ?? fallback.line ?? style.lineHeight ?? prefs.lineHeight ?? 1.9,
    paragraphSpacing: serverDoc?.paragraphSpacing ?? fallback.paragraphSpacing ?? style.paragraphSpacing ?? prefs.paragraphSpacing ?? 0.8,
    firstLineIndent: layout.firstLineIndent ?? fallback.firstLineIndent ?? true,
    color: serverDoc?.textColor ?? serverDoc?.color ?? fallback.color ?? style.color,
    created: Date.parse(serverDoc?.createdAt || '') || serverDoc?.created || fallback.created || Date.now(),
    updated: Date.parse(serverDoc?.updatedAt || '') || serverDoc?.updated || fallback.updated || Date.now(),
    authorNickname: authorNicknameFrom(serverDoc) || wbwMeta.authorNickname || fallback.authorNickname || '',
    preview: serverDoc?.preview || (content ? htmlToPlainText(content ? tipTapToHtml(content) : '') : '') || fallback.preview || htmlToPlainText(serverDoc?.body ?? fallback.body ?? '')
  };
}
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
  '--paper-paragraph-spacing': `${draft.paragraphSpacing ?? 0.8}em`,
  '--paper-color': draft.color,
  '--paper-margin-top': `${draft.marginTop ?? 24}mm`,
  '--paper-margin-right': `${draft.marginRight ?? 24}mm`,
  '--paper-margin-bottom': `${draft.marginBottom ?? 24}mm`,
  '--paper-margin-left': `${draft.marginLeft ?? 24}mm`,
  '--paper-first-line-indent': draft.firstLineIndent === false ? '0' : '1em'
});

/* ------------------------------------------------------------------
   쪽(페이지) 계산
   - 글은 하나의 contenteditable 안에 그대로 이어서 쓰고, 문단(블록)마다 transform으로
     "몇 번째 쪽의 어디"에 보일지만 정한다. (DOM 구조/여백/레이아웃을 바꾸지 않는다.)
   - 위에서부터 차례로 계산하며 이동량을 누적하므로, 앞 문단이 밀리면 뒤 문단도 같이 밀린다.
   - 양면 보기는 같은 흐름을 1 2 / 3 4 순서로 배치하고, 종이 전체를 축소해서 글자·자간도 같은 비율로 줄어든다.
   ------------------------------------------------------------------ */
const SHEET_GAP = 20;
const MM_TO_PX = 96 / 25.4;
const REF_SHEET_WIDTH = { A4: 900, A5: 900 * 148 / 210, Letter: 900 };
function pageGeometry(page, viewMode, available) {
  const size = pageSizes[page] || pageSizes.A4;
  const ratio = size.height / size.width;
  const double = page !== 'Letter' && viewMode === 'double';
  const room = Math.max(240, Number(available) || 900);
  let sheetW;
  let scale = 1;
  if (double) {
    sheetW = REF_SHEET_WIDTH[page] || 900;
    scale = Math.min(1, room / (sheetW * 2 + SHEET_GAP));
  } else {
    const base = Math.min(room, 900);
    sheetW = page === 'A5' ? base * 148 / 210 : base;
  }
  return { double, sheetW, sheetH: sheetW * ratio, gap: SHEET_GAP, scale };
}
function cleanEditorHtml(editor) {
  const clone = editor.cloneNode(true);
  clone.querySelectorAll('[data-wbw-page], [data-wbw-page-shift]').forEach(block => {
    block.removeAttribute('data-wbw-page');
    block.removeAttribute('data-wbw-page-shift');
    block.style.removeProperty('transform');
    block.style.removeProperty('--wbw-page-base-margin');
    block.style.removeProperty('--wbw-page-push');
    if (!block.getAttribute('style')) block.removeAttribute('style');
  });
  return clone.innerHTML;
}
function paginateEditor(editor, geometry, margins) {
  if (!editor) return 1;
  const { double, sheetW, sheetH, gap } = geometry;
  const unit = sheetH + gap;
  const topMargin = Math.max(0, (Number(margins.top) || 0) * MM_TO_PX);
  const bottomMargin = Math.max(0, (Number(margins.bottom) || 0) * MM_TO_PX);
  const usable = Math.max(40, sheetH - topMargin - bottomMargin);
  const origin = editor.offsetTop;
  const contentStart = page => page * unit + topMargin;
  const contentEnd = page => page * unit + sheetH - bottomMargin;
  let shift = 0;
  let minPage = 0;
  let lastPage = 0;
  Array.from(editor.children).forEach(block => {
    const isBreak = block.classList.contains('wbw-page-break');
    const height = block.offsetHeight;
    const top = origin + block.offsetTop + shift;
    const bottom = top + height;
    let page = Math.max(0, Math.floor(top / unit));
    let push = 0;
    if (page < minPage) {
      page = minPage;
      push = contentStart(page) - top;
    } else if (top < contentStart(page) - 0.5) {
      push = contentStart(page) - top;
    } else if (!isBreak && top >= contentEnd(page) - 0.5) {
      page += 1;
      push = contentStart(page) - top;
    } else if (!isBreak && bottom > contentEnd(page) + 0.5 && height <= usable + 0.5) {
      page += 1;
      push = contentStart(page) - top;
    }
    shift += push;
    if (isBreak) minPage = page + 1;
    const placedTop = top + push;
    lastPage = Math.max(lastPage, page, Math.floor((placedTop + Math.max(height, 1) - 1) / unit));

    const dx = double ? (page % 2) * (sheetW + gap) : 0;
    const dy = shift - (double ? Math.ceil(page / 2) * unit : 0);
    const tx = Math.round(dx);
    const ty = Math.round(dy);
    if (tx || ty) {
      const value = `translate(${tx}px, ${ty}px)`;
      if (block.style.transform !== value) block.style.transform = value;
      if (block.getAttribute('data-wbw-page') !== '1') block.setAttribute('data-wbw-page', '1');
    } else if (block.hasAttribute('data-wbw-page') || block.style.transform) {
      block.removeAttribute('data-wbw-page');
      block.style.removeProperty('transform');
      if (!block.getAttribute('style')) block.removeAttribute('style');
    }
  });
  return lastPage + 1;
}

const randomNames = ['말하는 하마', '느긋한 문어', '잠든 고양이', '산책하는 구름', '수줍은 여우', '책 읽는 펭귄', '느린 거북이'];
const API_FONT_FAMILIES = ['Pretendard', 'Noto Serif KR', 'Noto Sans KR', 'Nanum Myeongjo', 'Nanum Gothic', 'Gowun Batang', 'Gowun Dodum'];
const apiFont = font => {
  const name = String(font || '').split(',')[0].replace(/["']/g, '').trim();
  const mapped = ({ Pretendard: 'Pretendard', '맑은 고딕': 'Noto Sans KR', 'Malgun Gothic': 'Noto Sans KR', 'sans-serif': 'Noto Sans KR', Georgia: 'Noto Serif KR', serif: 'Noto Serif KR', 바탕: 'Nanum Myeongjo', Batang: 'Nanum Myeongjo' })[name] || name;
  return API_FONT_FAMILIES.includes(mapped) ? mapped : 'Noto Serif KR';
};
const uiFont = font => ({ 'Noto Sans KR': 'Pretendard', 'Noto Serif KR': 'Georgia', 'Nanum Myeongjo': '바탕', 'Nanum Gothic': '맑은 고딕', 'Gowun Batang': '바탕', 'Gowun Dodum': 'Pretendard' }[font] || 'Pretendard');
function apiSettingsFromPrefs(prefs, previous = {}) {
  const { updatedAt: _updatedAt, ...settings } = previous;
  const palette = themePalettes[prefs.theme] || themePalettes.white;
  const theme = prefs.theme === 'black' ? 'DARK' : prefs.theme === 'white' || prefs.theme === 'mono' ? 'LIGHT' : 'CUSTOM';
  return { ...settings, theme, backgroundColor: theme === 'CUSTOM' ? palette.background : null, textColor: theme === 'CUSTOM' ? palette.foreground : null, fontFamily: apiFont(prefs.font), fontSize: previous.fontSize || 17, letterSpacing: previous.letterSpacing || 0, lineHeight: previous.lineHeight || 1.8, paragraphSpacing: previous.paragraphSpacing ?? 0.8, editorWidth: previous.editorWidth || 720 };
}

function IconButton({ title, onClick, onMouseDown, children, active = false, className = '' }) {
  return <button type="button" title={title} aria-label={title} className={`icon-button ${active ? 'active' : ''} ${className}`} onMouseDown={onMouseDown} onClick={onClick}>{children}</button>;
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
    <div className={`page-preview-pages ${draft.page !== 'Letter' && draft.viewMode === 'double' ? 'double' : ''}`}>
      {Array.from({ length: draft.page !== 'Letter' && draft.viewMode === 'double' ? 2 : 1 }, (_, index) => <div className="page-preview-paper" key={index} style={{ aspectRatio: `${size.width} / ${size.height}` }}>
        <div className="page-preview-content" style={{ inset: `${margins.top}% ${margins.right}% ${margins.bottom}% ${margins.left}%` }}>
          <i/><i/><i/><i/><i/><i/><i/>
        </div>
      </div>)}
    </div>
    <span>{draft.page} · {size.label}</span>
  </div>;
}

function ReadDocument({ doc, theme, onBack, isShared, viewerNickname = '말하는 하마', viewerEmail = '', readerDefaults = {}, onOpenSettings, locked = false, password = '', onPasswordChange, onVerify, onEdit, onDelete, dialog, dialogInput, setDialogInput, closeDialog, notice, clearNotice }) {
  const themeClass = theme === 'black' ? 'theme-black' : theme === 'sky' ? 'theme-sky' : theme === 'sand' ? 'theme-sand' : theme === 'gray' ? 'theme-gray' : '';
  const palette = themePalettes[theme] || themePalettes.white;
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const menuRef = useRef(null);
  const contentColor = doc.color?.toLowerCase() === '#252525' ? palette.foreground : (doc.color || palette.foreground);
  const readerSpacing = doc.spacing ?? (readerDefaults.letterSpacing == null ? '0px' : `${readerDefaults.letterSpacing}em`);
  const readerParagraphSpacing = doc.paragraphSpacing ?? readerDefaults.paragraphSpacing ?? 0.8;
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
      <div className="reader-author">{doc.authorNickname || (!isShared ? viewerNickname : '') || '말하는 하마'}</div>
      <div className={`reader-body ${doc.firstLineIndent === false ? '' : 'first-line-indent'}`} style={{ '--reader-paragraph-spacing': `${readerParagraphSpacing}em`, fontFamily: doc.font || readerDefaults.font || 'Pretendard', fontSize: `${doc.size ?? readerDefaults.fontSize ?? 16}px`, lineHeight: doc.line ?? readerDefaults.lineHeight ?? 1.9, letterSpacing: typeof readerSpacing === 'number' ? `${readerSpacing}px` : readerSpacing, color: contentColor }} dangerouslySetInnerHTML={{ __html: doc.body || '' }}/>
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
  const [apiReady, setApiReady] = useState(false);
  const settingsCacheRef = useRef(null);
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
  const [sharedServerDoc, setSharedServerDoc] = useState(null);
  const [publicShareLocked, setPublicShareLocked] = useState(false);
  const [publicShareLoading, setPublicShareLoading] = useState(false);
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
  const [pdfFontFamilies, setPdfFontFamilies] = useState([]);
  const [draft, setDraft] = useState({ title: '', body: '', page: 'A4', viewMode: 'single', visibility: '비공개', marginTop: 24, marginRight: 24, marginBottom: 24, marginLeft: 24, firstLineIndent: true, font: 'Pretendard', size: 16, spacing: 0, line: 1.9, color: '#252525', paragraphSpacing: 0.8 });
  const [inlineFormat, setInlineFormat] = useState({});
  const [sizeInput, setSizeInput] = useState('16');
  const [passwordDraft, setPasswordDraft] = useState('');
  const [saveState, setSaveState] = useState('저장됨');
  const [pageCount, setPageCount] = useState(1);
  const [stageWidth, setStageWidth] = useState(0);
  const editorRef = useRef(null);
  const workspaceRef = useRef(null);
  const timerRef = useRef(null);
  const nicknameSyncTimerRef = useRef(null);
  const nicknameUserIdRef = useRef(null);
  const editorSelectionRef = useRef(null);
  const editorHistoryRef = useRef({ undo: [], redo: [], pending: null, last: null, transaction: false, applying: false });
  const previousModalRef = useRef('');
  const pageBreakLockRef = useRef(0);
  const layoutPagesRef = useRef(null);
  const geometry = pageGeometry(draft.page, draft.viewMode, stageWidth);
  const currentDoc = data.docs.find(d => d.id === selectedDoc);
  const shareMatch = window.location.pathname.match(/^\/s\/([^/]+)\/?$/);
  const legacyShareMatch = window.location.pathname.match(/^\/share\/([^/]+)\/?$/);
  const sharedDoc = shareMatch ? sharedServerDoc : legacyShareMatch ? data.docs.find(doc => doc.id === legacyShareMatch[1]) : null;
  const selectedFolder = data.folders.find(f => f.id === activeFolder);
  const childFolders = data.folders.filter(f => f.parent === activeFolder);
  const visibleDocs = useMemo(() => data.docs.filter(d => (activeFolder === null || d.folder === activeFolder) && (!query || documentListTitle(d).toLowerCase().includes(query.toLowerCase()) || String(d.preview || '').toLowerCase().includes(query.toLowerCase()))).sort((a,b) => sortMode === 'modified' ? (b.updated ?? 0) - (a.updated ?? 0) : (b.created ?? b.updated ?? 0) - (a.created ?? a.updated ?? 0)), [data.docs, activeFolder, query, sortMode]);
  const totalCount = data.docs.length;

  useEffect(() => {
    const clearSelectionOnBlankClick = event => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target || editorRef.current?.contains(target)) return;
      if (target.closest('.toolbar, [role="dialog"], button, input, select, textarea, label, a')) return;
      editorSelectionRef.current = null;
      setInlineFormat({});
    };
    document.addEventListener('pointerdown', clearSelectionOnBlankClick, true);
    return () => document.removeEventListener('pointerdown', clearSelectionOnBlankClick, true);
  }, []);
  useEffect(() => {
    if (previousModalRef.current === 'layout' && modal !== 'layout') restoreEditorSelectionFocus();
    previousModalRef.current = modal;
  }, [modal]);

  function syncUserNickname(user) {
    if (!user) { nicknameUserIdRef.current = null; return; }
    if (nicknameUserIdRef.current === user.id) return;
    nicknameUserIdRef.current = user.id;
    let savedNickname = '';
    try { savedNickname = localStorage.getItem(`wbw-nickname:${user.id}`) || ''; } catch {}
    const nickname = savedNickname || user.nickname || user.displayName || user.name || user.email?.split('@')[0] || randomNames[Math.floor(Math.random() * randomNames.length)];
    setData(current => ({ ...current, prefs: { ...current.prefs, nickname } }));
  }

  useEffect(() => { localStorage.setItem('wbw-data', JSON.stringify(data)); }, [data]);
  useEffect(() => {
    if (!authUser?.id || !data.prefs.nickname) return;
    try { localStorage.setItem(`wbw-nickname:${authUser.id}`, data.prefs.nickname); } catch {}
  }, [authUser?.id, data.prefs.nickname]);
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
    if (!authReady || !authUser) { if (authReady) setApiReady(true); return; }
    let active = true;
    (async () => {
      try {
        const [serverFolders, page, serverSettings, serverFonts] = await Promise.all([getFolders(), getDocuments(), getSettings(), getFonts().catch(() => [])]);
        if (!active) return;
        const availablePdfFonts = (serverFonts || []).filter(font => font.pdfAvailable).map(font => font.family);
        setPdfFontFamilies(availablePdfFonts);
        const folders = (serverFolders || []).map(folder => ({ id: String(folder.id), backendId: folder.id, name: folder.name, parent: null, sortOrder: folder.sortOrder ?? 0, documentCount: folder.documentCount ?? 0 }));
        const docs = await Promise.all((page?.items || []).map(async item => {
          let doc = { id: String(item.id), backendId: item.id, folder: item.folderId == null ? null : String(item.folderId), title: item.title || '', body: '', preview: item.preview || '', authorNickname: data.prefs.nickname, version: item.version, created: item.createdAt ? Date.parse(item.createdAt) : Date.now(), updated: item.updatedAt ? Date.parse(item.updatedAt) : Date.now(), uploaded: false, visibility: '비공개' };
          if (!String(item.title || '').trim() || item.title === '제목 없음') {
            try {
              const details = await getDocument(item.id);
              doc = { ...doc, ...normalizeServerDocument(details, doc, data.prefs) };
            } catch { /* Keep the list preview when the full untitled document is unavailable. */ }
          }
          try {
            const shares = await getShares(item.id);
            const activeShare = shares.find(share => share.enabled && (!share.expiresAt || Date.parse(share.expiresAt) > Date.now()));
            if (activeShare) return { ...doc, uploaded: true, share: activeShare, visibility: activeShare.passwordProtected ? '비밀번호 보호' : '링크 공개' };
          } catch { /* A document without an available share stays private in the list. */ }
          return doc;
        }));
        setData(current => ({ ...current, folders, docs }));
        settingsCacheRef.current = serverSettings;
        if (serverSettings.fontFamily === 'Noto Sans KR' && availablePdfFonts.includes('Pretendard')) {
          const migratedSettings = { ...apiSettingsFromPrefs({ ...data.prefs, font: 'Pretendard' }, serverSettings), fontFamily: 'Pretendard' };
          try { settingsCacheRef.current = await apiUpdateSettings(migratedSettings); } catch { /* Keep the existing font preference if the settings update is temporarily unavailable. */ }
        }
        setData(current => ({ ...current, prefs: { ...current.prefs, theme: serverSettings.theme === 'DARK' ? 'black' : serverSettings.theme === 'CUSTOM' ? (serverSettings.backgroundColor === themePalettes.sky.background ? 'sky' : serverSettings.backgroundColor === themePalettes.sand.background ? 'sand' : serverSettings.backgroundColor === themePalettes.gray.background ? 'gray' : 'white') : 'white', font: uiFont(serverSettings.fontFamily), fontSize: serverSettings.fontSize, letterSpacing: serverSettings.letterSpacing, lineHeight: serverSettings.lineHeight, paragraphSpacing: serverSettings.paragraphSpacing } }));
        if (!folders.some(folder => folder.id === activeFolder)) setActiveFolder(null);
      } catch (error) {
        if (active) { setAuthError(error.message || '서버에서 서재를 불러오지 못했어요.'); setFatalError(classifyFailure(error)); }
      } finally { if (active) setApiReady(true); }
    })();
    return () => { active = false; };
  }, [authReady, authUser?.id]);
  useEffect(() => {
    if (!shareMatch) return;
    let active = true;
    setPublicShareLoading(true);
    getPublicShare(shareMatch[1]).then(result => {
      if (!active) return;
      const authorNickname = authorNicknameFrom(result) || (authUser ? data.prefs.nickname : '');
      const full = normalizeServerDocument(result, { id: shareMatch[1], authorNickname }, data.prefs);
      setSharedServerDoc({ ...full, visibility: result.passwordProtected ? '비밀번호 보호' : '링크 공개' });
      setPublicShareLocked(false);
    }).catch(error => {
      if (!active) return;
      if (error.code === 'SHARE_PASSWORD_REQUIRED') { setPublicShareLocked(true); setSharedServerDoc({ id: shareMatch[1], title: '', body: '', visibility: '비밀번호 보호' }); }
      else setFatalError(classifyFailure(error) || (error.status === 410 ? 'not-found' : error.status === 404 ? 'not-found' : 'server'));
    }).finally(() => { if (active) setPublicShareLoading(false); });
    return () => { active = false; };
  }, [shareMatch?.[1], authUser?.id, data.prefs.nickname, data.prefs.font, data.prefs.fontSize, data.prefs.letterSpacing, data.prefs.lineHeight]);
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

  /* 편집기: 작업 공간 너비 측정 → 용지/쪽 크기 계산에 사용 */
  useLayoutEffect(() => {
    if (view !== 'editor') return undefined;
    const workspace = workspaceRef.current;
    if (!workspace) return undefined;
    const measure = () => {
      const css = window.getComputedStyle(workspace);
      const width = Math.round(workspace.clientWidth - (Number.parseFloat(css.paddingLeft) || 0) - (Number.parseFloat(css.paddingRight) || 0));
      if (width > 0) setStageWidth(current => (Math.abs(current - width) < 1 ? current : width));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(workspace);
    return () => observer.disconnect();
  }, [view]);
  /* 편집기: 글 열기 (본문 HTML을 편집 영역에 넣음) */
  useLayoutEffect(() => {
    if (view !== 'editor' || !editorRef.current) return;
    const editor = editorRef.current;
    try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch { /* 지원하지 않는 브라우저는 기본값 사용 */ }
    editor.innerHTML = draft.body || '<p><br></p>';
    setInlineFormat({});
    editor.focus({ preventScroll: true });
    const firstBlock = editor.firstElementChild || editor;
    const range = document.createRange();
    range.setStart(firstBlock, 0);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    editorSelectionRef.current = range.cloneRange();
    editorHistoryRef.current = { undo: [], redo: [], pending: null, last: captureEditorSnapshot(), transaction: false, applying: false };
  }, [view, selectedDoc]);
  /* 편집기: 글/서식/용지가 바뀔 때마다 쪽 배치를 다시 계산 */
  useLayoutEffect(() => {
    if (view !== 'editor' || !editorRef.current) return undefined;
    layoutPages();
    let alive = true;
    document.fonts?.ready?.then(() => { if (alive) layoutPagesRef.current?.(); });
    return () => { alive = false; };
  }, [view, selectedDoc, draft.body, draft.page, draft.viewMode, draft.marginTop, draft.marginBottom, draft.marginLeft, draft.marginRight, draft.font, draft.size, draft.spacing, draft.line, draft.paragraphSpacing, draft.firstLineIndent, geometry.double, geometry.sheetW, geometry.sheetH]);
  layoutPagesRef.current = layoutPages;
  useEffect(() => {
    setSizeInput(String(inlineFormat.size ?? draft.size));
  }, [inlineFormat.size, draft.size]);

  function layoutPages() {
    const editor = editorRef.current;
    if (!editor) return;
    if (draft.page === 'Letter') {
      editor.querySelectorAll('[data-wbw-page]').forEach(block => {
        block.removeAttribute('data-wbw-page');
        block.style.removeProperty('transform');
        if (!block.getAttribute('style')) block.removeAttribute('style');
      });
      setPageCount(current => current === 1 ? current : 1);
      return;
    }
    const count = paginateEditor(editor, geometry, { top: draft.marginTop ?? 24, bottom: draft.marginBottom ?? 24 });
    setPageCount(current => (current === count ? current : count));
  }
  function updatePrefs(key, value) {
    if (authUser && key === 'font' && value === 'Pretendard' && !pdfFontFamilies.includes('Pretendard')) {
      setNotice('Pretendard PDF 글꼴은 백엔드 배포 후 선택할 수 있어요.');
      return;
    }
    setData(d => ({
      ...d,
      prefs: { ...d.prefs, [key]: value },
      ...(key === 'nickname' ? { docs: d.docs.map(doc => ({ ...doc, authorNickname: value })) } : {})
    }));
    if (authUser && key === 'nickname') {
      clearTimeout(nicknameSyncTimerRef.current);
      nicknameSyncTimerRef.current = setTimeout(() => syncUploadedNicknames(value), 900);
    }
    if (authUser && (key === 'theme' || key === 'font')) {
      const nextPrefs = { ...data.prefs, [key]: value };
      apiUpdateSettings(apiSettingsFromPrefs(nextPrefs, settingsCacheRef.current || {})).then(saved => { settingsCacheRef.current = saved; }).catch(error => setNotice(error.message || '설정을 저장하지 못했어요.'));
    }
  }
  async function syncUploadedNicknames(nickname) {
    const uploadedDocs = data.docs.filter(doc => doc.uploaded && doc.backendId);
    if (!uploadedDocs.length) return;
    const results = await Promise.allSettled(uploadedDocs.map(async doc => {
      const latest = await getDocument(doc.backendId);
      const content = latest.content;
      if (!content || content.type !== 'doc') throw new Error(`${doc.title || '제목 없는 글'} 본문을 불러오지 못했어요.`);
      const updatedContent = {
        ...content,
        attrs: {
          ...(content.attrs || {}),
          wbw: { ...(content.attrs?.wbw || {}), authorNickname: nickname }
        }
      };
      const saved = await updateDocument(doc.backendId, { title: latest.title || doc.title || '', content: updatedContent, version: latest.version });
      return { doc, content: updatedContent, saved };
    }));
    const successful = results.filter(result => result.status === 'fulfilled').map(result => result.value);
    if (successful.length) {
      setData(current => ({ ...current, docs: current.docs.map(doc => {
        const saved = successful.find(item => item.doc.id === doc.id);
        return saved ? { ...doc, authorNickname: nickname, contentJson: saved.content, version: saved.saved.version ?? doc.version, updated: Date.parse(saved.saved.updatedAt || '') || doc.updated } : doc;
      }) }));
    }
    const failedCount = results.length - successful.length;
    setToastNotice(failedCount ? `닉네임을 ${successful.length}개 글에 반영했어요. ${failedCount}개 글은 저장하지 못했습니다.` : '공개한 글에 새 닉네임을 반영했어요.');
  }
  function openDoc(doc) {
    if (authUser && doc.backendId) {
      getDocument(doc.backendId).then(serverDoc => {
        const full = normalizeServerDocument(serverDoc, { ...doc, authorNickname: doc.authorNickname || data.prefs.nickname }, data.prefs);
        setData(current => ({ ...current, docs: current.docs.map(item => item.id === doc.id ? { ...item, ...full } : item) }));
        showDocEditor(full);
      }).catch(error => setNotice(error.message || '글을 불러오지 못했어요.'));
      return;
    }
    showDocEditor(doc);
  }
  function showDocEditor(doc) {
    const oldMargin = doc.margin ?? 24;
    const storedSpacing = Number.parseFloat(doc.spacing);
    const spacing = Number.isFinite(storedSpacing) ? (typeof doc.spacing === 'string' && doc.spacing.trim().endsWith('em') ? storedSpacing * (doc.size || 16) : storedSpacing) : 0;
    const page = String(doc.page || 'A4').toUpperCase() === 'LETTER' ? 'Letter' : (doc.page || 'A4');
    setSelectedDoc(doc.id); setDraftFolder(doc.folder ?? null); setDraft({ title: doc.title === '제목 없음' ? '' : (doc.title || ''), body: doc.body || '<p><br></p>', page, viewMode: page === 'Letter' ? 'single' : (doc.viewMode || 'single'), visibility: doc.visibility || '비공개', marginTop: doc.marginTop ?? oldMargin, marginRight: doc.marginRight ?? oldMargin, marginBottom: doc.marginBottom ?? oldMargin, marginLeft: doc.marginLeft ?? oldMargin, firstLineIndent: doc.firstLineIndent ?? doc.contentJson?.attrs?.wbw?.layout?.firstLineIndent ?? true, font: doc.font || data.prefs.font, size: doc.size || 16, spacing, line: doc.line || 1.9, color: doc.color || '#252525', paragraphSpacing: doc.paragraphSpacing ?? data.prefs.paragraphSpacing ?? 0.8 }); setSaveState('저장됨'); setView('editor'); setProfileOpen(false);
  }
  async function newDoc() {
    const doc = { id: crypto.randomUUID(), folder: activeFolder, title: '', body: '<p><br></p>', updated: Date.now(), visibility: '비공개', uploaded: false };
    setDraftFolder(activeFolder);
    showDocEditor(doc);
  }
  async function saveDraft(next = draft) {
    if (!hasBodyContent(next.body)) {
      clearTimeout(timerRef.current);
      setSaveState('저장됨');
      return false;
    }
    setSaveState('저장 중');
    const now = Date.now();
    if (authUser) {
      const doc = data.docs.find(item => item.id === selectedDoc);
      try {
        const oldMeta = doc?.contentJson?.attrs?.wbw || {};
        const content = htmlToTipTap(next.body, {
          ...(doc?.contentJson?.attrs || {}),
          wbw: {
            ...oldMeta,
            authorNickname: data.prefs.nickname,
            layout: { page: next.page, viewMode: next.viewMode || 'single', marginTop: next.marginTop, marginRight: next.marginRight, marginBottom: next.marginBottom, marginLeft: next.marginLeft, firstLineIndent: next.firstLineIndent !== false },
            style: { fontFamily: apiFont(next.font), fontSize: next.size, letterSpacing: `${next.spacing ?? 0}px`, lineHeight: next.line, paragraphSpacing: next.paragraphSpacing ?? data.prefs.paragraphSpacing ?? 0.8, color: next.color }
          }
        });
        const documentFields = { title: next.title || '', body: next.body, preview: htmlToPlainText(next.body).split('\n')[0] || '', contentJson: content, page: next.page, viewMode: next.viewMode || 'single', marginTop: next.marginTop, marginRight: next.marginRight, marginBottom: next.marginBottom, marginLeft: next.marginLeft, firstLineIndent: next.firstLineIndent !== false, font: next.font, size: next.size, spacing: next.spacing, line: next.line, color: next.color, paragraphSpacing: next.paragraphSpacing ?? data.prefs.paragraphSpacing ?? 0.8, authorNickname: data.prefs.nickname };
        if (!doc?.backendId) {
          const created = await createDocument({ title: next.title || '', ...(draftFolder ? { folderId: Number(draftFolder) } : {}), content });
          const serverDoc = { ...doc, ...created, ...documentFields, id: String(created.id), backendId: created.id, folder: created.folderId == null ? null : String(created.folderId), title: created.title || next.title || '', version: created.version, created: Date.parse(created.createdAt || '') || now, updated: Date.parse(created.updatedAt || '') || now };
          setData(current => ({ ...current, docs: [serverDoc, ...current.docs.filter(item => item.id !== selectedDoc)] }));
          setSelectedDoc(String(created.id));
          setSaveState('저장됨'); return created.id;
        } else {
          const saved = await updateDocument(doc.backendId, { title: next.title || '', content, version: doc.version });
          setData(current => ({ ...current, docs: current.docs.map(item => item.id === selectedDoc ? { ...item, ...documentFields, title: saved.title || next.title, version: saved.version, updated: Date.parse(saved.updatedAt || '') || now } : item) }));
        }
        setSaveState('저장됨'); return true;
      } catch (error) { setSaveState('저장 실패'); setNotice(error.message || '서버에 저장하지 못했어요.'); return false; }
    }
    setData(d => {
      const savedFields = { title: next.title || '제목 없음', body: next.body, preview: htmlToPlainText(next.body).split('\n')[0] || '', page: next.page, viewMode: next.viewMode || 'single', visibility: next.visibility || '비공개', marginTop: next.marginTop, marginRight: next.marginRight, marginBottom: next.marginBottom, marginLeft: next.marginLeft, firstLineIndent: next.firstLineIndent !== false, font: next.font, size: next.size, spacing: next.spacing, line: next.line, paragraphSpacing: next.paragraphSpacing ?? d.prefs.paragraphSpacing ?? 0.8, color: next.color, theme: d.prefs.theme, updated: now };
      const exists = d.docs.some(doc => doc.id === selectedDoc);
      return { ...d, docs: exists
        ? d.docs.map(doc => doc.id === selectedDoc ? { ...doc, created: doc.created ?? doc.updated ?? now, ...savedFields } : doc)
        : [{ id: selectedDoc, folder: draftFolder, visibility: '비공개', uploaded: false, created: now, ...savedFields }, ...d.docs] };
    });
    setTimeout(() => setSaveState('저장됨'), 250);
    return true;
  }
  function changeDraft(key, value) {
    const styleKey = ['font', 'size', 'color'].includes(key);
    const historyBefore = styleKey && view === 'editor' ? captureEditorSnapshot() : null;
    if (styleKey) setInlineFormat({});
    const next = { ...draft, [key]: value };
    if (key === 'page' && value === 'Letter') next.viewMode = 'single';
    if (key === 'viewMode' && draft.page === 'Letter') next.viewMode = 'single';
    setDraft(next); setSaveState('수정 중…');
    if (historyBefore) recordEditorChange(historyBefore, { ...historyBefore, defaults: { ...historyBefore.defaults, [key]: value } });
    clearTimeout(timerRef.current); timerRef.current = setTimeout(() => saveDraft(next), 900);
  }
  function resetLayout() {
    const next = { ...draft, page: 'A4', viewMode: 'single', marginTop: 24, marginRight: 24, marginBottom: 24, marginLeft: 24, firstLineIndent: true, spacing: 0, line: 1.9, paragraphSpacing: data.prefs.paragraphSpacing ?? 0.8 };
    setDraft(next); setSaveState('수정 중…');
    clearTimeout(timerRef.current); timerRef.current = setTimeout(() => saveDraft(next), 900);
  }
  function nodePath(root, node) {
    const path = [];
    while (node && node !== root) {
      const parent = node.parentNode;
      if (!parent) return null;
      path.unshift(Array.prototype.indexOf.call(parent.childNodes, node));
      node = parent;
    }
    return node === root ? path : null;
  }
  function nodeAtPath(root, path) {
    return path?.reduce((node, index) => node?.childNodes?.[index] || null, root) || (path?.length === 0 ? root : null);
  }
  function captureEditorSnapshot() {
    const editor = editorRef.current;
    if (!editor) return null;
    const selection = window.getSelection();
    const activeRange = selection?.rangeCount && editor.contains(selection.anchorNode)
      && (document.activeElement === editor || !selection.isCollapsed)
      ? selection.getRangeAt(0)
      : null;
    const savedRange = editorSelectionRef.current;
    const range = activeRange || (savedRange && editor.contains(savedRange.commonAncestorContainer) ? savedRange : null);
    const bookmark = range ? {
      startPath: nodePath(editor, range.startContainer), startOffset: range.startOffset,
      endPath: nodePath(editor, range.endContainer), endOffset: range.endOffset
    } : null;
    return { html: cleanEditorHtml(editor), defaults: { font: draft.font, size: draft.size, color: draft.color }, selection: bookmark };
  }
  function recordEditorChange(before, after = captureEditorSnapshot()) {
    if (!before || !after) return;
    const changed = before.html !== after.html || before.defaults.font !== after.defaults.font
      || before.defaults.size !== after.defaults.size || before.defaults.color !== after.defaults.color;
    const history = editorHistoryRef.current;
    if (changed) {
      history.undo.push(before);
      if (history.undo.length > 100) history.undo.shift();
      history.redo = [];
    }
    history.last = after;
    history.pending = null;
  }
  function handleEditorBeforeInput() {
    const history = editorHistoryRef.current;
    if (history.applying || history.transaction) return;
    history.pending = captureEditorSnapshot();
  }
  function handleEditorInput() {
    const history = editorHistoryRef.current;
    if (history.applying || history.transaction) return;
    const before = history.pending || history.last || captureEditorSnapshot();
    recordEditorChange(before);
    onBodyInput();
  }
  function restoreEditorSnapshot(snapshot) {
    const editor = editorRef.current;
    if (!editor || !snapshot) return;
    const history = editorHistoryRef.current;
    history.applying = true;
    editor.innerHTML = snapshot.html;
    editor.focus({ preventScroll: true });
    const bookmark = snapshot.selection;
    const startNode = nodeAtPath(editor, bookmark?.startPath);
    const endNode = nodeAtPath(editor, bookmark?.endPath);
    const selection = window.getSelection();
    const range = document.createRange();
    if (startNode && endNode) {
      const maxStart = startNode.nodeType === Node.TEXT_NODE ? startNode.nodeValue.length : startNode.childNodes.length;
      const maxEnd = endNode.nodeType === Node.TEXT_NODE ? endNode.nodeValue.length : endNode.childNodes.length;
      range.setStart(startNode, Math.min(bookmark.startOffset, maxStart));
      range.setEnd(endNode, Math.min(bookmark.endOffset, maxEnd));
    } else {
      range.selectNodeContents(editor);
      range.collapse(true);
    }
    selection?.removeAllRanges();
    selection?.addRange(range);
    editorSelectionRef.current = range.cloneRange();
    history.last = snapshot;
    history.pending = null;
    history.applying = false;
    setInlineFormat({});
    setSizeInput(String(snapshot.defaults.size));
    const next = { ...draft, ...snapshot.defaults, body: snapshot.html };
    setDraft(next);
    setSaveState('수정 중…');
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => saveDraft(next), 900);
    requestAnimationFrame(() => layoutPagesRef.current?.());
  }
  function stepEditorHistory(direction) {
    const history = editorHistoryRef.current;
    const source = direction === 'undo' ? history.undo : history.redo;
    const target = direction === 'undo' ? history.redo : history.undo;
    if (!source.length) return false;
    const current = captureEditorSnapshot();
    const snapshot = source.pop();
    if (current) target.push(current);
    restoreEditorSnapshot(snapshot);
    return true;
  }
  /* Shift+Enter: 현재 위치에서 문단을 나누고, 그 사이에 쪽 나누기 표시를 넣어 뒤쪽 내용을 다음 쪽으로 넘긴다. */
  function insertPageBreak() {
    const editor = editorRef.current;
    if (!editor) return;
    const before = captureEditorSnapshot();
    const history = editorHistoryRef.current;
    history.transaction = true;
    editor.focus({ preventScroll: true });
    document.execCommand('insertParagraph');
    const selection = window.getSelection();
    let block = selection?.anchorNode || null;
    while (block && block.parentNode !== editor) block = block.parentNode;
    if (draft.page !== 'Letter' && block && block !== editor) {
      const marker = document.createElement('div');
      marker.className = 'wbw-page-break';
      marker.setAttribute('contenteditable', 'false');
      marker.setAttribute('aria-hidden', 'true');
      editor.insertBefore(marker, block);
    }
    history.transaction = false;
    rememberEditorSelection(true);
    recordEditorChange(before);
    onBodyInput();
  }
  function handleEditorKeyDown(event) {
    const editor = editorRef.current;
    const isEnter = event.code === 'Enter' || event.code === 'NumpadEnter';
    if (isEnter && event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && editor && event.target instanceof Node && editor.contains(event.target)) {
      event.preventDefault();
      event.stopPropagation();
      const now = Date.now();
      if (now - pageBreakLockRef.current < 250) return; // 한글 입력기에서 키 이벤트가 두 번 들어오는 경우 방지
      pageBreakLockRef.current = now;
      if (event.nativeEvent.isComposing || event.keyCode === 229) setTimeout(insertPageBreak, 40);
      else insertPageBreak();
      return;
    }
    if (!(event.ctrlKey || event.metaKey)) return;
    if (event.target instanceof Element && event.target.closest('input, select, textarea')) return;
    const key = event.key.toLowerCase();
    const direction = key === 'z' ? (event.shiftKey ? 'redo' : 'undo') : key === 'y' ? 'redo' : null;
    if (direction && stepEditorHistory(direction)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }
  /* 종이의 빈 곳을 누르면 글 맨 끝에 커서를 둔다. */
  function handlePaperMouseDown(event) {
    const editor = editorRef.current;
    if (!editor || event.target !== event.currentTarget) return;
    event.preventDefault();
    editor.focus({ preventScroll: true });
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    editorSelectionRef.current = range.cloneRange();
  }
  function handleEmptyEditorMouseDown(event) {
    const editor = editorRef.current;
    if (!editor || editor.textContent.length > 0) return;
    event.preventDefault();
    editor.focus({ preventScroll: true });
    const firstBlock = editor.querySelector(':scope > :not(.wbw-page-break)');
    const range = document.createRange();
    range.setStart(firstBlock || editor, 0);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    editorSelectionRef.current = range.cloneRange();
  }
  function handleEditorMediaTransfer(event) {
    if (!transferContainsImageOrVideo(event.clipboardData || event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    setNotice('사진이나 동영상은 붙여넣거나 가져올 수 없어요.');
  }
  function handleEditorDragOver(event) {
    if (!transferContainsImageOrVideo(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'none';
  }
  function onBodyInput(overrides = {}) {
    if (!editorRef.current) return;
    const next = { ...draft, ...overrides, body: cleanEditorHtml(editorRef.current) };
    setDraft(next);
    setSaveState('수정 중…');
    const now = Date.now();
    const preview = htmlToPlainText(next.body).split('\n')[0] || '';
    setData(current => {
      const optimistic = { title: next.title || '', body: next.body, preview, page: next.page, viewMode: next.viewMode, marginTop: next.marginTop, marginRight: next.marginRight, marginBottom: next.marginBottom, marginLeft: next.marginLeft, firstLineIndent: next.firstLineIndent !== false, font: next.font, size: next.size, spacing: next.spacing, line: next.line, paragraphSpacing: next.paragraphSpacing ?? data.prefs.paragraphSpacing ?? 0.8, color: next.color, updated: now };
      const exists = current.docs.some(doc => doc.id === selectedDoc);
      return { ...current, docs: exists
        ? current.docs.map(doc => doc.id === selectedDoc ? { ...doc, ...optimistic } : doc)
        : [{ id: selectedDoc, folder: draftFolder, visibility: '비공개', uploaded: false, created: now, ...optimistic }, ...current.docs] };
    });
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => saveDraft(next), 900);
  }
  function applyTextColor(color) {
    const selection = window.getSelection();
    const selectedRange = selection?.rangeCount && editorRef.current?.contains(selection.anchorNode) && !selection.isCollapsed
      ? selection.getRangeAt(0).cloneRange()
      : editorSelectionRef.current;
    if (!selectedRange || selectedRange.collapsed || !editorRef.current?.contains(selectedRange.commonAncestorContainer)) {
      applyWholeDocumentStyle('color', color, { color });
      return;
    }
    applyStyleToRange(selectedRange, { color });
    setInlineFormat(current => ({ ...current, color }));
  }
  function applyStyleToRange(range, styles, focusEditor = true, draftOverride = null, restoreRange = null) {
    const editor = editorRef.current;
    if (!editor || !range || range.collapsed || !editor.contains(range.commonAncestorContainer)) return;
    const before = captureEditorSnapshot();
    const textNodes = [];
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!node.nodeValue?.length || !range.intersectsNode(node)) continue;
      const start = node === range.startContainer ? range.startOffset : 0;
      const end = node === range.endContainer ? range.endOffset : node.nodeValue.length;
      if (end > start) textNodes.push({ node, start, end });
    }
    if (!textNodes.length) return;
    const selectedSegments = new Map();
    for (const item of [...textNodes].reverse()) {
      let selectedNode = item.node;
      if (item.end < selectedNode.nodeValue.length) selectedNode.splitText(item.end);
      if (item.start > 0) selectedNode = selectedNode.splitText(item.start);
      const span = document.createElement('span');
      Object.assign(span.style, styles);
      selectedNode.parentNode.insertBefore(span, selectedNode);
      span.appendChild(selectedNode);
      selectedSegments.set(item.node, selectedNode);
    }
    const first = selectedSegments.get(textNodes[0].node);
    const last = selectedSegments.get(textNodes[textNodes.length - 1].node);
    const restoredRange = document.createRange();
    restoredRange.setStart(first, 0);
    restoredRange.setEnd(last, last.nodeValue.length);
    const nextRange = restoreRange && editor.contains(restoreRange.commonAncestorContainer) ? restoreRange : restoredRange;
    preserveEditorRange(nextRange, focusEditor);
    const after = captureEditorSnapshot();
    if (draftOverride) after.defaults[draftOverride.key] = draftOverride.value;
    recordEditorChange(before, after);
    onBodyInput(draftOverride ? { [draftOverride.key]: draftOverride.value } : {});
  }
  function exec(command, value) {
    const editor = editorRef.current;
    const selection = window.getSelection();
    const range = selection?.rangeCount && !selection.isCollapsed && editor?.contains(selection.anchorNode)
      ? selection.getRangeAt(0).cloneRange()
      : editorSelectionRef.current;
    if (!editor) return;
    const before = captureEditorSnapshot();
    const history = editorHistoryRef.current;
    history.transaction = true;
    if (range && editor.contains(range.commonAncestorContainer)) editorSelectionRef.current = range.cloneRange();
    editor.focus({ preventScroll: true });
    if (range && editor.contains(range.commonAncestorContainer)) {
      selection.removeAllRanges();
      selection.addRange(range);
    }
    document.execCommand(command, false, value);
    history.transaction = false;
    preserveEditorRange(range);
    recordEditorChange(before);
    onBodyInput();
  }
  function rememberEditorSelection(allowCollapsed = false) {
    const selection = window.getSelection();
    if (selection?.rangeCount && editorRef.current?.contains(selection.anchorNode) && (allowCollapsed || !selection.isCollapsed)) {
      editorSelectionRef.current = selection.getRangeAt(0).cloneRange();
      if (allowCollapsed) setInlineFormat({});
    }
  }
  function preserveEditorRange(range, focusEditor = false) {
    const editor = editorRef.current;
    if (!range || !editor?.contains(range.commonAncestorContainer)) return;
    if (focusEditor) editor.focus({ preventScroll: true });
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    editorSelectionRef.current = range.cloneRange();
  }
  function restoreEditorSelectionFocus() {
    const savedRange = editorSelectionRef.current;
    if (!savedRange || savedRange.collapsed) return;
    requestAnimationFrame(() => {
      if (editorSelectionRef.current !== savedRange || !editorRef.current?.contains(savedRange.commonAncestorContainer)) return;
      const active = document.activeElement;
      if (active && active !== document.body && active !== document.documentElement) return;
      editorRef.current.focus({ preventScroll: true });
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(savedRange);
    });
  }
  function applyWholeDocumentStyle(key, value, styles) {
    const editor = editorRef.current;
    if (!editor) { changeDraft(key, value); return; }
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let hasText = false;
    while (walker.nextNode()) {
      if (walker.currentNode.nodeValue?.length) { hasText = true; break; }
    }
    if (!hasText) { changeDraft(key, value); return; }
    const restoreRange = editorSelectionRef.current && editor.contains(editorSelectionRef.current.commonAncestorContainer)
      ? editorSelectionRef.current.cloneRange()
      : null;
    const wholeDocument = document.createRange();
    wholeDocument.selectNodeContents(editor);
    applyStyleToRange(wholeDocument, styles, false, { key, value }, restoreRange);
    setInlineFormat({});
  }
  function changeFont(font) {
    const selection = window.getSelection();
    const range = selection?.rangeCount && editorRef.current?.contains(selection.anchorNode) && !selection.isCollapsed
      ? selection.getRangeAt(0).cloneRange()
      : editorSelectionRef.current;
    if (!range || range.collapsed || !editorRef.current?.contains(range.commonAncestorContainer)) {
      applyWholeDocumentStyle('font', font, { fontFamily: font });
      return;
    }
    applyStyleToRange(range, { fontFamily: font });
    setInlineFormat(current => ({ ...current, font }));
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
    applyStyleToRange(range, { fontSize: `${size}px` }, true);
    setInlineFormat(current => ({ ...current, size }));
  }
  function createFolder() {
    setDialogInput('');
    setDialog({ type: 'prompt', title: '새 폴더', message: '폴더 이름을 입력해 주세요.', confirmLabel: '만들기', onConfirm: name => {
      if (!name?.trim()) { setNotice('폴더 이름을 입력해 주세요.'); return; }
      if (authUser) {
        apiCreateFolder(name.trim()).then(result => { const folder = { id: String(result.id), backendId: result.id, name: result.name, parent: null, sortOrder: result.sortOrder ?? 0, documentCount: result.documentCount ?? 0 }; setData(d => ({ ...d, folders: [...d.folders, folder] })); setToastNotice('폴더를 만들었어요.'); }).catch(error => setNotice(error.message || '폴더를 만들지 못했어요.'));
      } else {
        const folder = { id: crypto.randomUUID(), name: name.trim(), parent: null };
        setData(d => ({ ...d, folders: [...d.folders, folder] })); setToastNotice('폴더를 만들었어요.');
      }
    }});
  }
  function deleteFolder(folder) {
    if (authUser) {
      const count = data.docs.filter(doc => doc.folder === folder.id).length;
      setDialog({ type: 'confirm', title: '폴더 삭제', message: `“${folder.name}” 폴더와 안에 있는 글 ${count}개가 모두 영구 삭제됩니다. 삭제할까요?`, confirmLabel: '삭제하기', danger: true, onConfirm: async () => {
        try { await apiRemoveFolder(folder.backendId ?? folder.id); setData(current => ({ ...current, folders: current.folders.filter(item => item.id !== folder.id), docs: current.docs.filter(doc => doc.folder !== folder.id) })); if (activeFolder === folder.id) setActiveFolder(null); setToastNotice('폴더와 포함된 글을 삭제했어요.'); }
        catch (error) { setNotice(error.message || '폴더를 삭제하지 못했어요.'); }
      }});
      return;
    }
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
    if (authUser) { setNotice('폴더는 한 단계 구조로만 사용할 수 있어요.'); return; }
    const branch = new Set();
    const collect = id => data.folders.filter(item => item.parent === id).forEach(child => { branch.add(child.id); collect(child.id); });
    collect(folderId);
    if (nextParentId === folderId || branch.has(nextParentId)) { setNotice('폴더를 자기 자신이나 하위 폴더 안으로 옮길 수 없어요.'); return; }
    setData(current => ({ ...current, folders: current.folders.map(folder => folder.id === folderId ? { ...folder, parent: nextParentId } : folder) }));
    setNotice(nextParentId ? '하위 폴더로 옮겼어요.' : '최상위 폴더로 옮겼어요.');
  }
  function renameFolder(folder, nextName) {
    if (!nextName?.trim()) return;
    if (authUser) { apiUpdateFolder(folder.backendId ?? folder.id, { name: nextName.trim() }).then(updated => setData(d => ({ ...d, folders: d.folders.map(f => f.id === folder.id ? { ...f, name: updated.name } : f) }))).catch(error => setNotice(error.message || '폴더 이름을 바꾸지 못했어요.')); return; }
    setData(d => ({ ...d, folders: d.folders.map(f => f.id === folder.id ? { ...f, name: nextName.trim() } : f) }));
  }
  function deleteDoc(doc) {
    setDialog({ type: 'confirm', title: '글 삭제', message: `“${doc.title || '제목 없음'}” 글을 삭제할까요? 삭제한 글은 복구할 수 없습니다.`, confirmLabel: '삭제하기', danger: true, onConfirm: () => {
      const remove = authUser && doc.backendId ? deleteDocument(doc.backendId).then(() => { setData(d => ({ ...d, docs: d.docs.filter(item => item.id !== doc.id) })); }).catch(error => setNotice(error.message || '글을 삭제하지 못했어요.')) : Promise.resolve().then(() => setData(d => ({ ...d, docs: d.docs.filter(item => item.id !== doc.id) })));
      if (selectedDoc === doc.id) { setView('library'); setSelectedDoc(null); }
      remove.then(() => setToastNotice('글을 삭제했어요.'));
    }});
  }
  function closeDialog(confirmed = false) {
    const current = dialog;
    setDialog(null);
    if (confirmed) current?.onConfirm?.(dialogInput);
    setDialogInput('');
  }
  async function exportPdf(mode = 'browser') {
    setModal('');
    if (authUser && mode === 'server') {
      try {
        clearTimeout(timerRef.current);
        const saved = await saveDraft(draft);
        const documentId = currentDoc?.backendId ?? (typeof saved === 'number' || typeof saved === 'string' ? saved : null);
        if (!documentId) throw new Error('PDF로 내보내려면 먼저 글을 입력하고 저장해 주세요.');
        const blob = await downloadDocumentPdf(documentId, {
          pageSize: draft.page === 'Letter' ? 'LETTER' : draft.page,
          orientation: 'PORTRAIT',
          marginTop: draft.marginTop,
          marginRight: draft.marginRight,
          marginBottom: draft.marginBottom,
          marginLeft: draft.marginLeft,
          includeTitle: true
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${(draft.title || 'WBW 문서').replace(/[\\/:*?"<>|]/g, '_')}.pdf`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (error) { setNotice(error.message || 'PDF를 내보내지 못했어요.'); }
      return;
    }
    try { await document.fonts?.ready; } catch { /* 시스템 글꼴만으로 인쇄를 계속합니다. */ }
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
  }
  async function handleGoogleLogin() {
    setAuthError(''); setAuthSuccess('');
    setAuthLoading(true);
    startGoogleLogin();
  }
  function doSignOut() {
    signOut().catch(() => {}); nicknameUserIdRef.current = null; setAuthUser(null); setPreviewMode(false); setProfileOpen(false); setView('library'); setNotice('로그아웃했어요.');
  }
  async function shareDoc() {
    if (!currentDoc) return;
    if (authUser && currentDoc.backendId) {
      try {
        const existingShares = await getShares(currentDoc.backendId);
        const existing = existingShares.find(item => item.enabled);
        const share = existing || await createShare(currentDoc.backendId, draft.visibility === '비밀번호 보호' && passwordDraft ? { password: passwordDraft } : {});
        await navigator.clipboard.writeText(share.url);
        setData(d => ({ ...d, docs: d.docs.map(doc => doc.id === currentDoc.id ? { ...doc, uploaded: true, share, visibility: share.passwordProtected ? '비밀번호 보호' : '링크 공개' } : doc) }));
        setNotice('공유 링크를 복사했어요.');
      } catch (error) { setNotice(error.message || '공유 링크를 만들지 못했어요.'); }
      return;
    }
    const url = `${window.location.origin}/share/${currentDoc.id}`;
    try { await navigator.clipboard.writeText(url); setNotice('공유 링크를 복사했어요. 실제 링크 권한 검증은 백엔드 연결 후 동작합니다.'); }
    catch { setNotice('공유 링크 권한 검증은 백엔드 연결 후 동작합니다.'); }
  }
  async function openDocFromList(doc) {
    if (authUser && doc.backendId) {
      try {
        const shares = await getShares(doc.backendId);
        const activeShare = shares.find(share => share.enabled && (!share.expiresAt || Date.parse(share.expiresAt) > Date.now()));
        if (activeShare) {
          const serverDoc = await getDocument(doc.backendId);
          const full = normalizeServerDocument(serverDoc, { ...doc, authorNickname: doc.authorNickname || data.prefs.nickname }, data.prefs);
          const visibility = activeShare.passwordProtected ? '비밀번호 보호' : '링크 공개';
          setData(current => ({ ...current, docs: current.docs.map(item => item.id === doc.id ? { ...item, ...full, uploaded: true, share: activeShare, visibility } : item) }));
          setSelectedDoc(doc.id); setView('reader'); return;
        }
      } catch (error) { setNotice(error.message || '공유 상태를 확인하지 못했어요.'); return; }
      openDoc(doc); return;
    }
    const wasUploaded = doc.uploaded ?? doc.visibility !== '비공개';
    if (!wasUploaded) { openDoc(doc); return; }
    setSelectedDoc(doc.id);
    setView('reader');
  }
  function editDoc(doc) { setOpenDocMenu(null); openDoc(doc); }
  function confirmSharePassword() {
    if (shareMatch) {
      verifyPublicShare(shareMatch[1], sharePasswordInput).then(result => {
        const authorNickname = authorNicknameFrom(result) || (authUser ? data.prefs.nickname : '');
        setSharedServerDoc({ ...normalizeServerDocument(result, { id: shareMatch[1], authorNickname }, data.prefs), visibility: '비밀번호 보호' });
        setPublicShareLocked(false);
      }).catch(error => setNotice(error.message || '비밀번호가 맞지 않아요.'));
      return;
    }
    if (sharePasswordInput === sharedDoc?.sharePassword) setSharePasswordVerified(true);
    else setNotice('비밀번호가 맞지 않아요.');
  }
  async function saveUpload() {
    if (!hasBodyContent(draft.body)) { setNotice('본문이 비어 있는 글은 저장하거나 업로드할 수 없어요.'); return; }
    if (draft.visibility === '비밀번호 보호' && !passwordDraft.trim() && !currentDoc?.share?.passwordProtected) { setNotice('열람 비밀번호를 입력해 주세요.'); return; }
    if (!draft.title.trim()) { setNotice('업로드할 글 제목을 입력해 주세요.'); return; }
    const savedDocumentId = await saveDraft();
    const backendDocId = currentDoc?.backendId ?? (typeof savedDocumentId === 'number' || typeof savedDocumentId === 'string' ? savedDocumentId : null);
    if (authUser && backendDocId) {
      try {
        const shares = await getShares(backendDocId);
        const activeShare = shares.find(item => item.enabled && (!item.expiresAt || Date.parse(item.expiresAt) > Date.now()));
        if (draft.visibility === '비공개') {
          if (activeShare) await updateShare(activeShare.id, { enabled: false });
          setData(d => ({ ...d, docs: d.docs.map(doc => doc.backendId === backendDocId || doc.id === String(backendDocId) ? { ...doc, uploaded: false, visibility: '비공개', authorNickname: d.prefs.nickname } : doc) }));
        } else {
          let share;
          if (activeShare) {
            const changes = {};
            if (draft.visibility === '비밀번호 보호' && passwordDraft.trim()) changes.password = passwordDraft;
            if (draft.visibility === '링크 공개' && activeShare.passwordProtected) changes.removePassword = true;
            share = Object.keys(changes).length ? await updateShare(activeShare.id, changes) : activeShare;
          } else {
            share = await createShare(backendDocId, draft.visibility === '비밀번호 보호' ? { password: passwordDraft } : {});
          }
          setData(d => ({ ...d, docs: d.docs.map(doc => doc.backendId === backendDocId || doc.id === String(backendDocId) ? { ...doc, uploaded: true, share, visibility: share.passwordProtected ? '비밀번호 보호' : '링크 공개', authorNickname: d.prefs.nickname } : doc) }));
        }
      } catch (error) { setNotice(error.message || '공유 글을 게시하지 못했어요.'); return; }
    } else setData(d => ({ ...d, docs: d.docs.map(doc => doc.id === selectedDoc || (authUser && doc.backendId === backendDocId) ? { ...doc, uploaded: draft.visibility !== '비공개', sharePassword: draft.visibility === '비밀번호 보호' ? passwordDraft : '', visibility: draft.visibility || '비공개', authorNickname: d.prefs.nickname, theme: d.prefs.theme } : doc) }));
    setModal(''); setPasswordDraft(''); setNotice('글을 업로드했어요.');
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
  const isShareRoute = /^\/(?:share|s)\/[^/]+\/?$/.test(window.location.pathname);
  const showNotFound = routePath !== '/' && routePath !== '/index.html' && !knownErrorPath && !isShareRoute;

  if (routePath === '/403') return <ErrorScreen kind="forbidden" themeClass={themeClass} font={data.prefs.font} onHome={() => window.location.assign('/')}/>;
  if (routePath === '/500') return <ErrorScreen kind="server" themeClass={themeClass} font={data.prefs.font} onHome={() => window.location.assign('/')} onRetry={() => window.location.reload()}/>;
  if (routePath === '/offline') return <ErrorScreen kind="offline" themeClass={themeClass} font={data.prefs.font} onHome={() => window.location.assign('/')} onRetry={() => window.location.reload()}/>;
  if (showNotFound) return <ErrorScreen kind="not-found" themeClass={themeClass} font={data.prefs.font} onHome={() => window.location.assign('/')}/>;
  if (fatalError) return <ErrorScreen kind={fatalError} themeClass={themeClass} font={data.prefs.font} onHome={() => window.location.assign('/')} onRetry={() => window.location.reload()}/>;

  if (isShareRoute) {
    if (shareMatch && publicShareLoading) return <main className={`app-shell ${themeClass}`}><div className="auth-loading">공유한 글을 불러오고 있어요</div></main>;
    if (shareMatch && fatalError) return <ErrorScreen kind={fatalError} themeClass={themeClass} font={data.prefs.font} onHome={() => window.location.assign('/')}/>;
    if (!sharedDoc) return <ErrorScreen kind="not-found" themeClass={themeClass} font={data.prefs.font} onHome={() => window.location.assign('/')}/>;
    const sharedIsUploaded = sharedDoc.uploaded ?? sharedDoc.visibility !== '비공개';
    if (!sharedIsUploaded || sharedDoc.visibility === '비공개') return <ErrorScreen kind="forbidden" themeClass={themeClass} font={data.prefs.font} onHome={() => window.location.assign('/')}/>;
    const passwordLocked = shareMatch ? publicShareLocked : sharedDoc.visibility === '비밀번호 보호' && !sharePasswordVerified;
    return <ReadDocument doc={sharedDoc} theme={data.prefs.theme || 'white'} readerDefaults={data.prefs} viewerNickname={data.prefs.nickname} viewerEmail={authUser?.email} isShared locked={passwordLocked} password={sharePasswordInput} onPasswordChange={setSharePasswordInput} onVerify={confirmSharePassword} onBack={() => window.location.assign('/')} notice={notice} clearNotice={() => setNotice('')}/>;
  }

  if (!authReady) return <main className={`app-shell login-shell ${themeClass}`}><div className="auth-loading"><span className="brand-mark">w.</span><span>WBW를 준비하고 있어요</span></div></main>;
  if (!authUser && !previewMode) return <LoginScreen
    loading={authLoading} error={authError} onGoogle={handleGoogleLogin}
    onPreview={() => { setPreviewMode(true); setAuthError(''); setAuthSuccess(''); }}
  />;
  if (authUser && !apiReady) return <main className={`app-shell login-shell ${themeClass}`}><div className="auth-loading"><span className="brand-mark">w.</span><span>서재를 불러오고 있어요</span></div></main>;

  if (view === 'reader' && currentDoc) return <main className={`app-shell ${themeClass}`} style={{ '--app-font': data.prefs.font }}><ReadDocument doc={currentDoc} theme={data.prefs.theme || 'white'} readerDefaults={data.prefs} viewerNickname={data.prefs.nickname} viewerEmail={authUser?.email || '로컬 미리보기 계정'} isShared={false} onBack={() => setView('library')} onEdit={() => editDoc(currentDoc)} onDelete={() => deleteDoc(currentDoc)} onOpenSettings={() => { setView('library'); setSettingsOpen(true); }} dialog={dialog} dialogInput={dialogInput} setDialogInput={setDialogInput} closeDialog={closeDialog} notice={notice} clearNotice={() => setNotice('')}/></main>;

  /* 편집기 용지 크기/위치 (쪽 계산 결과) */
  const pageRows = geometry.double ? Math.ceil(pageCount / 2) : pageCount;
  const paperHeight = pageRows * geometry.sheetH + (pageRows - 1) * geometry.gap;
  const wrapStyle = geometry.double
    ? { width: (geometry.sheetW * 2 + geometry.gap) * geometry.scale, height: paperHeight * geometry.scale }
    : { width: geometry.sheetW };
  const paperInlineStyle = {
    ...paperStyle(draft),
    '--sheet-w': `${geometry.sheetW}px`,
    '--sheet-h': `${geometry.sheetH}px`,
    '--page-gap': `${geometry.gap}px`,
    '--page-unit': `${geometry.sheetH + geometry.gap}px`,
    height: draft.page === 'Letter' ? 'auto' : `${paperHeight}px`,
    ...(geometry.double ? { width: `${geometry.sheetW * 2 + geometry.gap}px`, transform: `scale(${geometry.scale})` } : {})
  };

  return <main className={`app-shell ${themeClass}`} style={{ '--app-font': data.prefs.font }}>
    <div className="topbar">
      <button className="brand" onClick={() => setView('library')}><span className="brand-mark">w.</span><span>WBW</span></button>
      {view === 'library' && <nav className="top-nav"><button className="nav-current" onClick={() => setView('library')}>내 서재</button></nav>}
      <div className="top-actions"><button className="avatar" aria-label="프로필 열기" onClick={() => setProfileOpen(true)}>{(data.prefs.nickname || 'W').slice(0,1)}</button></div>
    </div>

    {view === 'library' && <section className="library-page">
      <div className="workspace-grid home-workspace-grid">
        <section className="documents-card home-documents-card"><div className="documents-head"><div><div className="crumb"><span>내 서재</span><ChevronRight size={14}/><strong>{folderLabel(selectedFolder)}</strong></div><h2>{folderLabel(selectedFolder)}</h2><p className="subtle">{visibleDocs.length}개의 글</p></div><div className="list-actions"><label className="search-box"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="글 검색"/></label><button type="button" className="sort-toggle" onClick={()=>setSortMode(mode=>mode==='modified'?'created':'modified')} title="정렬 기준 전환"><ArrowUpDown size={16}/><span>{sortMode==='modified'?'최근 수정순':'만든 순'}</span></button></div></div>
          {!!childFolders.length && <div className="subfolder-strip">{childFolders.map(f=><button className="subfolder-chip" key={f.id} onClick={()=>setActiveFolder(f.id)}><Folder size={15}/>{f.name}<ChevronRight size={14}/></button>)}</div>}
          {visibleDocs.length ? <div className="doc-list">{visibleDocs.map(doc => { const uploaded = doc.uploaded ?? doc.visibility !== '비공개'; const listTitle = documentListTitle(doc); return <article className="doc-row" key={doc.id}><button className="doc-main" onClick={()=>openDocFromList(doc)}><span className="doc-icon"><FileText size={18}/></span><span className="doc-copy"><strong>{listTitle}</strong><small>{String(doc.preview || countChars(doc.body)).slice(0,68) || '아직 내용이 없어요.'}</small></span><time>{formatDate(doc.updated)}</time></button>{uploaded && <span className={`visibility ${doc.visibility==='링크 공개'?'public':''}`}>{doc.visibility}</span>}<div className="row-menu-wrap"><button className="row-more" title="글 메뉴" aria-label={`${listTitle} 글 메뉴`} aria-expanded={openDocMenu===doc.id} onClick={()=>setOpenDocMenu(value=>value===doc.id?null:doc.id)}><MoreHorizontal size={18}/></button>{openDocMenu===doc.id&&<div className="row-menu">{uploaded&&<button onClick={()=>editDoc(doc)}>수정하기</button>}<button className="danger" onClick={()=>{setOpenDocMenu(null);deleteDoc(doc)}}>삭제하기</button></div>}</div></article>; })}</div> : <div className="empty-state"><span className="empty-icon"><FilePlus2 size={22}/></span><h3>아직 이 폴더에 글이 없어요</h3><p>첫 문장을 적어볼까요?</p><button className="button button-outline" onClick={newDoc}><Plus size={16}/>글 작성하기</button></div>}
        </section>
        <aside className="home-side-panel"><button className="button button-dark home-write-button" onClick={newDoc}><Plus size={20}/>작성하기</button><div className="folder-card"><div className="card-heading"><div><span className="eyebrow">LIBRARY</span><h2>폴더</h2></div><div className="folder-heading-actions"><IconButton title="폴더 추가" onClick={createFolder}><Plus size={18}/></IconButton><IconButton title={folderDeleteMode?'폴더 삭제 모드 닫기':'폴더 삭제 모드'} active={folderDeleteMode} onClick={()=>setFolderDeleteMode(value=>!value)}><Minus size={18}/></IconButton></div></div>
          <button className={`folder-row ${activeFolder===null?'selected':''}`} onClick={() => setActiveFolder(null)} onDragOver={event=>event.preventDefault()} onDrop={event=>handleFolderDrop(event,null)}><BookOpen size={17}/><span>모든 글</span><small>{totalCount}</small></button>
          {data.folders.filter(f => !f.parent).map(folder => <FolderTree key={folder.id} folder={folder} all={data.folders} active={activeFolder} setActive={setActiveFolder} docs={data.docs} rename={renameFolder} deleteMode={folderDeleteMode} removeFolder={deleteFolder} moveFolder={moveFolder}/>) }
        </div></aside>
      </div>
      <div className="home-footer"><span>WRITE BY WRITING</span><span>오늘도 당신의 문장을 응원해요.</span></div>
    </section>}

    {view === 'editor' && <section className="editor-page" onKeyDownCapture={handleEditorKeyDown}>
      <div className="editor-top"><button className="back-link" onClick={()=>{clearTimeout(timerRef.current);saveDraft();setView('library')}}><ArrowLeft size={17}/>내 서재</button><div className="editor-breadcrumb">{folderLabel(data.folders.find(f=>f.id===draftFolder))}<ChevronRight size={14}/><span>{draft.title || '새 글'}</span></div><div className="editor-user"><span className="save-label"><i className={saveState==='저장됨'?'saved':''}/>{saveState}</span></div></div>
      <div className="toolbar" onMouseDownCapture={event=>{rememberEditorSelection();if(event.target.closest('button'))event.preventDefault();}}><div className="tool-group"><label className="select-wrap"><select value={draft.page} onChange={e=>changeDraft('page',e.target.value)}><option>A4</option><option>A5</option><option>Letter</option></select><ChevronDown size={13}/></label><button className="toolbar-text" onClick={()=>setModal('layout')}>레이아웃</button></div><span className="tool-divider"/><div className="tool-group"><label className="select-wrap font-select"><select value={inlineFormat.font || draft.font} onChange={e=>changeFont(e.target.value)}><option>Pretendard</option><option>Georgia</option><option>바탕</option><option>맑은 고딕</option><option>serif</option></select><ChevronDown size={13}/></label><label className="numeric-toolbar"><input type="number" min="1" max="72" step="1" aria-label="글자 크기" value={sizeInput} onChange={e=>{const raw=e.target.value;setSizeInput(raw);const value=Number(raw);if(raw!==''&&Number.isFinite(value)&&value>=1&&value<=72)changeFontSize(value);}} onBlur={()=>{const value=Number(sizeInput);if(sizeInput===''||!Number.isFinite(value)||value<1||value>72)setSizeInput(String(inlineFormat.size??draft.size));restoreEditorSelectionFocus();}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur();}}}/><span>pt</span></label><label className="icon-button color-picker-button" title="글자색"><span className="color-dot" style={{background:inlineFormat.color || draft.color}}/><input id="color-picker" className="hidden-input" aria-label="글자색 선택" type="color" value={inlineFormat.color || draft.color} onChange={e=>applyTextColor(e.target.value)}/></label></div><span className="tool-divider"/><div className="tool-group"><IconButton title="굵게" onClick={()=>exec('bold')}><Bold size={17}/></IconButton><IconButton title="기울임" onClick={()=>exec('italic')}><Italic size={17}/></IconButton><IconButton title="밑줄" onClick={()=>exec('underline')}><Underline size={17}/></IconButton></div><span className="tool-divider"/><div className="tool-group"><IconButton title="왼쪽 정렬" onClick={()=>exec('justifyLeft')}><AlignLeft size={17}/></IconButton><IconButton title="가운데 정렬" onClick={()=>exec('justifyCenter')}><AlignCenter size={17}/></IconButton><IconButton title="오른쪽 정렬" onClick={()=>exec('justifyRight')}><AlignRight size={17}/></IconButton></div><span className="tool-divider"/><div className="tool-group layout-tweaks"><button className="toolbar-text" onClick={()=>setModal('layout')}>자간 · 줄 간격</button></div><div className="toolbar-spacer"/></div>
      <div className="writing-workspace" ref={workspaceRef}><div className={`paper-wrap ${geometry.double?'paper-wrap-double':''}`} style={wrapStyle}><div className={`paper ${draft.page === 'Letter' ? 'paper-letter' : 'paper-paged'} ${geometry.double?'paper-spread':''} ${geometry.double && pageCount % 2 === 1 ? 'paper-odd' : ''} ${draft.firstLineIndent===false?'':'first-line-indent'}`} style={paperInlineStyle} onMouseDown={handlePaperMouseDown}><div ref={editorRef} className="prose-editor" contentEditable spellCheck={false} suppressContentEditableWarning onBeforeInput={handleEditorBeforeInput} onInput={handleEditorInput} onPaste={handleEditorMediaTransfer} onDragOver={handleEditorDragOver} onDrop={handleEditorMediaTransfer} onMouseDown={handleEmptyEditorMouseDown} onMouseUp={()=>rememberEditorSelection(true)} onKeyUp={()=>rememberEditorSelection(true)} /><span className={`editor-placeholder${draft.firstLineIndent === false ? '' : ' editor-placeholder-indented'}`} aria-hidden="true" hidden={hasEditorInput(draft.body)}>이곳에서 글을 시작하세요.</span></div></div></div>
      <footer className="editor-footer editor-bottom-bar"><div className="editor-counts" style={{ columnGap: 18 }}><span>공백 포함 <b><i>{countChars(draft.body).length.toLocaleString('ko-KR')}</i><span>자</span></b></span><span style={{ marginLeft: 18 }}>공백 미포함 <b><i>{countChars(draft.body).replace(/\s/g,'').length.toLocaleString('ko-KR')}</i><span>자</span></b></span></div><div className="editor-bottom-actions" style={{ gap: 18 }}><button className="button button-light share-button" onClick={()=>setModal('upload')}><Share2 size={15}/>업로드</button><button className="button button-dark export-button" style={{ marginLeft: 18 }} onClick={()=>setModal('export')}><Download size={15}/>내보내기</button></div></footer>
    </section>}

    {profileOpen && <><div className="drawer-scrim" onClick={()=>setProfileOpen(false)}/><aside className="profile-drawer"><header className="drawer-head"><span className="eyebrow">ACCOUNT</span><IconButton title="닫기" onClick={()=>setProfileOpen(false)}><X size={18}/></IconButton></header><div className="profile-summary"><div className="profile-avatar">{(data.prefs.nickname || 'W').slice(0,1)}</div><h2>{data.prefs.nickname}</h2><p>{authUser?.email || '로컬 미리보기 계정'}</p><span className="profile-tag">WBW WRITER</span></div><div className="drawer-rule"/><button className="drawer-link" onClick={()=>{setProfileOpen(false);setView('library')}}><BookOpen size={18}/><span>내 서재</span><ChevronRight size={16}/></button><button className="drawer-link" onClick={()=>{setProfileOpen(false);setSettingsOpen(true)}}><Settings size={18}/><span>환경 설정</span><ChevronRight size={16}/></button><div className="drawer-bottom"><p>나만의 문장을 쓰는 공간</p><button className="logout-button" onClick={doSignOut}><LogOut size={16}/>로그아웃</button></div></aside></>}

    {settingsOpen && <Modal title="환경 설정" close={()=>setSettingsOpen(false)} wide><div className="settings-body"><section className="settings-section"><div><h3>테마 색상</h3><p>서재의 분위기를 선택해요.</p></div><div className="theme-options">{[['sky','하늘','#dceefa'],['white','하양','#fff'],['black','검정','#292929'],['gray','회색','#d6d6d6'],['sand','베이지','#eee6d9']].map(([id,label,color])=><button className={`theme-option ${data.prefs.theme===id?'chosen':''}`} key={id} onClick={()=>updatePrefs('theme',id)}><i style={{background:color}}/><span>{label}</span></button>)}</div></section><section className="settings-section"><div><h3>기본 글꼴</h3><p>편집기에 사용할 글꼴을 설정해요.</p></div><select className="settings-select" value={data.prefs.font} onChange={e=>updatePrefs('font',e.target.value)}><option>Pretendard</option><option>Georgia</option><option>바탕</option><option>맑은 고딕</option><option>serif</option></select></section><section className="settings-section"><div><h3>닉네임</h3><p>서재에 표시될 이름이에요.</p></div><div className="nickname-controls"><input value={data.prefs.nickname} onChange={e=>updatePrefs('nickname',e.target.value)} maxLength={24}/><button className="button button-outline" onClick={()=>updatePrefs('nickname',randomNames[Math.floor(Math.random()*randomNames.length)])}><Sparkles size={15}/>랜덤</button></div></section><section className="danger-zone"><div><h3>계정 탈퇴</h3><p>탈퇴하면 계정과 업로드한 글이 모두 삭제됩니다.</p></div><button className="button button-danger" onClick={()=>setModal('delete-account')}><Trash2 size={15}/>계정 탈퇴</button></section></div><div className="modal-footer"><button className="button button-dark" onClick={()=>setSettingsOpen(false)}>완료</button></div></Modal>}

    {modal==='layout' && <Modal title="문서 레이아웃" close={()=>{setModal('');restoreEditorSelectionFocus()}}><div className="layout-form"><label>용지 크기<select value={draft.page} onChange={e=>changeDraft('page',e.target.value)}><option>A4</option><option>A5</option><option>Letter</option></select></label><PagePreview draft={draft}/><div className="page-view-control"><span>페이지 보기</span><div><button type="button" className={draft.viewMode==='single'?'selected':''} onClick={()=>changeDraft('viewMode','single')}>단면 보기</button>{draft.page !== 'Letter' && <button type="button" className={draft.viewMode==='double'?'selected':''} onClick={()=>changeDraft('viewMode','double')}>양면 보기</button>}</div></div><fieldset className="margin-settings"><legend>여백</legend><div className="margin-grid">{[['marginTop','위쪽'],['marginRight','오른쪽'],['marginBottom','아래쪽'],['marginLeft','왼쪽']].map(([key,label])=><label className="number-setting" key={key}>{label}<span className="number-input-wrap"><input type="number" min="0" max="100" step="1" value={draft[key]} onChange={e=>changeDraft(key,Number(e.target.value))}/><small>mm</small></span></label>)}</div></fieldset><label className="layout-checkbox"><span>문단 첫 줄 들여쓰기</span><input type="checkbox" checked={draft.firstLineIndent !== false} onChange={e=>changeDraft('firstLineIndent',e.target.checked)}/></label><label className="number-setting">자간<span className="number-input-wrap"><input type="number" min="-1" max="10" step="0.1" value={draft.spacing} onChange={e=>changeDraft('spacing',Number(e.target.value))}/><small>px</small></span></label><label className="number-setting">줄 간격<span className="number-input-wrap"><input type="number" min="0.1" max="3" step="0.1" value={draft.line} onChange={e=>changeDraft('line',Number(e.target.value))}/><small>배</small></span></label><p className="form-note">글꼴은 이 기기에서 사용할 수 있는 글꼴을 기준으로 표시됩니다.</p></div><div className="modal-footer modal-footer-between"><button className="button button-outline" onClick={resetLayout}>기본값으로 초기화</button><button className="button button-dark" onClick={()=>{setModal('');restoreEditorSelectionFocus()}}>적용</button></div></Modal>}

    {modal==='upload' && <Modal title="글 업로드" close={()=>{setModal('');setPasswordDraft('')}}><div className="upload-form"><label>글 제목<input value={draft.title} onChange={e=>changeDraft('title',e.target.value)} placeholder="제목을 입력해 주세요"/></label><label>공개 설정<select value={draft.visibility || '비공개'} onChange={e=>{changeDraft('visibility',e.target.value);if(e.target.value!=='비밀번호 보호')setPasswordDraft('')}}><option>비공개</option><option>링크 공개</option><option>비밀번호 보호</option></select></label>{draft.visibility==='비밀번호 보호'&&<label>열람 비밀번호<input type="password" autoComplete="new-password" value={passwordDraft} onChange={e=>setPasswordDraft(e.target.value)} placeholder="비밀번호를 입력해 주세요"/></label>}<div className="share-link-box"><Link2 size={16}/><span>{currentDoc?.share?.url || (currentDoc?.backendId ? '저장 후 공유 링크가 표시됩니다.' : '글을 저장한 뒤 링크를 만들 수 있어요.')}</span><button onClick={shareDoc}>복사</button></div><p className="form-note">링크 권한과 비밀번호는 백엔드에서 확인합니다.</p></div><div className="modal-footer"><button className="button button-dark" onClick={saveUpload}>저장하기</button></div></Modal>}

    {modal==='export' && <Modal title="문서 내보내기" close={()=>setModal('')} wide><div className="export-content"><div className="preview-area"><div className="preview-paper"><span className="preview-top">WBW · {draft.page}</span>{draft.title && <h3>{draft.title}</h3>}<div className="preview-text">{countChars(draft.body).slice(0,280) || '작성한 내용이 여기에 미리 표시됩니다.'}</div><span className="preview-page">1</span></div><span className="preview-caption">1쪽 미리보기</span></div><div className="export-options"><span className="eyebrow">FILE FORMAT</span><button onClick={()=>exportPdf('browser')}><span className="format-icon"><Printer size={18}/></span><span><b>PDF 문서</b><small>인쇄 창에서 "PDF로 저장" (한글·쪽 나누기 정확)</small></span><ChevronRight size={17}/></button>{authUser && <button onClick={()=>exportPdf('server')}><span className="format-icon"><Download size={18}/></span><span><b>서버 PDF (임시)</b><small>서버 글꼴 문제가 해결되기 전에는 한글이 깨질 수 있어요</small></span><ChevronRight size={17}/></button>}</div></div></Modal>}

    {modal==='delete-account' && <Modal title="계정 탈퇴" close={()=>{setModal('');setDeleteConfirmName('')}}><div className="delete-warning"><div className="warning-icon"><Trash2 size={20}/></div><h3>정말 탈퇴하시겠어요?</h3><p>탈퇴하면 계정과 업로드한 글이 모두 삭제되며 되돌릴 수 없습니다.</p><label>확인을 위해 닉네임을 입력해 주세요<input value={deleteConfirmName} placeholder={data.prefs.nickname} onChange={e=>setDeleteConfirmName(e.target.value)}/></label></div><div className="modal-footer"><button className="button button-outline" onClick={()=>{setModal('');setDeleteConfirmName('')}}>취소</button><button className="button button-danger" disabled={deleteConfirmName!==data.prefs.nickname} onClick={()=>setNotice('계정 삭제는 실제 인증·서버 연동 후 활성화됩니다.')}>영구 삭제</button></div></Modal>}

    {dialog && <Modal title={dialog.title} close={()=>closeDialog(false)}><div className="confirm-dialog-copy"><p>{dialog.message}</p>{dialog.type==='prompt'&&<input className="dialog-input" autoFocus value={dialogInput} onChange={event=>setDialogInput(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();closeDialog(true);}}} placeholder="폴더 이름"/>}</div><div className="modal-footer"><button className="button button-outline" onClick={()=>closeDialog(false)}>취소</button><button className={`button ${dialog.danger?'button-danger':'button-dark'}`} onClick={()=>closeDialog(true)}>{dialog.confirmLabel || '확인'}</button></div></Modal>}

    {notice && <div className="notice-veil" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setNotice('')}}><section className="notice-dialog" role="alertdialog" aria-modal="true" aria-live="assertive"><div className="notice-icon"><Check size={18}/></div><p>{notice}</p><button className="button button-dark" onClick={()=>setNotice('')}>확인</button></section></div>}
    {toastNotice && <div className="toast"><Check size={16}/>{toastNotice}</div>}
    <style>{`@media print{@page{size:${draft.page};margin:${draft.marginTop}mm ${draft.marginRight}mm ${draft.marginBottom}mm ${draft.marginLeft}mm}}`}</style>
    <div className={`print-only ${draft.firstLineIndent===false?'':'first-line-indent'}`} style={{ ...paperStyle(draft), '--export-background': exportPalette.background, '--export-foreground': exportTextColor }}>{draft.title && <h1>{draft.title}</h1>}<div dangerouslySetInnerHTML={{__html:draft.body}} /></div>
  </main>;
}

function LoginScreen({ loading, error, onGoogle, onPreview }) {
  return <main className="login-shell">
    <header className="login-header"><a className="brand" href="#top"><span className="brand-mark">w.</span><span>WBW</span></a><span className="login-header-note">WRITE BY WRITING</span></header>
    <div className="login-layout">
      <section className="login-story"><div className="story-top"><span className="story-kicker"><i/> YOUR PERSONAL WRITING SPACE</span><span className="story-number">NO. 001</span></div><div className="story-copy"><p>당신의 문장이<br/>머무는 곳.</p><span>Write freely.<br/>Keep every word.</span></div><div className="story-paper"><div className="paper-lines"><span>오늘은 조금 천천히</span><span>문장을 골라 써보기로 했다.</span><span>마음이 따라올 때까지.</span></div><span className="paper-number">01 / 03</span></div><div className="story-bottom"><span>WORDS ARE YOURS.</span><span>EST. WBW</span></div></section>
      <section className="login-panel"><div className="login-card">
        <div className="login-heading"><span className="eyebrow">WELCOME TO WBW</span><h1>다시, 문장을 써볼까요?</h1><p>글을 쓰고, 정리하고, 오래 간직하세요.</p></div>
        {error && <p className="auth-message auth-error" role="alert">{error}</p>}
        <button className="google-button" onClick={onGoogle} disabled={loading}>{loading?<span className="button-spinner"/>:<GoogleMark/>}Google 계정으로 계속하기</button>
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
