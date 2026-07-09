/*
 * 게임 에셋(챔피언/아이템 이미지·한글 이름) 프록시 — Pages Functions용 (server/assets.js 포팅).
 * 브라우저가 CDN에 직접 붙으면 네트워크/DNS/광고차단기에 따라 깨질 수 있어
 * Functions가 대신 받아 전달한다. 이미지 캐시는 라우터에서 Cloudflare 엣지 캐시(caches.default)로 처리.
 * 소스 이중화: ddragon(공식) 우선 → 실패 시 CommunityDragon으로 완전 폴백.
 */

const DD = 'https://ddragon.leagueoflegends.com';
const CD_CDN = 'https://cdn.communitydragon.org';
const CD_RAW = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global';

let metaCache = null; // { source, version, champNames, ... , fetchedAt } — isolate 생존 동안 유지
const META_TTL = 6 * 3600 * 1000;

const getJson = async (url, timeout = 10000) => {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeout) });
    if (!res.ok) throw new Error(`asset fetch failed: ${res.status} ${url}`);
    return res.json();
};

const loadFromDDragon = async () => {
    const versions = await getJson(`${DD}/api/versions.json`, 8000);
    const version = versions[0];

    const [champData, itemData] = await Promise.all([
        getJson(`${DD}/cdn/${version}/data/ko_KR/champion.json`),
        getJson(`${DD}/cdn/${version}/data/ko_KR/item.json`),
    ]);

    const champNames = {};
    const champKeys = {}; // 숫자 챔피언 ID → 영문 ID (밴 목록 표시용)
    Object.values(champData.data).forEach(c => {
        champNames[c.id] = c.name;
        champKeys[c.key] = c.id;
    });
    const itemNames = {};
    Object.entries(itemData.data).forEach(([id, item]) => { itemNames[id] = item.name; });

    // 룬: 스타일 + 개별 룬 이름/아이콘 (ddragon runesReforged에는 스탯 룬이 없음 → 폴백 표시)
    const runeNames = {};
    const runeIconUrls = {};
    try {
        const runes = await getJson(`${DD}/cdn/${version}/data/ko_KR/runesReforged.json`);
        runes.forEach(style => {
            runeNames[String(style.id)] = style.name;
            runeIconUrls[String(style.id)] = `${DD}/cdn/img/${style.icon}`;
            style.slots?.forEach(slot => slot.runes?.forEach(rune => {
                runeNames[String(rune.id)] = rune.name;
                runeIconUrls[String(rune.id)] = `${DD}/cdn/img/${rune.icon}`;
            }));
        });
    } catch { /* 룬 데이터 실패 시 이름/아이콘 없이 동작 */ }

    // 소환사 주문 이름/아이콘
    const spellNames = {};
    const spellIconUrls = {};
    try {
        const spells = await getJson(`${DD}/cdn/${version}/data/ko_KR/summoner.json`);
        Object.values(spells.data).forEach(spell => {
            spellNames[spell.key] = spell.name;
            spellIconUrls[spell.key] = `${DD}/cdn/${version}/img/spell/${spell.image.full}`;
        });
    } catch { /* 스펠 데이터 실패 시 이름/아이콘 없이 동작 */ }

    return { source: 'ddragon', version, champNames, champKeys, itemNames, itemIconPaths: {}, runeNames, runeIconUrls, spellNames, spellIconUrls };
};

const cdAssetUrl = (iconPath) =>
    `${CD_RAW}/default${iconPath.replace('/lol-game-data/assets', '').toLowerCase()}`;

const loadFromCDragon = async () => {
    const [champs, items, perks, styles, spells] = await Promise.all([
        getJson(`${CD_RAW}/ko_kr/v1/champion-summary.json`),
        getJson(`${CD_RAW}/ko_kr/v1/items.json`, 15000),
        getJson(`${CD_RAW}/ko_kr/v1/perks.json`),
        getJson(`${CD_RAW}/ko_kr/v1/perkstyles.json`),
        getJson(`${CD_RAW}/ko_kr/v1/summoner-spells.json`),
    ]);

    const champNames = {};
    const champKeys = {};
    champs.forEach(c => {
        if (c.id > 0 && c.alias) {
            champNames[c.alias] = c.name;
            champKeys[String(c.id)] = c.alias;
        }
    });

    const itemNames = {};
    const itemIconPaths = {};
    items.forEach(item => {
        itemNames[String(item.id)] = item.name;
        if (item.iconPath) itemIconPaths[String(item.id)] = cdAssetUrl(item.iconPath);
    });

    // 룬: 개별 룬(스탯 룬 포함) + 스타일
    const runeNames = {};
    const runeIconUrls = {};
    perks.forEach(perk => {
        runeNames[String(perk.id)] = perk.name;
        if (perk.iconPath) runeIconUrls[String(perk.id)] = cdAssetUrl(perk.iconPath);
    });
    (styles?.styles ?? []).forEach(style => {
        runeNames[String(style.id)] = style.name;
        if (style.iconPath) runeIconUrls[String(style.id)] = cdAssetUrl(style.iconPath);
    });

    // 소환사 주문
    const spellNames = {};
    const spellIconUrls = {};
    spells.forEach(spell => {
        spellNames[String(spell.id)] = spell.name;
        if (spell.iconPath) spellIconUrls[String(spell.id)] = cdAssetUrl(spell.iconPath);
    });

    return { source: 'cdragon', version: 'latest', champNames, champKeys, itemNames, itemIconPaths, runeNames, runeIconUrls, spellNames, spellIconUrls };
};

/** 패치 버전 + 챔피언/아이템 한글 이름 (6시간 캐시) */
export const getAssetMeta = async () => {
    if (metaCache && Date.now() - metaCache.fetchedAt < META_TTL) return metaCache;
    let meta;
    try {
        meta = await loadFromDDragon();
    } catch {
        meta = await loadFromCDragon();
    }
    metaCache = { ...meta, fetchedAt: Date.now() };
    return metaCache;
};

const fetchImage = async (url) => {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`image fetch failed: ${res.status} ${url}`);
    return res.arrayBuffer();
};

/** 챔피언 초상화 */
export const getChampionImage = async (championId) => {
    const id = championId.replace(/[^A-Za-z0-9]/g, '');
    try {
        const meta = await getAssetMeta();
        if (meta.source === 'ddragon') {
            return await fetchImage(`${DD}/cdn/${meta.version}/img/champion/${id}.png`);
        }
    } catch { /* 아래 CommunityDragon으로 */ }
    return fetchImage(`${CD_CDN}/latest/champion/${id}/square`);
};

/** 룬 아이콘 */
export const getRuneImage = async (runeId) => {
    const id = String(runeId).replace(/[^0-9]/g, '');
    const meta = await getAssetMeta();
    const url = meta.runeIconUrls?.[id];
    if (!url) throw new Error(`rune icon not found: ${id}`);
    return fetchImage(url);
};

/** 소환사 주문 아이콘 */
export const getSpellImage = async (spellId) => {
    const id = String(spellId).replace(/[^0-9]/g, '');
    const meta = await getAssetMeta();
    const url = meta.spellIconUrls?.[id];
    if (!url) throw new Error(`spell icon not found: ${id}`);
    return fetchImage(url);
};

/** 아이템 아이콘 */
export const getItemImage = async (itemId) => {
    const id = String(itemId).replace(/[^0-9]/g, '');
    const meta = await getAssetMeta();
    if (meta.source === 'ddragon') {
        try {
            return await fetchImage(`${DD}/cdn/${meta.version}/img/item/${id}.png`);
        } catch { /* 아래 CommunityDragon으로 */ }
    }
    const iconUrl = meta.itemIconPaths[id]
        ?? (await loadFromCDragon().then(m => { metaCache = { ...m, fetchedAt: Date.now() }; return m.itemIconPaths[id]; }));
    if (!iconUrl) throw new Error(`item icon not found: ${id}`);
    return fetchImage(iconUrl);
};
