/*
 * 포인트 경제 규칙 — 서버가 단일 권위로 판정한다.
 * 확률이 걸린 행동(도박·보물찾기)은 클라이언트를 신뢰하지 않고 여기서 결과를 만든다.
 */

/** 한국 시간 기준 날짜 문자열 (하루 1회 제한의 기준) */
export const kstDay = (now = Date.now()) =>
    new Date(now + 9 * 3600 * 1000).toISOString().slice(0, 10);

/* --- 적립 규칙 --- */

export const CHECKIN_BASE = 100;      // 출석 기본
export const CHECKIN_STREAK_BONUS = 20; // 연속 출석 보너스(일당, 최대 7일)
export const WIN_REWARD = 150;        // 내전 승리
export const LOSE_REWARD = 50;        // 내전 패배(참가 보상)
export const TREASURE_REWARD = 300;   // 1px 보물찾기

/* --- 도박 --- */

export const GAMBLE_MIN = 10;
export const GAMBLE_MAX = 100000;

/** 슬롯 릴 심볼 (텍스트 심볼 — 세 개가 모이면 대박) */
export const SLOT_SYMBOLS = ['검', '룬', '별', '왕관', '포로'];

/**
 * 도박 판정. 기대값을 100% 미만으로 두어 포인트가 무한히 불어나지 않게 한다.
 *  - coin(동전 던지기): 승률 50%, 1.95배 → 기대값 97.5%
 *  - dice(주사위): 1/6 확률로 5.5배 → 91.7%
 *  - roulette(룰렛): 빨강/검정 18/38 확률로 1.95배 → 92.4% · 초록 2/38 확률로 17배 → 89.5%
 *  - smite(강타 싸움): 30% 확률로 3.1배 → 93%
 *  - penta(펜타킬 도전): 2% 확률로 45배 → 90%
 *  - slot(슬롯): 왕관 잭팟 30배 · 트리플 8배 · 페어 0.8배 환급 → 약 88%
 */
export const playGamble = (game, amount, pick, rand = Math.random) => {
    if (game === 'coin') {
        const side = rand() < 0.5 ? 'front' : 'back';
        const won = side === pick;
        return { won, result: side, payout: won ? Math.floor(amount * 1.95) : 0 };
    }
    if (game === 'dice') {
        const face = 1 + Math.floor(rand() * 6);
        const won = Number(pick) === face;
        return { won, result: String(face), payout: won ? Math.floor(amount * 5.5) : 0 };
    }
    if (game === 'roulette') {
        if (!['red', 'black', 'green'].includes(pick)) return null;
        // 38칸 유럽+아메리칸 혼합: 빨강 18, 검정 18, 초록 2
        const roll = Math.floor(rand() * 38);
        const color = roll < 18 ? 'red' : roll < 36 ? 'black' : 'green';
        const won = color === pick;
        const mult = pick === 'green' ? 17 : 1.95;
        return { won, result: color, payout: won ? Math.floor(amount * mult) : 0 };
    }
    if (game === 'smite') {
        /*
         * 강타 싸움 — 타이밍 게임. 클라이언트가 보낸 정확도(0~1)가 승률을 좌우한다.
         * 정확도를 조작해도 최대 승률 50% × 배당 1.85배 = 기대값 92.5%라 이득을 볼 수 없다.
         */
        const acc = Math.max(0, Math.min(1, Number(pick) || 0));
        const chance = 0.18 + 0.32 * acc;
        const won = rand() < chance;
        return { won, result: won ? 'steal' : 'lost', payout: won ? Math.floor(amount * 1.85) : 0, chance };
    }
    if (game === 'penta') {
        // 펜타킬 도전 — 실패 시 몇 킬에서 끊겼는지 알려준다 (쿼드라의 한이 제일 크다)
        const won = rand() < 0.02;
        const kills = won ? 5 : Math.floor(rand() * 5); // 0~4킬에서 사망
        return { won, result: String(kills), payout: won ? Math.floor(amount * 45) : 0 };
    }
    if (game === 'slot') {
        const reels = [0, 1, 2].map(() => SLOT_SYMBOLS[Math.floor(rand() * SLOT_SYMBOLS.length)]);
        const [a, b, c] = reels;
        let mult = 0;
        if (a === b && b === c) mult = a === '왕관' ? 30 : 8;           // 트리플 (왕관은 잭팟)
        else if (a === b || b === c || a === c) mult = 0.8;             // 페어는 일부 환급
        const payout = Math.floor(amount * mult);
        return { won: mult >= 1, result: reels.join('·'), payout };
    }
    return null;
};

/* --- 1px 보물찾기 --- */

/**
 * 날짜+그룹으로 정해지는 하루치 보물 좌표(0~1 비율).
 * 같은 그룹 사람은 같은 위치를 보고, 매일 자정(KST)에 바뀐다.
 */
export const treasureSpot = (groupId, day = kstDay()) => {
    let h = 2166136261;
    const seed = `${groupId}:${day}`;
    for (let i = 0; i < seed.length; i += 1) {
        h ^= seed.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    const a = (h >>> 0) / 4294967295;
    const b = (Math.imul(h ^ 0x9e3779b9, 2654435761) >>> 0) / 4294967295;
    // 화면 가장자리는 피해서 배치
    return { x: 0.08 + a * 0.84, y: 0.12 + b * 0.76 };
};

/* --- 상점 (칭호·이름표 테두리) --- */

export const SHOP_ITEMS = [
    /* 칭호 — 싼 것부터 플렉스용까지 */
    { id: 'title_rookie', kind: 'title', name: '새싹', price: 300, desc: '이제 막 내전에 발을 들인 사람' },
    { id: 'title_chat', kind: 'title', name: '채팅 요정', price: 450, desc: '타자 속도만큼은 챌린저' },
    { id: 'title_ff15', kind: 'title', name: '15분의 사나이', price: 500, desc: 'GG는 빠를수록 아름답다' },
    { id: 'title_dodge', kind: 'title', name: '닷지 마스터', price: 550, desc: '픽창에서 이미 패배를 읽는다' },
    { id: 'title_bush', kind: 'title', name: '부쉬의 지배자', price: 600, desc: '그 부쉬엔 항상 내가 있다' },
    { id: 'title_int', kind: 'title', name: '돌격대장', price: 600, desc: '일단 들어가고 생각한다' },
    { id: 'title_troll', kind: 'title', name: '전략적 다이브', price: 650, desc: '던진 게 아니라 계산된 플레이' },
    { id: 'title_flash', kind: 'title', name: '점멸이 없어요', price: 700, desc: '5분 전에 뺐는데 또 없음' },
    { id: 'title_ward', kind: 'title', name: '와드의 화신', price: 700, desc: '핑와는 사치가 아니라 교양' },
    { id: 'title_baron', kind: 'title', name: '바론 앞 미아', price: 750, desc: '한타는 시작됐는데 나는 어디에' },
    { id: 'title_mid_diff', kind: 'title', name: '미드차이', price: 800, desc: '이기면 내 덕, 지면 미드 탓' },
    { id: 'title_1cs', kind: 'title', name: '막타 요정', price: 800, desc: 'CS 하나에 영혼을 건다' },
    { id: 'title_lantern', kind: 'title', name: '랜턴 좀 눌러', price: 900, desc: '눌렀는데 안 눌린 건 랜턴 탓' },
    { id: 'title_first_blood', kind: 'title', name: '퍼블 헌터', price: 950, desc: '첫 피는 언제나 달콤하다' },
    { id: 'title_smite', kind: 'title', name: '강타 도둑', price: 1000, desc: '내 바론은 아니었지만 이제 내 것' },
    { id: 'title_scaling', kind: 'title', name: '후반캐리', price: 1000, desc: '3코어만 뜨면 다른 게임이 시작된다' },
    { id: 'title_support_main', kind: 'title', name: '서폿은 내 운명', price: 1100, desc: '시야 점수가 곧 인격 점수' },
    { id: 'title_carry', kind: 'title', name: '캐리 장인', price: 1200, desc: '팀을 등에 업고 걷는 사람' },
    { id: 'title_jungle', kind: 'title', name: '정글의 왕', price: 1200, desc: '동선이 곧 승리다' },
    { id: 'title_vision', kind: 'title', name: '맵리의 정석', price: 1250, desc: '미니맵을 본 챔피언은 죽지 않는다' },
    { id: 'title_ghost', kind: 'title', name: '유체이탈 캐리', price: 1300, desc: '정신은 이미 다음 판에 가 있다' },
    { id: 'title_kda', kind: 'title', name: 'KDA 수집가', price: 1500, desc: '전적 검색이 취미이자 특기' },
    { id: 'title_mvp', kind: 'title', name: '오늘의 MVP', price: 1600, desc: '오늘만큼은 내가 주인공' },
    { id: 'title_penta', kind: 'title', name: '펜타킬 유망주', price: 1800, desc: '쿼드라까지는 몇 번 해봤다' },
    { id: 'title_deadeye', kind: 'title', name: '0데스 장인', price: 2000, desc: '죽지 않는 것이 최고의 기여' },
    { id: 'title_clutch', kind: 'title', name: '한타의 신', price: 2200, desc: '5:5 한타에서 눈이 제일 먼저 뜨인다' },
    { id: 'title_gambler', kind: 'title', name: '한탕주의', price: 2500, desc: '오늘도 전액 베팅' },
    { id: 'title_coin_god', kind: 'title', name: '동전의 신', price: 3000, desc: '앞면과 뒷면이 나에게 미래를 속삭인다' },
    { id: 'title_legend', kind: 'title', name: '내전의 전설', price: 5000, desc: '이 그룹의 살아 있는 역사' },
    { id: 'title_rich', kind: 'title', name: '내전 재벌', price: 8000, desc: '포인트로 쌓아 올린 금자탑' },
    { id: 'title_god', kind: 'title', name: '내전神', price: 10000, desc: '이 칭호를 산 것 자체가 플렉스' },

    /* 칭호 — 협곡 개그 컬렉션 */
    { id: 'title_mom', kind: 'title', name: '엄마가 부름', price: 400, desc: '치킨이 왔다. 어쩔 수 없었다' },
    { id: 'title_minion', kind: 'title', name: '미니언에게 명치 맞음', price: 400, desc: '미니언 어그로는 과학이다' },
    { id: 'title_toilet', kind: 'title', name: '한타 때 화장실', price: 450, desc: '방광은 오브젝트보다 강하다' },
    { id: 'title_no_ult', kind: 'title', name: '궁 빠졌어요 (진짜임)', price: 500, desc: '믿어 주세요, 진짜라니까요' },
    { id: 'title_well', kind: 'title', name: '우물 다이브 전문가', price: 550, desc: '타워는 장식이라고 배웠다' },
    { id: 'title_tower_aggro', kind: 'title', name: '타워는 왜 나만 때림', price: 600, desc: '어그로 마그넷의 삶' },
    { id: 'title_top_disease', kind: 'title', name: '탑신병자', price: 700, desc: '텔포? 안 씀. 맞라인 올인' },
    { id: 'title_wingame', kind: 'title', name: '이거 이기는 겜 맞음', price: 750, desc: '결과로 증명할 예정 (아마도)' },
    { id: 'title_tour', kind: 'title', name: '협곡 관광 가이드', price: 800, desc: '전 라인 로밍 풀코스 서비스' },
    { id: 'title_jgl_diff', kind: 'title', name: '정글차이 (내 차이 아님)', price: 850, desc: '우리 정글은 지금 어디에' },
    { id: 'title_sidestep', kind: 'title', name: '풀피 논타겟 장인', price: 900, desc: '무빙으로 다 피하는 남자/여자' },
    { id: 'title_yasuo', kind: 'title', name: '내 야스오는 다름', price: 950, desc: '0/10이어도 바람은 분다' },
    { id: 'title_aram', kind: 'title', name: '칼바람의 신', price: 1000, desc: '협곡은 못 하지만 다리 위에선 무적' },
    { id: 'title_objective', kind: 'title', name: '내가 곧 오브젝트', price: 1300, desc: '나를 잡느라 바론을 내준다' },
    { id: 'title_pentasteal', kind: 'title', name: '펜타 도둑', price: 1400, desc: '막타는 언제나 나의 것' },

    /* 이름표 테두리 — 착용하면 날개·안개·번개 같은 실제 연출이 재생된다 (상점은 간략 표시) */
    { id: 'frame_silver', kind: 'frame', name: '실버 테두리', price: 800, desc: '롤 실버 엠블럼에서 가져온 은빛 금속 테두리' },
    { id: 'frame_shadow', kind: 'frame', name: '그림자 장막', price: 1200, desc: '회색 테두리 사이로 검은 안개가 피어오릅니다' },
    { id: 'frame_pixel', kind: 'frame', name: '픽셀 아트', price: 1500, desc: '도트 테두리 위를 팩맨이 도트를 먹으며 돕니다' },
    { id: 'frame_ice', kind: 'frame', name: '영원한 서리', price: 1800, desc: '흰빛 도는 얼음 테두리에 눈이 내립니다' },
    { id: 'frame_sakura', kind: 'frame', name: '벚꽃엔딩', price: 2000, desc: '얇은 분홍 테두리에 꽃잎이 흩날립니다' },
    { id: 'frame_poro', kind: 'frame', name: '포로의 숨결', price: 2200, desc: '둥근 흰 테두리에 작은 뿔, 가끔 혓바닥을 낼름거립니다' },
    { id: 'frame_gold', kind: 'frame', name: '골드 테두리', price: 2500, desc: '롤 골드 엠블럼에서 가져온 황금빛 금속 테두리 — 은은한 광택이 흐릅니다' },
    { id: 'frame_fire', kind: 'frame', name: '불꽃 심장', price: 2800, desc: '붉은 테두리가 이글거리고 불티가 솟아오릅니다' },
    { id: 'frame_baron', kind: 'frame', name: '바론의 권능', price: 3200, desc: '보라 테두리 주위로 바론의 오라가 맥동합니다' },
    { id: 'frame_neon', kind: 'frame', name: '네온 사인', price: 3500, desc: '네온 튜브 테두리 — 이름 글자까지 네온으로 빛납니다' },
    { id: 'frame_lightning', kind: 'frame', name: '뇌전', price: 4000, desc: '보랏빛 번개가 위아래에서 지직거립니다' },
    { id: 'frame_void', kind: 'frame', name: '공허의 시선', price: 4500, desc: '어두운 보라 테두리 위에서 눈동자가 내려다봅니다' },
    { id: 'frame_glitch', kind: 'frame', name: '글리치', price: 5000, desc: '테두리와 글자가 RGB로 찢어지며 깨집니다' },
    { id: 'frame_money', kind: 'frame', name: '부의 테두리', price: 6000, desc: '금빛 테두리에 카지노 칩이 돌아갑니다' },

    /* 배경 장식 — 순위표에서 내 줄 전체의 배경이 된다 */
    { id: 'bg_night', kind: 'bg', name: '협곡의 밤', price: 800, desc: '별이 뜬 짙은 남색 밤하늘' },
    { id: 'bg_smoke', kind: 'bg', name: '전장의 연기', price: 1200, desc: '전투가 끝난 자리의 잿빛 안개' },
    { id: 'bg_gold_mine', kind: 'bg', name: '골드 광산', price: 1500, desc: '금맥이 은은하게 흐릅니다' },
    { id: 'bg_sakura_road', kind: 'bg', name: '벚꽃길', price: 1800, desc: '연분홍 꽃길만 걷게 해줄게' },
    { id: 'bg_ocean', kind: 'bg', name: '심해', price: 2000, desc: '빛이 닿지 않는 검푸른 바닷속, 수면에서 광선이 내려옵니다' },
    { id: 'bg_lava', kind: 'bg', name: '용암 지대', price: 2400, desc: '갈라진 지각 사이로 마그마가 흘러다닙니다' },
    { id: 'bg_nebula', kind: 'bg', name: '성운', price: 4000, desc: '보랏빛 우주 구름 속에 이름이 떠 있습니다' },
];

export const findItem = (id) => SHOP_ITEMS.find(i => i.id === id) ?? null;
