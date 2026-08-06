# DooDoo

Expo React Native로 만든 개인용 캘린더 기반 할 일 앱 첫 버전입니다.

## 실행

```bash
npm install
npm start
```

Expo Go 앱으로 QR을 스캔하거나, 시뮬레이터가 있다면 `npm run ios` 또는 `npm run android`를 사용할 수 있습니다.

## 구현된 기능

- 로그인 / 회원가입 화면
- 월 / 주 캘린더 전환
- 날짜별 할 일 목록
- 밀린 할 일
- 우선순위별 할 일 그룹
- 할 일 추가 바텀시트
- 할 일 상세 보기
- 설정, 분야 관리, 통계 화면
- AsyncStorage 기반 로컬 저장

## 구조

- `App.js`: 화면 흐름과 UI 컴포넌트
- `src/storage/localStore.js`: 로컬 저장소 어댑터

나중에 Firebase나 Supabase를 붙일 때는 `src/storage/localStore.js`와 같은 형태의 저장소 어댑터를 새로 만들고, 화면에서는 동일한 저장/조회 함수를 호출하도록 확장하면 됩니다.
