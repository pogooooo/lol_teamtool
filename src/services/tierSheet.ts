import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';
import { POSITIONS, RANK_OPTIONS, TIER_META, TIERS } from '../constants';
import type { Position, Tier } from '../types';

/*
 * 기본 티어 엑셀 연동.
 *
 * 팀툴이 아니라 엑셀에서 명단을 관리하는 사람이 많아서, 기본 티어를 표로 주고받는다.
 * .xlsx는 XML 몇 장을 담은 zip이라, 압축만 fflate에 맡기면 별도 라이브러리 없이
 * 읽고 쓸 수 있다. 엑셀에서 CSV로 저장한 파일도 그대로 받는다.
 */

/** 시트 첫 줄 — 이 순서가 곧 열 순서다 */
export const SHEET_HEADERS = ['이름', '기본 티어', ...POSITIONS, '점수 조절'];

/** "지정 없음 = 롤 랭크 자동" 을 뜻하는 표기 */
export const AUTO_LABEL = '자동';

/** 티어 칸 드롭다운에 넣을 목록 (자동 + 아이언4 ~ 챌린저1) */
export const TIER_CHOICES = [AUTO_LABEL, ...RANK_OPTIONS.map(o => o.label)];

/** 시트에 칠할 티어 색 — 앱 화면의 티어 색을 그대로 쓴다 */
export const TIER_COLORS = TIERS.map(t => ({ label: TIER_META[t].label, color: TIER_META[t].color }));

export interface SheetRow {
    name: string;
    /** 'platinum:II' 형식. null = 자동(롤 랭크), undefined = 이 칸을 건드리지 않음 */
    base?: string | null;
    lanes: Partial<Record<Position, string | null>>;
    adjust?: number;
}

/* --- 랭크 표기 ↔ 저장값 --- */

const NUM_TO_ROMAN: Record<string, string> = { '1': 'I', '2': 'II', '3': 'III', '4': 'IV' };
/** 사람들이 실제로 쓰는 표기들 — '플1', '다이아 3', 'P1', 'GOLD IV' 모두 받는다 */
const TIER_ALIASES: Record<string, Tier> = {
    아이언: 'iron', 아: 'iron', iron: 'iron', i: 'iron',
    브론즈: 'bronze', 브: 'bronze', bronze: 'bronze', b: 'bronze',
    실버: 'silver', 실: 'silver', silver: 'silver', s: 'silver',
    골드: 'gold', 골: 'gold', gold: 'gold', g: 'gold',
    플래티넘: 'platinum', 플래: 'platinum', 플: 'platinum', platinum: 'platinum', plat: 'platinum', p: 'platinum',
    에메랄드: 'emerald', 에메: 'emerald', 에: 'emerald', emerald: 'emerald', e: 'emerald',
    다이아몬드: 'diamond', 다이아: 'diamond', 다: 'diamond', diamond: 'diamond', dia: 'diamond', d: 'diamond',
    마스터: 'master', 마: 'master', master: 'master', m: 'master',
    그랜드마스터: 'grandmaster', 그마: 'grandmaster', grandmaster: 'grandmaster', gm: 'grandmaster',
    챌린저: 'challenger', 챌: 'challenger', challenger: 'challenger', c: 'challenger',
};

/** 엑셀에 적힌 표기 → 저장값. 못 알아보면 null */
export const parseRankText = (raw: string | null | undefined): string | null => {
    const text = String(raw ?? '').trim();
    if (!text || text === '-' || text === '자동') return null;

    const compact = text.replace(/\s+/g, '').toLowerCase();
    // 뒤에 붙은 디비전(1~4 또는 I~IV)을 떼어낸다
    const m = compact.match(/^(.+?)(iv|iii|ii|i|[1-4])?$/);
    const tierPart = m?.[1] ?? compact;
    const divPart = m?.[2] ?? '';

    const tier = TIER_ALIASES[tierPart];
    if (!tier) return null;

    const division = NUM_TO_ROMAN[divPart] ?? (divPart ? divPart.toUpperCase() : '');
    const exact = RANK_OPTIONS.find(o => o.tier === tier && (o.division ?? '') === division);
    if (exact) return exact.value;
    // 디비전이 없거나 이상하면 그 티어의 가운데(2)로 본다
    return RANK_OPTIONS.find(o => o.tier === tier && o.division === 'II')?.value ?? tier;
};

/** 저장값 → 엑셀에 쓸 한글 표기 ('플래티넘 2') */
export const rankText = (value: string | null | undefined): string => {
    if (!value) return '';
    const o = RANK_OPTIONS.find(x => x.value === value);
    if (o) return o.label;
    const t = value.split(':')[0] as Tier;
    return TIER_META[t]?.label ?? '';
};

/* --- 표 ↔ 파일 --- */

/**
  * 지정이 없는 칸은 '자동'으로 적는다.
  * 빈 칸(=이 칸을 건드리지 않음)과 구분해야 하고, 드롭다운 목록의 첫 항목과도 같은 말이어야 한다.
  */
const cell = (value: string | null | undefined) => (value === null ? AUTO_LABEL : rankText(value));

/** 시트에 그대로 쓸 수 있는 2차원 배열 */
export const toGrid = (rows: SheetRow[]): string[][] => [
    SHEET_HEADERS,
    ...rows.map(r => [
        r.name,
        cell(r.base),
        ...POSITIONS.map(p => cell(r.lanes[p])),
        r.adjust ? String(r.adjust) : '',
    ]),
];

const esc = (raw: string) => Array.from(raw)
    // 엑셀이 거부하는 제어문자는 버린다 (탭·줄바꿈만 허용)
    .filter(ch => ch.charCodeAt(0) >= 32 || ch.charCodeAt(0) === 9 || ch.charCodeAt(0) === 10)
    .join('')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const colName = (i: number): string => {
    let n = i;
    let out = '';
    do {
        out = String.fromCharCode(65 + (n % 26)) + out;
        n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    return out;
};

/** 드롭다운 목록을 넣어 둘 숨김 시트 이름 */
const LIST_SHEET = '티어목록';
/** 표에 미리 깔아 둘 줄 수 — 이 범위까지 드롭다운·색이 걸린다 */
const VALIDATION_ROWS = 200;

/** '#4A7FE0' → 흰색과 섞은 연한 배경색 (ARGB, 글자가 읽히는 밝기) */
const lightArgb = (hex: string, lighten = 0.62): string => {
    const n = parseInt(hex.replace('#', ''), 16);
    const mix = (v: number) => Math.round(v * (1 - lighten) + 255 * lighten);
    return 'FF' + [(n >> 16) & 255, (n >> 8) & 255, n & 255]
        .map(v => mix(v).toString(16).padStart(2, '0').toUpperCase())
        .join('');
};

/*
 * 셀 스타일 번호 (styles.xml의 cellXfs 순서와 일치해야 한다)
 *  0 기본 · 1 머리글(진한 배경+흰 굵은 글씨+가운데) · 2 가운데+테두리 · 3 이름(굵게+테두리)
 */
const STYLE_HEADER = 1;
const STYLE_CENTER = 2;
const STYLE_NAME = 3;

const stylesXml = (): string => {
    // 티어별 연한 배경 — 조건부 서식(dxf)이 이 순서를 번호로 참조한다
    const dxfs = TIERS
        .map(t => `<dxf><fill><patternFill><bgColor rgb="${lightArgb(TIER_META[t].color)}"/></patternFill></fill></dxf>`)
        .join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="3">
<font><sz val="11"/><name val="Malgun Gothic"/></font>
<font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Malgun Gothic"/></font>
<font><b/><sz val="11"/><name val="Malgun Gothic"/></font>
</fonts>
<fills count="3">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF2A3140"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FFD8DDE5"/></left><right style="thin"><color rgb="FFD8DDE5"/></right><top style="thin"><color rgb="FFD8DDE5"/></top><bottom style="thin"><color rgb="FFD8DDE5"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="4">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
<dxfs count="${TIERS.length}">${dxfs}</dxfs>
</styleSheet>`;
};

/**
 * 표 → .xlsx
 *
 * 문자열을 셀에 그대로 넣는 inlineStr 방식이라 sharedStrings가 필요 없다.
 * 티어 칸에는 드롭다운(데이터 유효성)과 티어별 배경색(조건부 서식)을 걸고,
 * 머리글은 진한 배경으로 칠한 뒤 첫 줄을 고정해 스크롤해도 보이게 한다.
 */
export const buildWorkbook = (rows: SheetRow[]): Blob => {
    const grid = toGrid(rows);
    const sheetRows = grid.map((cells, r) => {
        const cs = Array.from({ length: SHEET_HEADERS.length }, (_, c) => {
            const ref = `${colName(c)}${r + 1}`;
            const st = r === 0 ? STYLE_HEADER : c === 0 ? STYLE_NAME : STYLE_CENTER;
            const v = cells[c] ?? '';
            // 빈 칸도 스타일만 입혀 내보내야 표 전체에 테두리가 이어진다
            if (v === '') return `<c r="${ref}" s="${st}"/>`;
            if (r > 0 && /^-?\d+(\.\d+)?$/.test(v)) return `<c r="${ref}" s="${st}"><v>${v}</v></c>`;
            return `<c r="${ref}" s="${st}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
        }).join('');
        return `<row r="${r + 1}"${r === 0 ? ' ht="24" customHeight="1"' : ''}>${cs}</row>`;
    }).join('');

    // 티어 칸 드롭다운 — 목록이 길어 숨김 시트를 참조한다 (수식 255자 제한 회피)
    const options = TIER_CHOICES;
    const listRows = options
        .map((v, i) => `<row r="${i + 1}"><c r="A${i + 1}" t="inlineStr"><is><t>${esc(v)}</t></is></c></row>`)
        .join('');
    const listRef = `${LIST_SHEET}!$A$1:$A$${options.length}`;
    const validation = `<dataValidations count="1">`
        + `<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="0"`
        + ` sqref="B2:G${VALIDATION_ROWS}"><formula1>${listRef}</formula1></dataValidation>`
        + `</dataValidations>`;

    // 티어별 배경색 — 값이 그 티어로 시작하면 칠한다 ('플래티넘 2' 등)
    const conditional = `<conditionalFormatting sqref="B2:G${VALIDATION_ROWS}">${TIERS.map((t, i) => {
        const label = TIER_META[t].label;
        return `<cfRule type="beginsWith" dxfId="${i}" priority="${i + 1}" operator="beginsWith" text="${label}">`
            + `<formula>LEFT(B2,${label.length})="${label}"</formula></cfRule>`;
    }).join('')}</conditionalFormatting>`;

    const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols><col min="1" max="1" width="14" customWidth="1"/><col min="2" max="7" width="12.5" customWidth="1"/><col min="8" max="8" width="10" customWidth="1"/></cols>
<sheetData>${sheetRows}</sheetData>${conditional}${validation}</worksheet>`;

    const listSheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${listRows}</sheetData></worksheet>`;

    const files: Record<string, Uint8Array> = {
        '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`),
        '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`),
        'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="기본티어" sheetId="1" r:id="rId1"/><sheet name="${LIST_SHEET}" sheetId="2" state="hidden" r:id="rId2"/></sheets></workbook>`),
        'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`),
        'xl/styles.xml': strToU8(stylesXml()),
        'xl/worksheets/sheet1.xml': strToU8(sheet),
        'xl/worksheets/sheet2.xml': strToU8(listSheet),
    };

    return new Blob([zipSync(files) as BlobPart], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
};

/** 표 → CSV (엑셀이 한글을 깨지 않도록 BOM을 붙인다) */
export const buildCsv = (rows: SheetRow[]): Blob => {
    const body = toGrid(rows)
        .map(cells => cells.map(v => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(','))
        .join('\r\n');
    return new Blob([`\uFEFF${body}`], { type: 'text/csv;charset=utf-8' });
};

/* --- 읽기 --- */

const parseCsv = (text: string): string[][] => {
    const out: string[][] = [];
    let row: string[] = [];
    let cell = '';
    let quoted = false;
    const src = text.replace(/^\uFEFF/, '');
    for (let i = 0; i < src.length; i += 1) {
        const ch = src[i];
        if (quoted) {
            if (ch === '"' && src[i + 1] === '"') { cell += '"'; i += 1; }
            else if (ch === '"') quoted = false;
            else cell += ch;
            continue;
        }
        if (ch === '"') quoted = true;
        else if (ch === ',') { row.push(cell); cell = ''; }
        else if (ch === '\n') { row.push(cell); out.push(row); row = []; cell = ''; }
        else if (ch !== '\r') cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); out.push(row); }
    return out;
};

/** .xlsx 시트 XML → 표. 셀 좌표(r="B3")를 그대로 읽어 빈 칸도 자리를 지킨다 */
const parseXlsx = (buf: Uint8Array): string[][] => {
    const zip = unzipSync(buf);
    const sheetPath = Object.keys(zip).find(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
    if (!sheetPath) throw new Error('시트를 찾을 수 없습니다.');

    // 공유 문자열 테이블 (엑셀이 저장한 파일은 대부분 이 방식)
    const shared: string[] = [];
    if (zip['xl/sharedStrings.xml']) {
        const xml = strFromU8(zip['xl/sharedStrings.xml']);
        for (const si of xml.match(/<si>[\s\S]*?<\/si>/g) ?? []) {
            shared.push((si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) ?? [])
                .map(t => t.replace(/<[^>]+>/g, '')).join(''));
        }
    }

    /*
     * 엑셀이 저장한 파일은 한글을 숫자 참조(&#50641;)로 적어 두는 경우가 많아
     * 이름·티어를 알아보려면 반드시 풀어 줘야 한다.
     */
    const unesc = (s: string) => s
        .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
        .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

    const grid: string[][] = [];
    const xml = strFromU8(zip[sheetPath]);
    for (const rowXml of xml.match(/<row[\s\S]*?<\/row>/g) ?? []) {
        const r = Number(rowXml.match(/<row[^>]*\sr="(\d+)"/)?.[1] ?? grid.length + 1) - 1;
        const cells: string[] = [];
        for (const cellXml of rowXml.match(/<c[\s>][\s\S]*?(<\/c>|\/>)/g) ?? []) {
            const ref = cellXml.match(/\sr="([A-Z]+)\d+"/)?.[1] ?? '';
            let col = 0;
            for (const ch of ref) col = col * 26 + (ch.charCodeAt(0) - 64);
            col -= 1;
            const type = cellXml.match(/\st="([^"]+)"/)?.[1] ?? 'n';
            const raw = cellXml.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? '';
            let value: string;
            if (type === 's') value = shared[Number(raw)] ?? '';
            else if (type === 'inlineStr') {
                value = (cellXml.match(/<t[^>]*>([\s\S]*?)<\/t>/g) ?? [])
                    .map(t => t.replace(/<[^>]+>/g, '')).join('');
            } else value = raw;
            cells[col >= 0 ? col : cells.length] = unesc(value);
        }
        grid[r] = Array.from(cells, c => c ?? '');
    }
    return grid.filter(Boolean);
};

export interface SheetParseResult {
    rows: SheetRow[];
    /** 티어 표기를 알아보지 못한 칸 — 사용자에게 그대로 보여준다 */
    unknown: string[];
}

/** 엑셀(.xlsx) 또는 CSV 파일 → 적용할 행 목록 */
export const parseSheetFile = async (file: File): Promise<SheetParseResult> => {
    const buf = new Uint8Array(await file.arrayBuffer());
    const isZip = buf[0] === 0x50 && buf[1] === 0x4b; // 'PK' = xlsx
    return parseGrid(isZip ? parseXlsx(buf) : parseCsv(new TextDecoder('utf-8').decode(buf)));
};

/** 구글 시트에서 받아 온 CSV → 적용할 행 목록 */
export const parseSheetCsv = (text: string): SheetParseResult => parseGrid(parseCsv(text));

const parseGrid = (grid: string[][]): SheetParseResult => {
    if (grid.length === 0) return { rows: [], unknown: [] };

    // 첫 줄에서 열 위치를 찾는다 (열 순서를 바꿔도 되게)
    const header = grid[0].map(h => String(h ?? '').replace(/\s+/g, ''));
    const idxOf = (...names: string[]) => header.findIndex(h => names.includes(h));
    const nameCol = Math.max(idxOf('이름', '닉네임', 'name'), 0);
    const baseCol = idxOf('기본티어', '기본', 'base');
    const adjustCol = idxOf('점수조절', '조절', 'adjust');
    const laneCols = POSITIONS.map(p => idxOf(p));
    /*
     * 첫 줄에 '이름' 제목이 없으면 우리 양식이 아니다.
     * 엉뚱한 시트를 연결했을 때 그 표의 내용이 통째로 참가자로 등록되는 사고를 막는다.
     */
    if (idxOf('이름', '닉네임', 'name') < 0) return { rows: [], unknown: [] };

    const rows: SheetRow[] = [];
    const unknown: string[] = [];
    const readRank = (cell: string | undefined) => {
        const text = String(cell ?? '').trim();
        if (!text) return undefined;          // 빈 칸 = 건드리지 않음
        if (text === '-' || text === '자동') return null; // 명시적으로 비우기
        const v = parseRankText(text);
        if (!v) unknown.push(text);
        return v ?? undefined;
    };

    for (const cells of grid.slice(1)) {
        const name = String(cells[nameCol] ?? '').trim();
        if (!name) continue;
        const lanes: SheetRow['lanes'] = {};
        POSITIONS.forEach((p, i) => {
            const col = laneCols[i];
            if (col < 0) return;
            const v = readRank(cells[col]);
            if (v !== undefined) lanes[p] = v;
        });
        const adjustRaw = adjustCol >= 0 ? String(cells[adjustCol] ?? '').trim() : '';
        rows.push({
            name,
            base: baseCol >= 0 ? readRank(cells[baseCol]) : undefined,
            lanes,
            adjust: adjustRaw === '' ? undefined : Number(adjustRaw.replace('−', '-')) || 0,
        });
    }
    return { rows, unknown: [...new Set(unknown)] };
};

/** 브라우저 내려받기 */
export const download = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/** 처음 쓰는 사람에게 보여줄 예시 — 표기 방식을 한눈에 알 수 있게 섞어 뒀다 */
export const SAMPLE_ROWS: SheetRow[] = [
    { name: '홍길동', base: 'platinum:II', lanes: { 탑: 'diamond:IV', 서포터: 'gold:I' }, adjust: 0 },
    { name: '김철수', base: 'gold:III', lanes: { 정글: 'platinum:IV' }, adjust: 1.5 },
    { name: '이영희', base: null, lanes: { 미드: 'emerald:II', 원딜: 'diamond:III' } },
    { name: '박민수', base: 'master:II', lanes: {}, adjust: -2 },
];
