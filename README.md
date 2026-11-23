# WBW 글쓰기 플랫폼

Vite + React로 만든 WBW 웹앱 시작 프로젝트입니다. 메인 서재, 중첩 폴더, 글 편집 화면, 프로필 패널, 설정, 업로드·내보내기 창이 포함되어 있습니다.

## 실행

Node.js 20.19+ 또는 22.12+ 설치 후 프로젝트 폴더에서 실행합니다.

```bash
npm install
npm run dev
```

터미널에 표시되는 로컬 주소를 브라우저에서 엽니다. 운영용 파일은 `npm run build`로 만듭니다.

## 현재 동작 범위

- 글·폴더·테마·닉네임은 현재 브라우저의 `localStorage`에 저장됩니다. 계정이나 서버 저장은 아직 연결되지 않았습니다.
- PDF 저장은 브라우저 인쇄 대화상자를 사용합니다. TXT와 PNG/JPEG 다운로드도 지원합니다. 이미지 내보내기는 한 페이지 텍스트 렌더링입니다.
- Google 로그인에 필요한 Supabase 클라이언트와 환경 변수 자리는 준비되어 있습니다. `.env.example`을 `.env`로 복사해 Supabase URL과 publishable/anon key를 입력하면 OAuth 시작을 연결할 수 있습니다.
- 폴더·문서 CRUD, 사용자별 보안, 공개 링크 검증, 비밀번호 공유, 예약 업로드, 계정 탈퇴는 백엔드 스키마/API와 연결해야 실제로 안전하게 동작합니다. 현재 화면은 디자인·프런트엔드 동작을 확인하는 독립 실행 버전입니다.

## 백엔드 연동 전 합의할 계약

- `profiles`: auth user ID, 닉네임, 설정
- `folders`: ID, owner ID, parent ID, 이름, 정렬 순서
- `documents`: ID, owner ID, folder ID, 제목, Tiptap JSON 본문, 설정 JSON, 공개 상태, 수정 시각, 버전
- `document_shares`: 문서 ID, 무작위 토큰 해시, 권한 유형, 암호 해시, 만료/폐기 시각
- 모든 사용자 테이블에 RLS를 켜고 owner ID 기반 정책을 적용합니다. 공유 읽기는 공개용 서버 함수/API로만 노출하고 service-role 비밀 키는 브라우저에 넣지 않습니다.
- 자동 저장은 편집기 변경 후 debounce 저장과 주기 저장을 함께 적용하고, `version` 또는 `updated_at`을 이용해 덮어쓰기 충돌을 탐지합니다.

이 폴더는 기존 프로젝트의 다른 파일과 분리된 독립 앱입니다.
