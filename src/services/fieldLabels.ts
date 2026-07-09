/*
 * Riot Match-V5 필드명 → 한글 라벨 사전 (상세정보 화면용).
 * 언어 토글: 'ko'면 사전 매핑(없으면 원문), 'en'이면 원문 필드명 그대로.
 * 데이터는 하나도 빼지 않는다 — 사전에 없는 필드도 원문으로 전부 표시된다.
 */

export type DetailLang = 'ko' | 'en';

export const FIELD_LABELS_KO: Record<string, string> = {
    /* --- 매치 정보 (info) --- */
    gameId: '게임 ID',
    gameMode: '게임 모드',
    gameType: '게임 종류',
    gameName: '게임 이름',
    gameVersion: '패치 버전',
    mapId: '맵 ID',
    platformId: '서버 지역',
    queueId: '큐 ID',
    endOfGameResult: '종료 방식',
    gameStartTimestamp: '게임 시작 시각',
    gameEndTimestamp: '게임 종료 시각',
    gameDuration: '게임 시간(초)',
    gameCreation: '로비 생성 시각',
    tournamentCode: '토너먼트 코드',

    /* --- 식별 --- */
    participantId: '참가자 번호',
    puuid: '계정 고유 ID',
    riotIdGameName: '라이엇 ID (이름)',
    riotIdTagline: '라이엇 ID (태그)',
    summonerName: '소환사명',
    summonerId: '소환사 ID',
    summonerLevel: '소환사 레벨',
    profileIcon: '프로필 아이콘 ID',
    teamId: '팀 (100=블루, 200=레드)',

    /* --- 챔피언 / 포지션 --- */
    championName: '챔피언',
    championId: '챔피언 ID',
    champLevel: '챔피언 레벨',
    champExperience: '챔피언 경험치',
    championTransform: '챔피언 변신 (케인)',
    teamPosition: '팀 포지션',
    individualPosition: '개인 포지션',
    lane: '라인',
    role: '역할',

    /* --- 전투 (킬/데스) --- */
    kills: '킬',
    deaths: '데스',
    assists: '어시스트',
    firstBloodKill: '퍼스트 블러드',
    firstBloodAssist: '퍼스트 블러드 어시스트',
    firstTowerKill: '첫 타워 파괴',
    firstTowerAssist: '첫 타워 어시스트',
    doubleKills: '더블킬',
    tripleKills: '트리플킬',
    quadraKills: '쿼드라킬',
    pentaKills: '펜타킬',
    unrealKills: '언리얼 킬',
    killingSprees: '연속 킬 횟수',
    largestKillingSpree: '최다 연속 킬',
    largestMultiKill: '최대 멀티킬',

    /* --- 피해량 --- */
    totalDamageDealt: '총 피해량 (전체)',
    totalDamageDealtToChampions: '챔피언에게 가한 피해',
    physicalDamageDealt: '물리 피해 (전체)',
    physicalDamageDealtToChampions: '물리 피해 (챔피언)',
    magicDamageDealt: '마법 피해 (전체)',
    magicDamageDealtToChampions: '마법 피해 (챔피언)',
    trueDamageDealt: '고정 피해 (전체)',
    trueDamageDealtToChampions: '고정 피해 (챔피언)',
    largestCriticalStrike: '최대 치명타',

    /* --- 생존 / 방어 --- */
    totalDamageTaken: '받은 피해',
    physicalDamageTaken: '받은 물리 피해',
    magicDamageTaken: '받은 마법 피해',
    trueDamageTaken: '받은 고정 피해',
    damageSelfMitigated: '경감한 피해',
    totalHeal: '총 회복량',
    totalHealsOnTeammates: '아군 회복량',
    totalDamageShieldedOnTeammates: '아군에게 씌운 보호막',
    totalUnitsHealed: '회복시킨 유닛 수',
    timeCCingOthers: '적 CC 시간(초)',
    totalTimeCCDealt: '총 CC 시간',
    longestTimeSpentLiving: '최장 생존 시간(초)',
    totalTimeSpentDead: '죽어 있던 시간(초)',
    timePlayed: '플레이 시간(초)',

    /* --- 경제 --- */
    goldEarned: '획득 골드',
    goldSpent: '사용 골드',
    totalMinionsKilled: '미니언 처치 (CS)',
    neutralMinionsKilled: '정글 몬스터 처치',
    itemsPurchased: '아이템 구매 횟수',
    consumablesPurchased: '소모품 구매 횟수',
    bountyLevel: '현상금 단계',

    /* --- 시야 --- */
    visionScore: '시야 점수',
    wardsPlaced: '와드 설치',
    wardsKilled: '와드 제거',
    visionWardsBoughtInGame: '제어 와드 구매',
    detectorWardsPlaced: '제어 와드 설치',
    sightWardsBoughtInGame: '투명 와드 구매',

    /* --- 오브젝트 --- */
    turretKills: '타워 파괴',
    turretTakedowns: '타워 처치 관여',
    turretsLost: '잃은 타워',
    inhibitorKills: '억제기 파괴',
    inhibitorTakedowns: '억제기 관여',
    inhibitorsLost: '잃은 억제기',
    dragonKills: '드래곤 처치',
    baronKills: '바론 처치',
    objectivesStolen: '오브젝트 스틸',
    objectivesStolenAssists: '스틸 어시스트',
    damageDealtToObjectives: '오브젝트 피해량',
    damageDealtToTurrets: '타워 피해량',
    damageDealtToBuildings: '건물 피해량',

    /* --- 아이템 / 소환사 주문 --- */
    item0: '아이템 1', item1: '아이템 2', item2: '아이템 3',
    item3: '아이템 4', item4: '아이템 5', item5: '아이템 6', item6: '장신구',
    summoner1Id: '소환사 주문 1 (ID)',
    summoner2Id: '소환사 주문 2 (ID)',
    summoner1Casts: '주문 1 사용 횟수',
    summoner2Casts: '주문 2 사용 횟수',
    spell1Casts: 'Q 사용 횟수',
    spell2Casts: 'W 사용 횟수',
    spell3Casts: 'E 사용 횟수',
    spell4Casts: 'R 사용 횟수',

    /* --- 결과 --- */
    win: '승리',
    gameEndedInSurrender: '항복으로 종료',
    gameEndedInEarlySurrender: '조기 항복으로 종료',
    teamEarlySurrendered: '팀 조기 항복',

    /* --- 핑 --- */
    allInPings: '총공격 핑',
    assistMePings: '지원 요청 핑',
    basicPings: '일반 핑',
    commandPings: '명령 핑',
    dangerPings: '위험 핑',
    enemyMissingPings: '적 실종(미아) 핑',
    enemyVisionPings: '적 시야 핑',
    getBackPings: '후퇴 핑',
    holdPings: '대기 핑',
    needVisionPings: '시야 필요 핑',
    onMyWayPings: '이동 중 핑',
    pushPings: '푸시 핑',
    visionClearedPings: '시야 제거 핑',
    retreatPings: '후퇴 핑',

    /* --- 룬 --- */
    perks: '룬',
    statPerks: '스탯 룬',
    styles: '룬 스타일',
    selections: '선택한 룬',
    defense: '방어',
    flex: '유연',
    offense: '공격',
    style: '스타일 ID',
    perk: '룬 ID',
    description: '구분',
    var1: '값 1', var2: '값 2', var3: '값 3',
    primaryStyle: '주 룬',
    subStyle: '보조 룬',

    /* --- 파생 지표 (challenges) --- */
    challenges: '파생 지표',
    kda: 'KDA',
    killParticipation: '킬 관여율',
    damagePerMinute: '분당 피해량',
    goldPerMinute: '분당 골드',
    visionScorePerMinute: '분당 시야 점수',
    gameLength: '게임 길이(초)',
    soloKills: '솔로킬',
    skillshotsDodged: '스킬샷 회피',
    skillshotsHit: '스킬샷 적중',
    enemyChampionImmobilizations: '적 이동 불가 적용',
    laneMinionsFirst10Minutes: '10분 라인 CS',
    jungleCsBefore10Minutes: '10분 정글 CS',
    controlWardsPlaced: '제어 와드 설치',
    wardTakedowns: '와드 처치',
    visionScoreAdvantageLaneOpponent: '상대 대비 시야 우위',
    maxLevelLeadLaneOpponent: '최대 레벨 격차',
    maxCsAdvantageOnLaneOpponent: '최대 CS 격차',
    turretPlatesTaken: '포탑 방패 획득',
    epicMonsterSteals: '에픽 몬스터 스틸',
    dragonTakedowns: '드래곤 관여',
    baronTakedowns: '바론 관여',
    teamDamagePercentage: '팀 내 딜 비중',
    damageTakenOnTeamPercentage: '팀 내 탱킹 비중',
    killAfterHiddenWithAlly: '매복 킬',
    multikills: '멀티킬 합계',
    outnumberedKills: '수적 열세 킬',
    perfectGame: '퍼펙트 게임',

    /* --- 팀 --- */
    teams: '팀',
    bans: '밴',
    pickTurn: '밴 순서',
    objectives: '오브젝트',
    baron: '바론',
    champion: '챔피언 킬',
    dragon: '드래곤',
    horde: '공허 유충',
    inhibitor: '억제기',
    riftHerald: '협곡의 전령',
    tower: '타워',
    first: '선취',

    /* --- 로비 이벤트 --- */
    PracticeGameCreatedEvent: '내전 로비 생성',
    ChampSelectStartedEvent: '챔피언 선택 시작',
    GameAllocationStartedEvent: '게임 서버 할당',
    GameStartedEvent: '게임 시작',

    /* --- 계정 / 소환사 (Account-V1, Summoner-V4) ---
     * gameName·summonerLevel은 위(매치 정보/식별)에 이미 정의됨 */
    tagLine: '태그',
    isPrimary: '대표 계정',
    id: '소환사 ID (암호화)',
    accountId: '계정 ID (암호화)',
    profileIconId: '프로필 아이콘 ID',
    revisionDate: '최근 갱신 시각',

    /* --- 랭크 (League-V4) --- */
    leagueId: '리그 ID',
    queueType: '큐 종류',
    tier: '티어',
    rank: '세부 랭크',
    leaguePoints: 'LP',
    wins: '승',
    losses: '패',
    hotStreak: '연승 중',
    veteran: '베테랑 (100판+)',
    freshBlood: '신규 진입',
    inactive: '비활성',
    miniSeries: '승급전',
    target: '승급 목표 승수',
    progress: '승급전 진행 (W승 L패 N미진행)',

    /* --- 챔피언 숙련도 (Champion-Mastery-V4) --- */
    championLevel: '숙련도 레벨',
    championPoints: '숙련도 점수',
    lastPlayTime: '마지막 플레이',
    championPointsSinceLastLevel: '현재 레벨에서 얻은 점수',
    championPointsUntilNextLevel: '다음 레벨까지 점수',
    chestGranted: '상자 획득',
    tokensEarned: '토큰 획득',
    markRequiredForNextLevel: '다음 레벨 필요 마크',
    championSeasonMilestone: '시즌 마일스톤',
    milestoneGrades: '마일스톤 등급',
    nextSeasonMilestone: '다음 마일스톤',
    requireGradeCounts: '필요 등급 수',
    rewardMarks: '보상 마크',
    bonus: '보너스',
    totalGamesRequires: '필요 판수',
    rewardConfig: '보상 설정',
    maximumReward: '최대 보상',
};

/** 참가자 지표 카테고리 — 여기 없는 필드는 자동으로 "기타"에 들어간다 (누락 없음) */
export const PARTICIPANT_CATEGORIES: { ko: string; en: string; keys: string[] }[] = [
    {
        ko: '기본 정보', en: 'Identity',
        keys: ['participantId', 'riotIdGameName', 'riotIdTagline', 'summonerName', 'summonerLevel', 'profileIcon', 'puuid', 'summonerId', 'teamId', 'championName', 'championId', 'champLevel', 'champExperience', 'championTransform', 'teamPosition', 'individualPosition', 'lane', 'role'],
    },
    {
        ko: '전투', en: 'Combat',
        keys: ['kills', 'deaths', 'assists', 'firstBloodKill', 'firstBloodAssist', 'firstTowerKill', 'firstTowerAssist', 'doubleKills', 'tripleKills', 'quadraKills', 'pentaKills', 'unrealKills', 'killingSprees', 'largestKillingSpree', 'largestMultiKill'],
    },
    {
        ko: '피해량', en: 'Damage',
        keys: ['totalDamageDealtToChampions', 'physicalDamageDealtToChampions', 'magicDamageDealtToChampions', 'trueDamageDealtToChampions', 'totalDamageDealt', 'physicalDamageDealt', 'magicDamageDealt', 'trueDamageDealt', 'largestCriticalStrike'],
    },
    {
        ko: '생존 / 방어', en: 'Defense',
        keys: ['totalDamageTaken', 'physicalDamageTaken', 'magicDamageTaken', 'trueDamageTaken', 'damageSelfMitigated', 'totalHeal', 'totalHealsOnTeammates', 'totalDamageShieldedOnTeammates', 'totalUnitsHealed', 'timeCCingOthers', 'totalTimeCCDealt', 'timePlayed', 'longestTimeSpentLiving', 'totalTimeSpentDead'],
    },
    {
        ko: '경제', en: 'Economy',
        keys: ['goldEarned', 'goldSpent', 'totalMinionsKilled', 'neutralMinionsKilled', 'itemsPurchased', 'consumablesPurchased', 'bountyLevel'],
    },
    {
        ko: '시야', en: 'Vision',
        keys: ['visionScore', 'wardsPlaced', 'wardsKilled', 'visionWardsBoughtInGame', 'detectorWardsPlaced', 'sightWardsBoughtInGame'],
    },
    {
        ko: '오브젝트', en: 'Objectives',
        keys: ['turretKills', 'turretTakedowns', 'turretsLost', 'inhibitorKills', 'inhibitorTakedowns', 'inhibitorsLost', 'dragonKills', 'baronKills', 'objectivesStolen', 'objectivesStolenAssists', 'damageDealtToObjectives', 'damageDealtToTurrets', 'damageDealtToBuildings'],
    },
    {
        ko: '아이템 / 소환사 주문', en: 'Items & Spells',
        keys: ['item0', 'item1', 'item2', 'item3', 'item4', 'item5', 'item6', 'summoner1Id', 'summoner2Id', 'summoner1Casts', 'summoner2Casts', 'spell1Casts', 'spell2Casts', 'spell3Casts', 'spell4Casts'],
    },
    {
        ko: '핑', en: 'Pings',
        keys: ['allInPings', 'assistMePings', 'basicPings', 'commandPings', 'dangerPings', 'enemyMissingPings', 'enemyVisionPings', 'getBackPings', 'holdPings', 'needVisionPings', 'onMyWayPings', 'pushPings', 'visionClearedPings', 'retreatPings'],
    },
    {
        ko: '결과', en: 'Result',
        keys: ['win', 'gameEndedInSurrender', 'gameEndedInEarlySurrender', 'teamEarlySurrendered'],
    },
];

export const fieldLabel = (key: string, lang: DetailLang): string =>
    lang === 'ko' ? FIELD_LABELS_KO[key] ?? key : key;

const TIMESTAMP_KEYS = new Set(['gameStartTimestamp', 'gameEndTimestamp', 'gameCreation', 'revisionDate', 'lastPlayTime']);

/** 자주 나오는 열거형 값의 한글 표기 (한국어 모드에서만 적용) */
export const VALUE_LABELS_KO: Record<string, string> = {
    RANKED_SOLO_5x5: '솔로랭크',
    RANKED_FLEX_SR: '자유랭크',
    CHERRY: '아레나',
    CHALLENGER: '챌린저',
    GRANDMASTER: '그랜드마스터',
    MASTER: '마스터',
    DIAMOND: '다이아몬드',
    EMERALD: '에메랄드',
    PLATINUM: '플래티넘',
    GOLD: '골드',
    SILVER: '실버',
    BRONZE: '브론즈',
    IRON: '아이언',
};

export const formatFieldValue = (key: string, value: unknown, lang: DetailLang): string => {
    if (value === null || value === undefined || value === '') return '-';
    if (typeof value === 'boolean') return lang === 'ko' ? (value ? '예' : '아니오') : String(value);
    if (typeof value === 'number' && TIMESTAMP_KEYS.has(key) && value > 1000000000000) {
        return new Date(value).toLocaleString(lang === 'ko' ? 'ko-KR' : 'en-US');
    }
    if (typeof value === 'string' && lang === 'ko' && VALUE_LABELS_KO[value]) {
        return VALUE_LABELS_KO[value];
    }
    return String(value);
};
