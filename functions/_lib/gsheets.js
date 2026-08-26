/*
 * 구글 시트 양방향 연동 (서비스 계정).
 *
 * 사용자가 시트를 서비스 계정 이메일에 편집자로 공유해 두면, 서버가 그 계정으로
 * 시트를 읽고 쓴다. 사용자 로그인(OAuth 동의·검증)이 필요 없고 비공개 시트도 다룰 수 있다.
 *
 * 인증 흐름: 개인키로 JWT 서명 → 구글에 토큰 교환 → Sheets API 호출.
 * 서명은 WebCrypto(RSASSA-PKCS1-v1_5 / SHA-256)로 하며, Workers와 Node 모두 같은 코드로 돈다.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const API = 'https://sheets.googleapis.com/v4/spreadsheets';

/** 토큰은 1시간짜리라 만료 1분 전까지 재사용한다 */
let tokenCache = { token: null, exp: 0 };

const b64url = (bytes) => {
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const textToB64url = (text) => b64url(new TextEncoder().encode(text));

/** PEM 개인키 → WebCrypto 키 */
const importKey = async (pem) => {
    const body = String(pem)
        .replace(/\\n/g, '\n')
        .replace(/-----BEGIN PRIVATE KEY-----/, '')
        .replace(/-----END PRIVATE KEY-----/, '')
        .replace(/\s+/g, '');
    const raw = Uint8Array.from(atob(body), c => c.charCodeAt(0));
    return crypto.subtle.importKey(
        'pkcs8', raw, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'],
    );
};

export const sheetsConfigured = (env) =>
    Boolean(env?.GOOGLE_SERVICE_ACCOUNT_EMAIL && env?.GOOGLE_PRIVATE_KEY);

export const serviceAccountEmail = (env) => env?.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? null;

/** 서비스 계정 액세스 토큰 (캐시) */
const getToken = async (env) => {
    const now = Math.floor(Date.now() / 1000);
    if (tokenCache.token && tokenCache.exp - 60 > now) return tokenCache.token;

    const claim = {
        iss: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        scope: SCOPE,
        aud: TOKEN_URL,
        iat: now,
        exp: now + 3600,
    };
    const head = textToB64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const payload = textToB64url(JSON.stringify(claim));
    const key = await importKey(env.GOOGLE_PRIVATE_KEY);
    const sig = await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${head}.${payload}`),
    );
    const jwt = `${head}.${payload}.${b64url(new Uint8Array(sig))}`;

    const res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${jwt}`,
    });
    const data = await res.json();
    if (!res.ok || !data.access_token) {
        throw new Error(data.error_description ?? '구글 인증에 실패했습니다.');
    }
    tokenCache = { token: data.access_token, exp: now + (data.expires_in ?? 3600) };
    return data.access_token;
};

/** 연결 점검용 — 인증이 실제로 통하는지만 확인한다 */
export const checkAuth = async (env) => {
    await getToken(env);
    return true;
};

/** 시트 주소에서 문서 ID를 뽑는다 (웹에 게시한 /d/e/ 주소는 API로 쓸 수 없다) */
export const spreadsheetIdOf = (url) => {
    const m = String(url ?? '').match(/\/spreadsheets\/d\/(?!e\/)([a-zA-Z0-9-_]+)/);
    return m?.[1] ?? null;
};

const call = async (env, path, init = {}) => {
    const token = await getToken(env);
    const res = await fetch(`${API}${path}`, {
        ...init,
        headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const reason = data?.error?.message ?? '';
        // 프로젝트에서 Sheets API 자체가 꺼져 있는 경우 — 공유 문제로 오해하지 않게 그대로 알려 준다
        if (/has not been used in project|is disabled|SERVICE_DISABLED/i.test(reason)) {
            throw new Error('구글 클라우드 프로젝트에서 Google Sheets API가 꺼져 있습니다. 콘솔에서 사용 설정해 주세요.');
        }
        if (res.status === 403 || res.status === 404) {
            throw new Error(`시트에 접근할 수 없습니다. 시트를 ${env.GOOGLE_SERVICE_ACCOUNT_EMAIL} 에 편집자로 공유해 주세요.`);
        }
        throw new Error(reason || '구글 시트 요청이 실패했습니다.');
    }
    return data;
};

/** 첫 번째 시트(탭)의 이름과 내부 ID — 범위 표기와 서식 지정에 쓴다 */
export const firstSheet = async (env, id) => {
    const meta = await call(env, `/${id}?fields=sheets.properties(sheetId,title,index)`);
    const props = (meta.sheets ?? [])[0]?.properties ?? {};
    return { title: props.title ?? '시트1', sheetId: props.sheetId ?? 0 };
};

/** 첫 번째 시트(탭) 이름 */
export const firstSheetTitle = async (env, id) => (await firstSheet(env, id)).title;

/** 탭 이름을 A1 표기에 안전하게 넣는다 (공백·따옴표가 있어도 되도록 항상 감싼다) */
const rangeOf = (title, cells) => `'${String(title).replace(/'/g, "''")}'!${cells}`;

/** 값 읽기 — CSV 대신 API로 읽으면 비공개 시트도 된다 */
export const readValues = async (env, id, title) => {
    const data = await call(env, `/${id}/values/${encodeURIComponent(rangeOf(title, 'A1:H500'))}`);
    return data.values ?? [];
};

/** 값 덮어쓰기 — 표 전체를 다시 쓴 뒤 남는 아래쪽 줄을 지운다 */
export const writeValues = async (env, id, title, values) => {
    const end = Math.max(values.length, 1);
    await call(env, `/${id}/values/${encodeURIComponent(rangeOf(title, `A1:H${end}`))}?valueInputOption=RAW`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values }),
    });
    // 이전 표가 더 길었다면 꼬리가 남으므로 아래쪽을 비운다
    await call(env, `/${id}/values/${encodeURIComponent(rangeOf(title, `A${end + 1}:H500`))}:clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
    }).catch(() => { /* 지울 게 없으면 무시 */ });
};

/**
 * 티어 칸(B~G)에 드롭다운을 건다.
 * 손으로 티어를 타이핑하면 오타가 나기 쉬워, 시트에서도 목록에서 고르게 한다.
 * strict를 끄면 목록에 없는 값도 경고만 뜨고 입력은 되므로 기존 표기가 깨지지 않는다.
 */
export const setTierDropdown = async (env, id, sheetId, choices, rows = 300) => {
    const values = choices.slice(0, 500).map(v => ({ userEnteredValue: String(v) }));
    await call(env, `/${id}:batchUpdate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            requests: [{
                setDataValidation: {
                    range: {
                        sheetId,
                        startRowIndex: 1,
                        endRowIndex: rows,
                        startColumnIndex: 1, // B열 = 기본 티어
                        endColumnIndex: 7,   // G열 = 서포터 (끝 제외)
                    },
                    rule: {
                        condition: { type: 'ONE_OF_LIST', values },
                        showCustomUi: true,
                        strict: false,
                    },
                },
            }],
        }),
    });
};

/** '#4A7FE0' → 구글이 쓰는 0~1 실수 색. 글자가 읽히도록 흰색과 섞어 연하게 만든다 */
const toRgb = (hex, lighten = 0.62) => {
    const h = String(hex).replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    const mix = (v) => (v / 255) * (1 - lighten) + lighten;
    return {
        red: mix((n >> 16) & 255),
        green: mix((n >> 8) & 255),
        blue: mix(n & 255),
    };
};

/**
 * 티어별 배경색 — 조건부 서식으로 건다.
 * 값이 바뀌면 색도 따라 바뀌므로, 시트에서 티어를 고르는 순간 색이 붙는다.
 * 다시 누를 때 규칙이 쌓이지 않도록 기존 규칙을 먼저 지운다.
 */
export const setTierColors = async (env, id, sheetId, tiers, rows = 300) => {
    const meta = await call(env, `/${id}?fields=sheets(properties.sheetId,conditionalFormats)`);
    const target = (meta.sheets ?? []).find(s => s.properties?.sheetId === sheetId);
    const existing = target?.conditionalFormats?.length ?? 0;

    const range = { sheetId, startRowIndex: 1, endRowIndex: rows, startColumnIndex: 1, endColumnIndex: 7 };
    const requests = [];
    // 뒤에서부터 지워야 인덱스가 밀리지 않는다
    for (let i = existing - 1; i >= 0; i -= 1) {
        requests.push({ deleteConditionalFormatRule: { sheetId, index: i } });
    }
    tiers.forEach((t, i) => {
        requests.push({
            addConditionalFormatRule: {
                index: i,
                rule: {
                    ranges: [range],
                    booleanRule: {
                        // '플래티넘 2'처럼 뒤에 숫자가 붙으므로 "~로 시작"으로 본다
                        condition: { type: 'TEXT_STARTS_WITH', values: [{ userEnteredValue: t.label }] },
                        format: { backgroundColor: toRgb(t.color) },
                    },
                },
            },
        });
    });
    if (requests.length === 0) return;

    await call(env, `/${id}:batchUpdate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests }),
    });
};

/**
 * 표를 보기 좋게 꾸민다 — 진한 머리글, 첫 줄 고정, 열 너비, 가운데 정렬, 옅은 테두리.
 * repeatCell 방식이라 여러 번 눌러도 같은 결과로 수렴한다 (규칙이 쌓이지 않는다).
 */
export const beautifySheet = async (env, id, sheetId, rowCount) => {
    const line = { style: 'SOLID', color: { red: 0.84, green: 0.86, blue: 0.9 } };
    await call(env, `/${id}:batchUpdate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            requests: [
                // 머리글 고정
                {
                    updateSheetProperties: {
                        properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
                        fields: 'gridProperties.frozenRowCount',
                    },
                },
                // 머리글 — 진한 배경 + 흰 굵은 글씨 + 가운데
                {
                    repeatCell: {
                        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 8 },
                        cell: {
                            userEnteredFormat: {
                                backgroundColor: { red: 0.165, green: 0.192, blue: 0.251 },
                                horizontalAlignment: 'CENTER',
                                verticalAlignment: 'MIDDLE',
                                textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true },
                            },
                        },
                        fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,verticalAlignment,textFormat)',
                    },
                },
                // 티어·점수 칸 가운데 정렬
                {
                    repeatCell: {
                        range: { sheetId, startRowIndex: 1, endRowIndex: rowCount, startColumnIndex: 1, endColumnIndex: 8 },
                        cell: { userEnteredFormat: { horizontalAlignment: 'CENTER' } },
                        fields: 'userEnteredFormat.horizontalAlignment',
                    },
                },
                // 열 너비 — 이름 넓게, 티어 일정하게
                { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 120 }, fields: 'pixelSize' } },
                { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 7 }, properties: { pixelSize: 102 }, fields: 'pixelSize' } },
                { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 7, endIndex: 8 }, properties: { pixelSize: 84 }, fields: 'pixelSize' } },
                // 옅은 테두리
                {
                    updateBorders: {
                        range: { sheetId, startRowIndex: 0, endRowIndex: rowCount, startColumnIndex: 0, endColumnIndex: 8 },
                        top: line, bottom: line, left: line, right: line,
                        innerHorizontal: line, innerVertical: line,
                    },
                },
            ],
        }),
    });
};

/* --- 참가자 데이터 → 표 (상시 동기화용) --- */

const TIER_LABELS = {
    iron: '아이언', bronze: '브론즈', silver: '실버', gold: '골드', platinum: '플래티넘',
    emerald: '에메랄드', diamond: '다이아', master: '마스터', grandmaster: '그랜드마스터', challenger: '챌린저',
};
const DIV_NUM = { I: '1', II: '2', III: '3', IV: '4' };
const SHEET_POSITIONS = ['탑', '정글', '미드', '원딜', '서포터'];

/** 'platinum:II' → '플래티넘 2' (지정 없음은 '자동') */
export const rankValueToLabel = (value) => {
    if (!value) return '자동';
    const [t, d] = String(value).split(':');
    const name = TIER_LABELS[t];
    if (!name) return '자동';
    return d && DIV_NUM[d] ? `${name} ${DIV_NUM[d]}` : name;
};

/**
 * 참가자·티어 데이터를 시트에 쓸 표로 만든다.
 * 점수 조절 칸은 시트에서 관리하는 값이라, 기존 시트의 값을 이름으로 찾아 이어 간다.
 */
export const buildTierGrid = (players, laneTiers, adjustByName = new Map()) => {
    const byPlayer = new Map();
    for (const t of laneTiers) {
        if (!byPlayer.has(t.playerId)) byPlayer.set(t.playerId, {});
        byPlayer.get(t.playerId)[t.position] = t.tier;
    }
    return [
        ['이름', '기본 티어', ...SHEET_POSITIONS, '점수 조절'],
        ...players.map(p => {
            const mine = byPlayer.get(p.id) ?? {};
            return [
                p.displayName,
                rankValueToLabel(mine['기본'] ?? null),
                ...SHEET_POSITIONS.map(pos => rankValueToLabel(mine[pos] ?? null)),
                adjustByName.get(p.displayName.trim()) ?? '',
            ];
        }),
    ];
};

/** 표(2차원 배열) → CSV 문자열. 기존 파싱 코드를 그대로 재사용하기 위해 맞춰 준다 */
export const valuesToCsv = (values) =>
    values.map(row => row
        .map(v => {
            const cell = v == null ? '' : String(v);
            return /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
        })
        .join(',')).join('\n');
