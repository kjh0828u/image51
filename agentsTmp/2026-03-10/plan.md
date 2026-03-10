# 수익화 및 검색 최적화(SEO) & 다국어 지원 작업 계획

사용자의 요청에 따라 프로젝트의 검색 엔진 최적화(SEO)를 강화하고, 한국어/영어 다국어 지원 기능을 추가하기 위한 계획입니다.

## 1. 개요
- **목표**: 
  - 검색 엔진 노출을 통한 유입량 증대 (SEO)
  - 글로벌 사용자 대응을 위한 다국어(KO, EN) 지원
  - 사용자 환경에 따른 자동 언어 감지 및 수동 변경 기능 구현

## 2. 작업 상세 계획

### 2.1 SEO (Search Engine Optimization) 강화
- [ ] **메타데이터 보강**: `src/app/layout.tsx`에 `Metadata` 오브젝트를 상세히 정의합니다.
  - 키워드: 배경 제거, 이미지 압축, 리사이즈, 무료 온라인 도구 등 국/영문 키워드 포함.
  - OpenGraph, Twitter Card 설정 추가.
- [ ] **robots.txt & sitemap.xml**: Next.js App Router 방식을 사용하여 동적 또는 정적 파일 생성.
- [ ] **시맨틱 태그 점검**: 페이지 내 `h1`, `h2` 등 구조적 마크업 확인 및 보완.

### 2.2 다국어(i18n) 시스템 구축
- [ ] **라이브러리 설치**: `i18next`, `react-i18next`, `i18next-browser-languagedetector` 설치.
- [ ] **번역 리소스 작성**: 
  - `src/locales/ko.json`: 현재 UI의 모든 한글 텍스트 추출.
  - `src/locales/en.json`: 영문 번역본 작성.
- [ ] **i18n 초기화**: `src/lib/i18n.ts` 생성 및 앱 진입점(`layout.tsx`)에 설정.
- [ ] **Zustand 연동**: `useAppStore`에 `language` 설정을 추가하여 언어 변경 시 즉시 반영되도록 구현.

### 2.3 환경설정 UI 업데이트
- [ ] **SettingsModal 수정**: `src/components/SettingsModal.tsx`에 언어 선택(자동/한국어/영어) 옵션 추가.
- [ ] **자동 인식 로직**: `i18next-browser-languagedetector`를 활용하거나, Zustand 초기화 시 브라우저 설정(navigator.language)을 감지하도록 구현.

### 2.4 코드 리팩토링 최소화 및 최적화
- [ ] 텍스트 하드코딩을 제거하고 `t('key')` 형태로 일괄 교체.
- [ ] 기존 로직(이미지 처리 파이프라인 등)은 건드리지 않고 UI 텍스트만 분리.

## 3. 완료 후 점검 사항
- [ ] `npm run build` 시 에러 발생 여부 확인.
- [ ] 브라우저 언어 설정 변경 시 자동 전환 확인.
- [ ] 설정 모달에서 언어 변경 시 UI 즉시 업데이트 확인.
- [ ] Google 검색 센터(Lighthouse 등) 기준 SEO 점수 확인.

---

## 4. 작업 시작
1. 라이브러리 설치 (`i18next` 계열)
2. `i18n` 설정 및 JSON 파일 생성
3. UI 텍스트 교체 작업 시작
