import type { GroupPlayer, MatchParticipant, MatchRecord, RiotAccount, TeamSide } from '../types';
import { POSITIONS } from '../constants';

/*
 * 실제 Riot API 호출은 로컬 API 서버(server/riot.js)가 담당한다 — 키 은닉 + CORS 회피.
 * 이 모듈의 모의(데모) 매치 생성기는 실제 Match-V5 응답과 같은 필드 구조 전체를 합성한다
 * — "상세정보 보기"에서 정식 수집 시 받게 될 전 지표를 미리 보고 취사선택할 수 있게.
 */

// 영문 챔피언 ID로 저장 (실데이터와 동일 형식) — 화면에서 한글로 변환된다
const DEMO_CHAMPIONS = [
    'Garen', 'Ahri', 'LeeSin', 'Lux', 'Jhin', 'Thresh', 'Yasuo', 'Orianna', 'Vi', 'Caitlyn',
    'Leona', 'Gragas', 'Syndra', 'Zed', 'Kaisa', 'Lulu', 'Sejuani', 'Aatrox', 'Ezreal', 'Nautilus',
];

// 실제 아이템 ID (Data Dragon 이미지가 존재하는 값들)
const LEGENDARY_ITEMS = [3031, 3153, 3089, 3157, 3065, 3068, 3135, 3036, 3072, 3026, 6653, 6655, 3742, 6672, 3078, 3161, 6692, 3814, 3748, 3143];
const BOOTS = [3006, 3020, 3047, 3111, 3158];
const TRINKETS = [3340, 3364, 3363];
const BAN_POOL = [266, 103, 84, 12, 32, 34, 1, 523, 22, 136, 268, 432, 53, 63, 201, 51, 164, 69, 31, 42];

// 포지션별 소환사 주문 (점멸 + α)
const SPELLS_BY_LANE: Record<string, [number, number]> = {
    탑: [4, 12], 정글: [4, 11], 미드: [4, 14], 원딜: [4, 7], 서포터: [4, 3],
};

const LANE_MAP: Record<string, { teamPosition: string; lane: string; role: string }> = {
    탑: { teamPosition: 'TOP', lane: 'TOP', role: 'SOLO' },
    정글: { teamPosition: 'JUNGLE', lane: 'JUNGLE', role: 'NONE' },
    미드: { teamPosition: 'MIDDLE', lane: 'MIDDLE', role: 'SOLO' },
    원딜: { teamPosition: 'BOTTOM', lane: 'BOTTOM', role: 'CARRY' },
    서포터: { teamPosition: 'UTILITY', lane: 'BOTTOM', role: 'SUPPORT' },
};

const rand = (min: number, max: number): number => min + Math.floor(Math.random() * (max - min + 1));
const chance = (p: number): boolean => Math.random() < p;
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

const newId = (): string =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const buildItems = (): number[] => {
    const pool = [...LEGENDARY_ITEMS].sort(() => Math.random() - 0.5);
    const count = rand(3, 5);
    const items = [pick(BOOTS), ...pool.slice(0, count)];
    while (items.length < 6) items.push(0);
    items.push(pick(TRINKETS)); // 7번째 슬롯 = 장신구
    return items;
};

/** Match-V5 participant DTO 전체를 합성한다 (핑·스킬 사용·challenges·룬 포함) */
const buildFullParticipantRaw = (args: {
    index: number;
    riotId: string;
    puuid: string;
    position: string;
    champion: string;
    win: boolean;
    durationSec: number;
    kills: number; deaths: number; assists: number;
    gold: number; cs: number; visionScore: number;
    teamKills: number;
}) => {
    const { index, position, champion, win, durationSec, kills, deaths, assists, gold, cs, visionScore, teamKills } = args;
    const [gameName, tagLine = ''] = args.riotId.split('#');
    const items = buildItems();
    const spells = SPELLS_BY_LANE[position];
    const lane = LANE_MAP[position];
    const champLevel = rand(12, 18);
    const damage = rand(9000, 42000);
    const damageTaken = rand(12000, 45000);
    const minutes = durationSec / 60;
    const doubles = rand(0, Math.min(3, kills));
    const triples = doubles > 0 && chance(0.4) ? rand(0, 1) : 0;
    const quadras = triples > 0 && chance(0.3) ? rand(0, 1) : 0;
    const pentas = quadras > 0 && chance(0.25) ? 1 : 0;
    const largestSpree = kills === 0 ? 0 : rand(1, Math.min(8, kills));
    const wardsPlaced = position === '서포터' ? rand(15, 45) : rand(4, 16);

    return {
        // 식별
        participantId: index + 1,
        puuid: args.puuid,
        riotIdGameName: gameName,
        riotIdTagline: tagLine,
        summonerName: gameName,
        summonerLevel: rand(30, 600),
        profileIcon: rand(1, 5000),
        teamId: index < 5 ? 100 : 200,
        // 챔피언 / 포지션
        championName: champion,
        championId: rand(1, 900),
        champLevel,
        champExperience: champLevel * rand(1100, 1400),
        championTransform: 0,
        teamPosition: lane.teamPosition,
        individualPosition: lane.teamPosition,
        lane: lane.lane,
        role: lane.role,
        // KDA / 킬 관련
        kills, deaths, assists,
        firstBloodKill: index === 0 && chance(0.2),
        firstBloodAssist: chance(0.1),
        firstTowerKill: chance(0.15),
        firstTowerAssist: chance(0.15),
        doubleKills: doubles, tripleKills: triples, quadraKills: quadras, pentaKills: pentas,
        killingSprees: kills > 1 ? rand(1, 3) : 0,
        largestKillingSpree: largestSpree,
        largestMultiKill: pentas ? 5 : quadras ? 4 : triples ? 3 : doubles ? 2 : Math.min(1, kills),
        unrealKills: 0,
        // 딜량
        totalDamageDealt: damage * rand(3, 5),
        totalDamageDealtToChampions: damage,
        physicalDamageDealtToChampions: Math.floor(damage * 0.5),
        magicDamageDealtToChampions: Math.floor(damage * 0.4),
        trueDamageDealtToChampions: Math.floor(damage * 0.1),
        totalDamageTaken: damageTaken,
        physicalDamageTaken: Math.floor(damageTaken * 0.55),
        magicDamageTaken: Math.floor(damageTaken * 0.35),
        trueDamageTaken: Math.floor(damageTaken * 0.1),
        damageSelfMitigated: rand(8000, 40000),
        largestCriticalStrike: rand(0, 2100),
        totalHeal: rand(1500, 18000),
        totalHealsOnTeammates: position === '서포터' ? rand(3000, 15000) : rand(0, 2000),
        totalDamageShieldedOnTeammates: position === '서포터' ? rand(1000, 9000) : 0,
        totalUnitsHealed: rand(1, 6),
        timeCCingOthers: rand(5, 60),
        totalTimeCCDealt: rand(50, 700),
        // 경제
        goldEarned: gold,
        goldSpent: Math.floor(gold * 0.9),
        totalMinionsKilled: Math.max(0, cs - rand(0, 40)),
        neutralMinionsKilled: rand(0, 40),
        itemsPurchased: rand(15, 35),
        consumablesPurchased: rand(0, 8),
        bountyLevel: rand(0, 3),
        // 시야
        visionScore,
        wardsPlaced,
        wardsKilled: rand(0, 12),
        visionWardsBoughtInGame: rand(0, 10),
        detectorWardsPlaced: rand(0, 8),
        sightWardsBoughtInGame: 0,
        // 오브젝트
        turretKills: rand(0, 3),
        turretTakedowns: rand(0, 5),
        turretsLost: rand(0, 8),
        inhibitorKills: rand(0, 1),
        inhibitorTakedowns: rand(0, 2),
        inhibitorsLost: rand(0, 2),
        dragonKills: position === '정글' ? rand(0, 3) : 0,
        baronKills: position === '정글' ? rand(0, 1) : 0,
        objectivesStolen: chance(0.05) ? 1 : 0,
        objectivesStolenAssists: 0,
        damageDealtToObjectives: rand(1000, 25000),
        damageDealtToTurrets: rand(500, 9000),
        damageDealtToBuildings: rand(500, 10000),
        // 아이템 / 스펠
        item0: items[0], item1: items[1], item2: items[2], item3: items[3],
        item4: items[4], item5: items[5], item6: items[6],
        summoner1Id: spells[0], summoner2Id: spells[1],
        summoner1Casts: rand(3, 10), summoner2Casts: rand(2, 8),
        spell1Casts: rand(40, 220), spell2Casts: rand(30, 160),
        spell3Casts: rand(20, 120), spell4Casts: rand(4, 30),
        // 생존 / 시간
        timePlayed: durationSec,
        longestTimeSpentLiving: rand(200, durationSec),
        totalTimeSpentDead: deaths * rand(15, 45),
        // 결과
        win,
        gameEndedInSurrender: false,
        gameEndedInEarlySurrender: false,
        teamEarlySurrendered: false,
        // 핑 (13종)
        allInPings: rand(0, 5), assistMePings: rand(0, 8), basicPings: rand(0, 30),
        commandPings: rand(0, 12), dangerPings: rand(0, 6), enemyMissingPings: rand(0, 15),
        enemyVisionPings: rand(0, 8), getBackPings: rand(0, 10), holdPings: rand(0, 3),
        needVisionPings: rand(0, 6), onMyWayPings: rand(0, 20), pushPings: rand(0, 5),
        visionClearedPings: rand(0, 3),
        // 룬
        perks: {
            statPerks: { defense: 5002, flex: 5008, offense: 5005 },
            styles: [
                {
                    description: 'primaryStyle',
                    style: pick([8000, 8100, 8200, 8300, 8400]),
                    selections: [
                        { perk: 8005, var1: rand(100, 2000), var2: 0, var3: 0 },
                        { perk: 9111, var1: rand(100, 900), var2: rand(0, 300), var3: 0 },
                        { perk: 9104, var1: rand(10, 30), var2: rand(0, 40), var3: 0 },
                        { perk: 8014, var1: rand(100, 800), var2: 0, var3: 0 },
                    ],
                },
                {
                    description: 'subStyle',
                    style: pick([8000, 8100, 8200, 8300, 8400]),
                    selections: [
                        { perk: 8304, var1: rand(0, 10), var2: 0, var3: 0 },
                        { perk: 8347, var1: 0, var2: 0, var3: 0 },
                    ],
                },
            ],
        },
        // 파생 지표 (challenges — 실데이터는 100+개, 대표 지표 합성)
        challenges: {
            kda: deaths === 0 ? kills + assists : Number(((kills + assists) / deaths).toFixed(2)),
            killParticipation: teamKills === 0 ? 0 : Number(((kills + assists) / teamKills).toFixed(2)),
            damagePerMinute: Number((damage / minutes).toFixed(1)),
            goldPerMinute: Number((gold / minutes).toFixed(1)),
            visionScorePerMinute: Number((visionScore / minutes).toFixed(2)),
            gameLength: durationSec,
            soloKills: rand(0, Math.min(4, kills)),
            skillshotsDodged: rand(5, 60),
            skillshotsHit: rand(5, 70),
            enemyChampionImmobilizations: rand(0, 40),
            laneMinionsFirst10Minutes: position === '정글' || position === '서포터' ? rand(0, 20) : rand(50, 90),
            jungleCsBefore10Minutes: position === '정글' ? rand(40, 70) : 0,
            controlWardsPlaced: rand(0, 8),
            wardTakedowns: rand(0, 10),
            visionScoreAdvantageLaneOpponent: Number((Math.random() * 2 - 1).toFixed(2)),
            maxLevelLeadLaneOpponent: rand(0, 3),
            maxCsAdvantageOnLaneOpponent: rand(0, 60),
            turretPlatesTaken: rand(0, 5),
            epicMonsterSteals: 0,
            dragonTakedowns: rand(0, 4),
            baronTakedowns: rand(0, 2),
            teamDamagePercentage: Number((damage / (damage * 5) * rand(80, 160) / 100).toFixed(2)),
            damageTakenOnTeamPercentage: Number((Math.random() * 0.35).toFixed(2)),
            killAfterHiddenWithAlly: rand(0, 3),
            multikills: doubles + triples + quadras + pentas,
            outnumberedKills: rand(0, 2),
            perfectGame: 0,
            gameEndedInSurrender: false,
        },
    };
};

/** 매치 레벨 원본(info) 합성 — 팀 밴/오브젝트 포함 */
const buildRawInfo = (args: {
    gameStart: number;
    durationSec: number;
    winningSide: TeamSide;
    blueKills: number;
    redKills: number;
}) => {
    const bans = [...BAN_POOL].sort(() => Math.random() - 0.5);
    const mkTeam = (teamId: number, win: boolean, kills: number, banOffset: number) => ({
        teamId,
        win,
        bans: Array.from({ length: 5 }, (_, i) => ({ championId: bans[banOffset + i], pickTurn: banOffset + i + 1 })),
        objectives: {
            baron: { first: win && chance(0.6), kills: win ? rand(0, 2) : rand(0, 1) },
            champion: { first: chance(0.5), kills },
            dragon: { first: chance(0.5), kills: win ? rand(1, 4) : rand(0, 2) },
            horde: { first: chance(0.5), kills: rand(0, 6) },
            inhibitor: { first: win, kills: win ? rand(1, 3) : 0 },
            riftHerald: { first: chance(0.5), kills: rand(0, 1) },
            tower: { first: chance(0.5), kills: win ? rand(6, 11) : rand(1, 5) },
        },
    });
    return {
        gameId: rand(7000000000, 7999999999),
        gameMode: 'CLASSIC',
        gameType: 'CUSTOM_GAME',
        gameName: 'naejeonpot-demo',
        gameVersion: '16.13.700.1234',
        mapId: 11,
        platformId: 'KR',
        queueId: 0,
        endOfGameResult: 'GameComplete',
        gameStartTimestamp: args.gameStart,
        gameEndTimestamp: args.gameStart + args.durationSec * 1000,
        gameDuration: args.durationSec,
        teams: [
            mkTeam(100, args.winningSide === 'blue', args.blueKills, 0),
            mkTeam(200, args.winningSide === 'red', args.redKills, 5),
        ],
    };
};

/** UI 확인용 모의 내전 생성 — 등록 참가자를 우선 배치하고 모자라면 용병으로 채운다. */
export const generateDemoMatch = (
    groupId: string,
    players: GroupPlayer[],
    accounts: RiotAccount[],
    opts?: { riotMatchId?: string },
): MatchRecord => {
    const entries: { playerId: string | null; riotId: string; puuid: string }[] = players.map(p => {
        const acc = accounts.find(a => a.playerId === p.id && a.isPrimary)
            ?? accounts.find(a => a.playerId === p.id);
        return {
            playerId: p.id,
            riotId: acc ? `${acc.gameName}#${acc.tagLine}` : p.displayName,
            puuid: acc?.puuid ?? `unregistered:${p.id}`,
        };
    });

    for (let i = entries.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [entries[i], entries[j]] = [entries[j], entries[i]];
    }
    while (entries.length < 10) {
        const n = entries.length + 1;
        entries.push({ playerId: null, riotId: `용병${n}`, puuid: `guest:${newId()}` });
    }

    const winningSide: TeamSide = Math.random() < 0.5 ? 'blue' : 'red';
    const durationSec = rand(1300, 2500);
    const gameStart = Date.now() - rand(0, 30) * 86400000 - rand(0, 86399) * 1000;
    const champs = [...DEMO_CHAMPIONS].sort(() => Math.random() - 0.5);

    // 기본 지표를 먼저 뽑고 (컬럼 값과 raw 값 일치), 팀 킬 합산 후 raw 합성
    const base = entries.slice(0, 10).map((entry, i) => ({
        entry,
        side: (i < 5 ? 'blue' : 'red') as TeamSide,
        position: POSITIONS[i % 5],
        champion: champs[i],
        kills: rand(0, 14),
        deaths: rand(0, 11),
        assists: rand(0, 20),
        gold: rand(7000, 16000),
        cs: rand(30, 280),
        visionScore: rand(5, 90),
    }));
    const killsOf = (side: TeamSide) => base.filter(b => b.side === side).reduce((s, b) => s + b.kills, 0);
    const blueKills = killsOf('blue');
    const redKills = killsOf('red');

    const participants: MatchParticipant[] = base.map((b, i) => ({
        ...b.entry,
        side: b.side,
        position: b.position,
        champion: b.champion,
        kills: b.kills,
        deaths: b.deaths,
        assists: b.assists,
        gold: b.gold,
        cs: b.cs,
        visionScore: b.visionScore,
        raw: JSON.stringify(buildFullParticipantRaw({
            index: i,
            riotId: b.entry.riotId,
            puuid: b.entry.puuid,
            position: b.position,
            champion: b.champion,
            win: b.side === winningSide,
            durationSec,
            kills: b.kills,
            deaths: b.deaths,
            assists: b.assists,
            gold: b.gold,
            cs: b.cs,
            visionScore: b.visionScore,
            teamKills: b.side === 'blue' ? blueKills : redKills,
        })),
    }));

    return {
        id: newId(),
        groupId,
        riotMatchId: opts?.riotMatchId ?? `DEMO_${Date.now()}_${rand(100, 999)}`,
        source: 'demo',
        gameStart,
        durationSec,
        winningSide,
        participants,
        rawInfo: JSON.stringify(buildRawInfo({ gameStart, durationSec, winningSide, blueKills, redKills })),
    };
};
