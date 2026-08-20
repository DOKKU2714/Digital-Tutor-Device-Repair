# 디지털튜터 기기수리 요청 사이트

Google Apps Script 웹앱 + Google Spreadsheet 기반의 기기 수리 접수/신청 조회 서비스입니다.

## 설치

1. Google Spreadsheet를 새로 만들고 URL의 `/d/`와 `/edit` 사이 값을 복사합니다.
2. Apps Script 프로젝트에 이 저장소의 `appsscript.json`, `Config.gs`, `Code.gs`, `Index.html`, `Styles.html`, `Scripts.html`을 업로드합니다.
3. `Config.gs`의 `SPREADSHEET_ID`에 복사한 값을 넣습니다.
4. Apps Script 편집기에서 `setup` 함수를 한 번 실행해 권한을 승인하고 `Requests`, `AdminUsers` 시트를 생성합니다.
5. `배포 > 새 배포 > 웹 앱`에서 실행 주체를 소유자, 액세스 권한을 학교 사용 범위에 맞게 설정합니다.

## clasp로 업로드하기

1. Apps Script 프로젝트의 `프로젝트 설정 > ID`에서 스크립트 ID를 복사합니다.
2. `.clasp.json`의 `scriptId`에 스크립트 ID를 입력합니다.
3. Node.js가 설치된 환경에서 다음 명령을 실행합니다.

```bash
npm install
npm run clasp:login
npm run clasp:push
```

기존 Apps Script 프로젝트의 코드를 내려받으려면 `npm run clasp:pull`, 편집기에서 열려면 `npm run clasp:open`을 사용합니다. 웹앱 배포 설정은 Apps Script 편집기의 `배포` 메뉴에서 진행합니다.

## 스프레드시트 운영

`Requests` 시트의 `status` 값을 `접수`, `수리 진행 중`, `수리 완료`, `반려` 중 하나로 바꾸면 신청 조회 화면에 바로 반영됩니다. 반려할 때는 `rejectionReason` 열에 사유를 입력합니다. `updatedAt` 열은 상태 변경 시각을 직접 입력하거나 운영 자동화에서 갱신할 수 있습니다.

사진은 `DRIVE_FOLDER_ID`를 지정하면 해당 Drive 폴더에, 비워두면 `DRIVE_FOLDER_NAME` 이름의 폴더에 저장됩니다. 저장된 사진 링크는 `patternImageUrl` 또는 `additionalImageUrls` 열에 기록됩니다.

## 관리자 화면

`AdminUsers` 시트에 아래 형식으로 관리자 계정을 추가합니다.

| username | password | displayName | isActive |
|---|---|---|---|
| admin01 | 안전한 비밀번호 | 홍길동 | TRUE |

`isActive`가 `TRUE`, `Y`, `예`, `활성` 중 하나인 계정만 로그인할 수 있습니다. 웹앱의 `관리자` 탭을 클릭하면 로그인 모달이 열리고, 로그인 후 전체 요청 조회·상태 검색·신청 상세 확인·상태 변경·반려 사유 저장·새로고침·로그아웃을 사용할 수 있습니다. 신청 목록은 기본적으로 요약 리스트로 표시되며 항목을 클릭하면 상세 내용이 펼쳐지고, 페이지당 표시 수는 `Config.gs`의 `ADMIN_PAGE_SIZE`에서 변경할 수 있습니다. 관리자 계정을 추가하거나 수정한 뒤에는 별도 배포 없이 바로 반영됩니다.

## 개인정보 주의

`AdminUsers`의 비밀번호와 `studentGooglePassword`, `devicePassword`는 민감정보입니다. 현재 기능 완성을 위해 스프레드시트에 저장하도록 구성했지만, 실제 운영 전 학교 개인정보보호 담당자와 저장 여부, 보관 기간, 접근 권한, 수리 완료 후 삭제 정책을 확인하세요. 특히 `AdminUsers` 시트는 관리자만 접근할 수 있도록 스프레드시트 공유 권한을 제한하세요. 저장하지 않으려면 `STORE_SENSITIVE_DATA`를 `false`로 바꿀 수 있으며, 그 경우 신청 화면에서는 입력을 받지만 수리 요청 데이터에는 비밀번호를 저장하지 않습니다.
