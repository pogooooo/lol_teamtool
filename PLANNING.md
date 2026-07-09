# PLANNING.md — 내전팟 기획서

작성일: 2026-07-07 · 배포: https://lol-teamtool.vercel.app

**서비스명: 내전팟 (영문 표기: Naejeonpot)** — Riot 상표 정책상 제품명에 LoL/League of Legends를 넣지 않는다.

## 1. 서비스 개요

롤(LoL) 내전 5:5 팀 밸런스 빌더에 **Riot API 기반 내전 기록/전적 관리**를 더한 서비스로 확장한다.

핵심 원칙:
- **수동 기록 없음.** 내전 기록은 전부 Riot API에서 가져와 저장한다. 사용자가 결과를 직접 입력하는 기능은 만들지 않는다.
- **로그인 없음.** 계정 시스템 대신 그룹 코드로 데이터를 격리한다 (최대한 간단하게).
- **데이터는 전부 저장.** API가 주는 것을 다 저장하고, 화면에 보여줄 것만 선별한다 (5장).

## 2. 기획 항목 및 상태

| # | 항목 | 상태 |
|---|---|---|
| 1 | 팀 빌딩 화면 무스크롤 설계 | ✅ 완료 (DESIGN.md 2.2) |
| 2 | 새 팔레트 리디자인 + DESIGN.md | ✅ 완료 |
| 3 | Riot API 데이터 전체 저장, 빼는 방식으로 선정 | ✅ 확정 (아래 5장) |
| 4 | TypeScript 전환 | ✅ 완료 |
| 5 | 그룹별 내전 기록 격리 (로그인 없이, 코드 기반) | 🔨 프로토타입 구현 (로컬 저장, 서버 검증은 8장 이후) |
| 6 | 내전 기록 검색 (기간·참가자 필터) | ✅ UI 구현 (기간/참가자/승패 필터) |
| 7 | 무료 호스팅 + DB (수익화 감안) | 📋 설계 (8장) — 이번 범위 제외 |
| 8 | 기본 기능 우선 | 원칙 — 마일스톤 순서대로 |
| 9 | 그룹 참가자별 롤 계정 등록 (1인당 여러 개) | ✅ UI 구현 (대표 계정 지정 포함, puuid는 mock) |
| 10 | 티어 자동 배치 — 설정 온오프, 기본 켜짐, 설정 로컬 저장 | 📋 설계 (9장) — 이번 범위 제외 |
| 11 | Spectator 실시간 승패 확률 | 📋 장기 (M4, 10장) |
| 12 | AdSense 대응 — 개인정보처리방침 + 콘텐츠 | ✅ `/privacy.html`, `/guide.html` (광고 유닛 포함) |

## 3. 마일스톤

| 단계 | 내용 | 필요한 것 |
|---|---|---|
| **M1** | 그룹 생성/코드 격리 + 참가자·롤 계정 등록 + **Riot API로 내전 자동 수집** + 목록/상세/검색 | Development Key로 개발 |
| **M2** | Personal API Key 전환 후 공개 + 티어 자동 배치(설정) + 통계/요약 카드 채우기 | Personal Key 승인 (데모 = M1 결과물) |
| **M3** | 토너먼트 코드 연동 (로비 자동 생성, 결과 콜백) | Tournament API 별도 승인 |
| **M4** | Spectator 실시간 게임 감지 + 승패 확률 표시 | 자체 승률 모델 (10장) |

> 키 전략: Development Key(24시간 만료)로는 실서비스 불가 → M1을 개발 키로 완성 → 그 데모로 Personal Key 신청 → 발급 후 공개(M2). 신청 방법은 이전 정리 참조.

### 3.1 M1 구현 현황 — Riot API 실연동 완료 (개발 키 + 로컬 서버)

**실행 방법: 터미널 2개 — `npm run server` (API 서버 :5175) + `npm run dev` (프론트).**
개발 키는 `.env`의 `RIOT_API_KEY` (24시간마다 재발급, git 커밋 금지).

| 구현됨 | 위치 | 비고 |
|---|---|---|
| 로컬 API 서버 (Express) | `server/index.js` | 프론트는 Vite 프록시(`/api`)로 접근, Riot 키 은닉 |
| SQLite 저장소 | `server/db.js` → `server/data/archive.sqlite` | 출전 횟수 등 집계는 SQL로 계산, 클라우드 전환 시 이 모듈만 교체 |
| Riot 클라이언트 (axios) | `server/riot.js` | Account-V1 계정 검증, Match-V5 커스텀 게임(queue=0) 수집, 429/403 한국어 에러 |
| 토너먼트 코드 발급/조회 | `server/index.js` + `components/history/TournamentPanel.tsx` | Stub-V5로 프로바이더/토너먼트/코드 생성, 로비 이벤트 조회, 코드 기준 결과 수집(`by-tournament-code`) |
| (백업) 매치 검색 수집 | `POST /api/groups/:id/import` — UI 미노출 | 코드 없이 치른 과거 내전 소급용. minMembers 기본 1, 운영 시 6 |
| 원본 보관 | matches.raw_info / participants.raw | 기획 5장대로 gameCreation·tournamentCode만 제거 후 전체 JSON 저장 |
| 요약 통계 | `GET /api/groups/:id/stats` | 내전 수·최다 출전·최근 내전 — 서버 SQL 집계를 그대로 화면 출력 |
| 목록 UI | `components/history/MatchList.tsx` | 아코디언(행 클릭 → 팀 요약 드롭다운) + "자세한 기록" 모달(`MatchDetailModal.tsx`) |
| 검증 완료 | 실계정(Account-V1)·실제 내전 10판(Match-V5) 수집 확인 (2026-07-08) | 4장의 "queueId 0 조회 가능 여부" 선행 과제 **통과** |

## 4. 내전 수집 흐름 (M1 핵심) — **토너먼트 코드 기반 (확정)**

내전 수집은 토너먼트 코드만 사용한다 (매치 검색 방식은 UI에서 제거, 서버에 백업 라우트만 유지).

1. 그룹 화면에서 **토너먼트 코드 발급** (픽 타입·개수 선택 → Tournament API)
2. 내전 방장이 롤 클라이언트 로비에 코드 입력 → 참가자 자동 입장 *(정식 Tournament API부터 가능)*
3. 게임 종료 후 **"결과 가져오기"** → Match-V5 `by-tournament-code/{code}/ids` → 상세 저장
4. 정식 전환 시 결과 콜백(승리 팀 puuid 목록)을 서버가 자동 수신 → 수동 조회도 불필요해짐
5. 매치 참가자 puuid ↔ 그룹 참가자 자동 매칭 (등록 계정 기준)

> ⚠️ **Stub 한계 (현재 상태)**: 개발 키의 Tournament-Stub-V5는 발급/로비 이벤트/흐름 검증용 모의 API다.
> Stub 코드로는 실제 게임 로비가 생성되지 않고 경기 결과도 만들어지지 않는다.
> **정식 Tournament API 승인 후 서버 URL에서 `-stub`만 제거하면 실코드·실결과로 전환**된다 (server/riot.js).
>
> ✅ 참고 (2026-07-08 검증): 매치 검색 방식(`by-puuid?queue=0`)으로 실제 내전 10판 수집에 성공했었다.
> 토너먼트 코드가 기본이지만, 코드 없이 치른 과거 내전 소급용 백업 경로로 서버 라우트(`POST /import`)는 남겨둔다.

## 5. Riot API 데이터 채택표

> **방침(확정): 전부 저장한다.** 제외는 딱 두 개 — **로비 생성 시각(gameCreation), 토너먼트 코드(tournamentCode)**.
> 원본 JSON을 저장하되 제외 필드는 저장 전에 제거한다. 화면 노출 여부는 UI 단계에서 별도 선정.
> 표기 — ✅ 저장 · ❌ 제외

### 5.1 Account-V1 (`asia` 라우팅)

| 필드 | 설명 | 채택 |
|---|---|---|
| puuid | 전역 고유 ID (모든 조회의 키) | ✅ |
| gameName / tagLine | Riot ID (예: 이름#KR1) | ✅ |

### 5.2 League-V4 (`kr` 라우팅) — 티어 자동 배치용

| 필드 | 설명 | 채택 |
|---|---|---|
| queueType | RANKED_SOLO_5x5 / RANKED_FLEX_SR | ✅ |
| tier / rank / leaguePoints | 티어·세부단계·LP | ✅ |
| wins / losses | 랭크 승패 | ✅ |
| hotStreak, veteran, freshBlood, inactive | 연승 등 부가 플래그 | ✅ |

### 5.3 Match-V5 (`asia` 라우팅) — 매치 상세

#### 메타 정보 (info)

| 필드 | 설명 | 채택 |
|---|---|---|
| matchId, platformId | 매치 식별 | ✅ |
| gameStartTimestamp / gameEndTimestamp / gameDuration | 시간 정보 | ✅ |
| gameType / queueId | CUSTOM_GAME 여부, 큐 종류 (내전=queueId 0) | ✅ |
| gameVersion | 패치 버전 | ✅ |
| mapId, gameMode, gameName, endOfGameResult | 맵·모드 등 | ✅ |
| **tournamentCode** | 토너먼트 코드 | ❌ **제외** |
| **gameCreation** | 로비 생성 시각 | ❌ **제외** |

#### 참가자 (participants[]) — 10명 각각

| 그룹 | 필드 | 채택 |
|---|---|---|
| 식별 | puuid, riotIdGameName, riotIdTagline, teamId, participantId | ✅ |
| 챔피언 | championName, championId, champLevel, championTransform | ✅ |
| 포지션 | teamPosition, individualPosition, lane, role | ✅ |
| KDA | kills, deaths, assists | ✅ |
| 멀티킬 | doubleKills ~ pentaKills, largestKillingSpree, largestMultiKill, killingSprees, firstBloodKill/Assist | ✅ |
| 딜량 | totalDamageDealtToChampions | ✅ |
| 딜 상세 | 물리/마법/고정 분류, totalDamageTaken, damageSelfMitigated, totalHeal, 팀 실드/힐, timeCCingOthers, largestCriticalStrike | ✅ |
| 경제 | goldEarned, totalMinionsKilled + neutralMinionsKilled (CS) | ✅ |
| 경제 상세 | goldSpent, champExperience, bountyLevel, itemsPurchased, consumablesPurchased | ✅ |
| 시야 | visionScore | ✅ |
| 시야 상세 | wardsPlaced, wardsKilled, visionWardsBoughtInGame, detectorWardsPlaced | ✅ |
| 오브젝트 | turretKills, inhibitorKills, dragonKills, baronKills, objectivesStolen, damageDealtToObjectives/Turrets/Buildings, turretTakedowns, turretsLost | ✅ |
| 아이템 | item0~item6 (최종 빌드) | ✅ |
| 스펠/룬 | summoner1Id/2Id, perks(styles/selections/statPerks) | ✅ |
| 결과 | win, gameEndedInSurrender, gameEndedInEarlySurrender, teamEarlySurrendered | ✅ |
| 생존 | timePlayed, longestTimeSpentLiving, totalTimeSpentDead | ✅ |
| 핑 통계 | allInPings ~ visionClearedPings (13종) | ✅ |
| 스킬 사용 | spell1Casts ~ spell4Casts, summoner1Casts/2Casts | ✅ |
| challenges | kda, killParticipation, damagePerMinute, goldPerMinute, soloKills 등 100+ 파생 지표 | ✅ |

#### 팀 (teams[]) — 2팀 각각

| 필드 | 설명 | 채택 |
|---|---|---|
| teamId, win | 진영·승패 | ✅ |
| objectives.{baron,dragon,tower,inhibitor,riftHerald,horde,champion}.kills/first | 오브젝트 획득 수·선취 | ✅ |
| bans[] (championId, pickTurn) | 밴 목록 | ✅ |

#### Timeline (`matches/{id}/timeline`) — 별도 호출

| 데이터 | 설명 | 채택 |
|---|---|---|
| participantFrames (분 단위 골드/xp/cs/레벨/좌표) | 성장 그래프용 | ✅ |
| events (CHAMPION_KILL, ELITE_MONSTER_KILL, BUILDING_KILL, WARD_*, ITEM_*, SKILL_LEVEL_UP, DRAGON_SOUL_GIVEN, GAME_END 등) | 이벤트 로그 | ✅ |

> ⚠️ 용량 주의: 타임라인 원본은 경기당 1~3MB. Supabase 무료 500MB 기준 수백 경기면 한도 도달.
> 대응: JSON 압축 저장(Postgres jsonb는 자동 압축) + 한도 근접 시 오래된 타임라인부터 요약본(킬/오브젝트 이벤트만)으로 축소.

### 5.4 Tournament-V5 (M3, 별도 승인 필요)

| 데이터 | 설명 | 채택 |
|---|---|---|
| 토너먼트 코드 발급 (pickType, teamSize, allowedParticipants, metaData) | 로비 자동 생성 | ✅ (M3) |
| LobbyEvent (입장/퇴장/게임시작 타임스탬프) | 로비 이벤트 | ✅ (M3) |
| 결과 콜백 (winningTeam/losingTeam puuid, gameId, shortCode) | 종료 시 자동 결과 | ✅ (M3) |

### 5.5 기타

| API | 용도 | 채택 |
|---|---|---|
| Summoner-V4 | 프로필 아이콘, 소환사 레벨 | ✅ |
| Spectator-V5 | 진행 중 게임 실시간 조회 → **실시간 승패 확률 (M4)** | ✅ |
| Data Dragon / Community Dragon | 챔피언·아이템·룬 아이콘 (키 불필요, CDN) | ✅ |

## 6. 그룹 격리 + 롤 계정 등록 설계

### 6.1 격리 방식 — 로그인 없는 최소 구현

- 그룹 생성 시 **그룹 코드**(추측 불가능한 랜덤 문자열, 예: 8자 이상) 발급
- 코드를 아는 사람만 그 그룹의 데이터에 접근 가능 — 모든 API 요청에 코드를 담아 서버가 검증
- 브라우저는 참여한 그룹 코드를 localStorage에 저장 (재방문 시 자동 진입, 여러 그룹 참여 가능)
- A그룹 코드만 가진 사용자는 B그룹 데이터를 볼 수 없음 → 요구사항 충족

한계(수용함): 코드가 유출되면 그 그룹은 노출된다. 코드 재발급(로테이션) 기능으로 보완.
나중에 필요해지면 이 구조 위에 로그인(Supabase Auth)을 얹을 수 있게 테이블을 설계해 둔다.

### 6.2 롤 계정 등록 — 참가자 1명당 여러 계정

- 그룹 참가자(선수)는 본인 롤 계정(Riot ID)을 **여러 개** 등록 가능 (본계/부계)
- 등록 시 서버가 Account-V1로 puuid 조회·저장, 대표 계정 1개 지정(is_primary)
- 내전 자동 수집(4장) 시 등록된 모든 계정의 puuid로 매칭 → 부계로 참여해도 같은 사람으로 집계
- 티어 자동 배치(9장)는 대표 계정의 솔로랭크 기준 (설정으로 "최고 티어 계정 기준" 선택 가능)

### 6.3 데이터 모델

```
groups              (id, name, join_code UNIQUE, created_at, settings jsonb)
players             (id, group_id, display_name, default_tier)          -- 그룹 내 선수
player_riot_accounts(id, player_id, puuid UNIQUE, game_name, tag_line,
                     is_primary, solo_tier, solo_rank, solo_lp, refreshed_at)
matches             (id, group_id, riot_match_id, game_start, duration,
                     winning_side, raw_info jsonb)                      -- 원본 JSON (제외 필드 제거)
match_participants  (id, match_id, player_id NULL 허용, puuid, side, position,
                     champion, kills, deaths, assists, gold, cs, vision_score, raw jsonb)
match_timelines     (match_id, raw jsonb)                               -- 용량 주의 (5.3)
UNIQUE (group_id, riot_match_id)                                        -- 중복 수집 방지
```

- 검색용 핵심 컬럼(kills 등)만 정규 컬럼으로 뽑고 나머지는 raw jsonb에 전부 보관 → "다 저장, 빼는 방식" 실현
- match_participants.player_id가 NULL = 그룹 미등록 용병 (나중에 계정 등록하면 소급 연결)

## 7. 내전 기록 검색 설계

- 필터: **기간**(from~to), **참가자**(멀티 선택), 포지션, 승패, 챔피언
- 정렬: 최신순(기본) / 오래된순 · 페이지네이션 20건 (내전 기록 탭은 스크롤 허용)
- 인덱스: `matches(group_id, game_start)`, `match_participants(player_id)`, `match_participants(puuid)`
- 위치: 내전 기록 탭 목록 패널 상단 필터 바 (현재 골격에 자리 있음)

## 8. 인프라 설계 — 무료 + 수익화(광고) 허용

| 구성 | 선택 | 이유 |
|---|---|---|
| 호스팅 + API | **Cloudflare Pages + Pages Functions** | **무료 플랜에서 상업적 사용 명시 허용**, 정적 대역폭 무제한, Functions 10만 req/일 |
| DB | **Supabase 무료 티어** (Postgres 500MB) | jsonb 원본 저장에 적합, 무료 한도 넉넉 |
| 정적 데이터 | Data Dragon CDN | 챔피언 아이콘 등, 저장 불필요 |

- 현 Vercel 배포는 개발 중엔 유지 가능. **광고 수익이 발생하기 시작하면 Cloudflare Pages로 이전** (Vite 정적 빌드라 이전 비용 거의 없음 — 빌드 명령만 등록하면 됨)
- 차선책: Netlify 무료(월 100GB, 상업 허용), Firebase Hosting 무료(상업 허용, 전송량 빡빡함). GitHub Pages는 광고 중심 사이트에 부적합
- Riot API 키는 Pages Functions(서버) 환경변수로만 보관, 프론트 노출 금지
- Supabase 무료 티어 주의: 1주 미사용 시 일시정지 → 주기 핑 설정

### 8.1 배포 절차 (따라하기 체크리스트)

**1단계 — 지금 바로 (프론트만, Vercel 유지)**
1. `git add -A && git commit` → GitHub push → Vercel이 자동 배포
2. 이 상태에서 팀 빌더/가이드/개인정보처리방침/ads.txt는 정상 동작
3. ⚠️ 내전 기록 탭은 "로컬 API 서버 연결 불가" 안내가 뜸 (서버가 로컬 전용이므로)

**2단계 — 풀 배포 (Cloudflare Pages + D1, 무료·상업 허용)**
1. https://dash.cloudflare.com 가입 → Workers & Pages → Create → **Pages** → Connect to Git → 저장소 선택
2. 빌드 설정: Build command `npm run build`, Output directory `dist` → 첫 배포 (정적까지 동작)
3. CLI 준비: `npm i -D wrangler` → `npx wrangler login`
4. DB 생성: `npx wrangler d1 create naejeonpot-db` → 출력된 database_id 보관
5. 스키마 적용: server/db.js의 CREATE TABLE들을 schema.sql로 추출 후
   `npx wrangler d1 execute naejeonpot-db --remote --file=schema.sql`
   (D1은 SQLite 호환이라 스키마 그대로 사용 가능)
6. **서버 코드 이식**: `server/*.js`(Express)를 `functions/api/` (Pages Functions)로 포팅
   — 코딩 작업, 요청 시 진행. Express req/res → Functions Request/Response 변환이 전부이고
   비즈니스 로직(riot.js/assets.js)은 거의 그대로 재사용
7. Pages 프로젝트 설정 → Bindings에 D1(naejeonpot-db), 환경변수 `RIOT_API_KEY` 등록
8. 재배포 → 커스텀 도메인 연결(선택) → AdSense/Search Console에 새 도메인 등록
9. Vercel 쪽은 새 도메인으로 리다이렉트 설정 후 정리

**주의**: Riot 정식 키를 받으면 Cloudflare 환경변수만 갱신하면 된다. `.env`는 로컬 전용(커밋 금지).

## 9. 설정 (Settings)

| 설정 | 기본값 | 저장 위치 |
|---|---|---|
| 티어 자동 배치 (등록 계정의 솔로랭크로 상/중/하 자동 지정) | **켜짐** | 그룹 설정 (groups.settings) + 브라우저 localStorage 캐시 |
| 티어 구간 매핑 (예: 에메랄드+ = 상, 골드~플랫 = 중, 그 외 = 하) | 위 예시 | 그룹 설정 (그룹마다 수준이 다르므로 커스텀 가능) |
| 자동 배치 기준 계정 | 대표 계정 | 그룹 설정 (최고 티어 계정 기준 옵션) |
| 테마 (라이트/다크) | 다크 | localStorage |

- 설정 저장은 쿠키 대신 **localStorage** 사용 (서버로 전송할 필요가 없어 더 적합). 개인정보처리방침에 고지 완료.
- 티어 자동 배치가 꺼져 있으면 현재처럼 수동 드래그 배치만 동작.

## 10. Spectator 실시간 승패 확률 (M4, 장기)

- Spectator-V5 `active-games/by-summoner/{puuid}`: 진행 중 게임의 참가자·챔피언·룬·밴 목록 제공
- **주의: API는 승률을 주지 않는다.** 확률은 자체 계산 필요. 접근안:
  1. (초기) 그룹 내부 데이터 기반 — 참가자별 그룹 내전 승률 + 티어 점수 가중 평균 → 팀 승률 추정
  2. (확장) 챔피언 조합 통계(외부 공개 데이터) 가중치 추가
  3. (고급) 그룹 내전 누적 데이터로 로지스틱 회귀 등 간단 모델 학습
- 폴링 주기 60초 이상 (레이트 리밋 보호). 게임 감지 → 팀 빌더 화면에 "진행 중" 배지 + 확률 표시
- 사전 조건: 그룹 내전 데이터가 충분히 쌓인 뒤에 의미 있음 → 마지막 마일스톤

## 11. Riot 제품 신청 초안 (Personal API Key)

developer.riotgames.com → Register Product → Personal API Key. 아래 내용을 양식에 붙여넣는다.

- **Product Name**: `Naejeonpot`
- **Product URL**: 배포 URL (예: https://lol-teamtool.vercel.app — 도메인 확정 시 갱신)
- **Description**: 최종 문안은 대화 기록/아래 참조. 핵심 요소 — 무엇을 하는 서비스인지,
  사용하는 엔드포인트와 이유(ACCOUNT-V1 계정 검증, MATCH-V5 내전 결과, TOURNAMENT-V5 코드),
  예상 요청량(소규모), 키 보안(서버 환경변수), 광고(AdSense) 수익 모델 고지, 법적 고지문 게시.
- Tournament API는 Personal Key 승인 후 별도 신청.

## 12. AdSense 대응 트랙

- ✅ **개인정보처리방침** — `/privacy.html` (정적 HTML이라 크롤러가 바로 읽음), 앱 우하단 링크
- ✅ **사용법 가이드** — `/guide.html` (팀 빌더/내전 기록 사용법 + 팀 밸런싱 팁 + FAQ, 광고 유닛 1개 포함).
  사용자에게 실제로 보이는 페이지 — 앱 우하단 링크·방침 페이지 상호 링크로 연결
- 📋 콘텐츠 확장: 내전 운영 노하우, 패치별 내전 밸런스 노트 등 글 추가 (승인 심사에 유리)
- 광고 배치 현황: 앱 좌우 사이드바 2개(1200px 이상에서만 노출) + 가이드 페이지 본문 1개.
  빈 화면 단독 광고 없음 — 광고는 항상 실제 콘텐츠 옆에만 배치한다는 원칙 유지
