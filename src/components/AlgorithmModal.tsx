import styled from 'styled-components';
import { ModalOverlay, ModalContent, CompactButton } from '../App.styles';
import { LANE_WEIGHTS } from '../services/ratings';
import { POSITIONS } from '../constants';

/** 점수 산정 기준 안내 — 어떤 근거로 점수가 나오는지 보여준다 */
export const AlgorithmModal = ({ onClose }: { onClose: () => void }) => (
    <ModalOverlay onClick={onClose}>
        <Box onClick={e => e.stopPropagation()}>
            <div className="head">
                <h3>점수 기준</h3>
                <CompactButton onClick={onClose}>닫기</CompactButton>
            </div>

            <section>
                <h4>1. 기본 티어 — 롤 최고 솔랭 (없으면 자랭)</h4>
                <p>
                    점수의 출발점은 <b>기본 티어</b>입니다. 내전 기록 그룹에 롤 계정을 등록해 두면
                    그 사람의 <b>가장 높은 솔로랭크</b> 티어가 자동으로 들어오고, 솔랭 기록이 없으면
                    자유랭크를 씁니다. 부계정을 여러 개 등록했다면 그중 가장 높은 랭크를 기준으로 삼습니다.
                </p>
                <p>
                    티어와 실제 실력이 다른 사람도 있으므로 <b>직접 지정</b>할 수 있습니다.
                    이름을 우클릭하거나 참가자 관리에서 고르면 그 값이 자동 조회값을 대신합니다.
                    <b>라인마다 다르게</b> 지정할 수도 있어서, 탑은 다이아·서포터는 플래티넘처럼 나눠 둘 수 있습니다.
                    (우선순위: 라인 지정 → 직접 지정 → 롤 솔랭 → 롤 자랭)
                </p>
            </section>

            <section>
                <h4>2. 티어 점수 — 디비전·LP까지</h4>
                <p>
                    티어 사이 간격을 5점으로 두고, 그 안을 디비전(4→1)으로 4등분한 뒤 LP로 미세 조정합니다.
                    같은 다이아라도 4와 1의 차이가 묻히지 않게 하기 위해서입니다.
                    마스터 이상은 디비전이 없으므로 LP를 사다리로 그대로 반영합니다.
                </p>
            </section>

            <section>
                <h4>3. 최근 30일 게임 수 — 오래 쉬면 감점</h4>
                <p>
                    랭크 티어는 "지금 폼"이 아니라 누적 기록입니다. 최근 30일 게임 수가 적을수록
                    실제 경기력이 티어보다 낮을 가능성이 크므로 최대 4.5점까지 깎습니다.
                </p>
                <Table>
                    <thead><tr><th>최근 30일</th><th>30판+</th><th>20~29</th><th>15~19</th><th>10~14</th><th>5~9</th><th>2~4</th><th>1</th><th>0</th></tr></thead>
                    <tbody><tr><td className="lb">보정</td><td>0</td><td>−0.3</td><td>−0.7</td><td>−1.2</td><td>−2.0</td><td>−3.0</td><td>−3.8</td><td>−4.5</td></tr></tbody>
                </Table>
            </section>

            <section>
                <h4>4. 최근 승률 — 티어보다 앞서 있는지</h4>
                <p>
                    같은 티어라도 승률이 크게 높으면 티어보다 실력이 앞서 있을 확률이 높습니다.
                    다만 판수가 적으면 승률의 신뢰도가 낮으므로, 판수에 비례해 보정폭을 줄여 최대 ±2.5점까지만 반영합니다.
                    (10판 미만은 승률을 아예 쓰지 않고, 60판이면 온전히 반영)
                </p>
            </section>

            <section>
                <h4>5. 표본 보정 — 판수가 적으면 티어를 덜 믿는다</h4>
                <p>
                    배치 직후처럼 랭크 판수가 적으면 티어 자체가 불안정합니다. 총 랭크 판수가 적을수록
                    소폭 감점해 과신을 줄입니다. (40판+ 0 · 20~39판 −0.4 · 10~19판 −0.9 · 1~9판 −1.5 · 0판 −2.0)
                </p>
                <p className="sub">
                    3~5번은 등록된 롤 계정에서 나오는 값이라, 계정이 없는 사람은 가감 없이
                    지정한 티어 점수를 그대로 씁니다. 모르는 것을 감점하지 않습니다.
                </p>
            </section>

            <section>
                <h4>6. 라인 가중치 — 실력대별로 다른 영향력</h4>
                <p>
                    라인마다 승패에 미치는 영향력이 다르고, 그 크기는 실력대에 따라 달라집니다.
                    낮은 티어에서는 오브젝트·갱킹 주도권을 쥔 <b>정글</b>과 로밍이 자유로운 <b>미드</b>의
                    개인 캐리력이 크고, 시야·이니시로 기여하는 <b>서포터</b>의 가치는 팀 합이 안 맞아 덜 발현됩니다.
                    높은 티어에서는 오브젝트 운영과 시야 싸움이 정착되어 <b>서포터·원딜</b>의 팀 기여가 살아나고,
                    <b>탑</b>은 사이드에서 고립되는 시간이 길어 상대적 영향력이 줄어듭니다.
                </p>
                <Table>
                    <thead>
                        <tr>
                            <th>실력대</th>
                            {POSITIONS.map(p => <th key={p}>{p}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {([['low', '아이언~골드'], ['mid', '플래티넘~에메랄드'], ['high', '다이아~챌린저']] as const).map(([key, label]) => (
                            <tr key={key}>
                                <td className="lb">{label}</td>
                                {POSITIONS.map(p => (
                                    <td key={p} className="tabular">×{LANE_WEIGHTS[key][p].toFixed(2)}</td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </Table>
            </section>

            <section>
                <h4>7. 내전 기록 보정 — 우리 판에서의 라인 숙련도</h4>
                <p>
                    이 그룹에 쌓인 <b>내전 전적</b>으로 라인별 숙련도를 계산해 점수에 곱합니다.
                </p>
                <ul>
                    <li><b>경험</b> — 그 라인을 자주 뛸수록 편안합니다. 전체의 30% 이상 도맡으면 <b>주라인</b>(+6%),
                        한 번도 안 뛴 라인은 <b>오프 포지션</b>(−12%)으로 봅니다.</li>
                    <li><b>성적</b> — 그 라인 승률이 본인 평균보다 높으면 가점, 낮으면 감점. 판수가 적으면
                        신뢰도를 낮춰 폭을 줄입니다.</li>
                </ul>
                <p>
                    전체 3판 미만이면 표본이 없다고 보고 보정하지 않습니다. 배치 카드에
                    <b>주라인 / 부라인 / 오프</b> 배지로 표시됩니다.
                </p>
            </section>

            <section>
                <h4>8. 희망 라인 — 본인이 가고 싶은 자리</h4>
                <p>
                    오른쪽 희망 칸에 카드를 놓으면 그 라인을 지망한 것으로 보고 점수를 올립니다.
                    <b>1지망 +6% · 2지망 +3% · 3지망 이하 +1.5%</b>이고, 지망을 냈는데 목록에 없는 라인에
                    배치되면 −5%입니다. 아무 지망도 내지 않으면 보정하지 않습니다.
                    자동 분배도 지망 순서를 먼저 존중해 라인을 배정합니다.
                </p>
            </section>

            <section>
                <h4>9. 세부 점수 조절 — 마지막은 사람이 정한다</h4>
                <p>
                    계산이 실제 체감과 다르면 점수에 마우스를 올려 <b>± 버튼</b>으로 직접 조절합니다.
                    조절값은 자동 계산된 최종 점수에 <b>더해지는 값</b>으로 따로 남기 때문에,
                    티어나 전적이 바뀌어도 "내가 얼마나 손봤는지"가 그대로 유지됩니다.
                    <b>이름 우클릭</b>을 하면 항목별 가감 내역과 조절량을 한눈에 보고 초기화할 수 있습니다.
                </p>
            </section>

            <Formula>
                (기본 티어 점수 + 활동 + 승률 + 표본) × 라인 가중치 × 내전 숙련도 × 희망 라인 + 직접 조절
            </Formula>

            <p className="note">
                기본 티어는 <b>엑셀로 주고받을 수 있습니다</b>. 명단 위의 <b>엑셀</b> 버튼에서 현재 명단을 내려받아
                고친 뒤 그대로 올리면 기본 티어·라인별 티어·점수 조절이 한 번에 반영됩니다.
                계정도 없고 티어도 지정하지 않은 사람은 중간값(골드 근처)으로 가정합니다.
            </p>
        </Box>
    </ModalOverlay>
);

const Box = styled(ModalContent)`
    width: min(620px, 94vw);
    max-height: 84vh;
    overflow-y: auto;
    text-align: left;

    .head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.5rem;

        h3 { margin: 0; font-size: 1.2rem; }
    }

    section { margin-bottom: 1rem; }

    ul { padding-left: 1.1rem; margin: 0.3rem 0 0.4rem; }
    li { font-size: 0.84rem; line-height: 1.6; color: ${({ theme }) => theme.placeholder}; margin-bottom: 0.2rem;
        b { color: ${({ theme }) => theme.text}; }
    }

    h4 {
        font-size: 0.9rem;
        color: ${({ theme }) => theme.accent};
        margin-bottom: 0.3rem;
    }

    p {
        font-size: 0.84rem;
        line-height: 1.6;
        color: ${({ theme }) => theme.placeholder};
        margin-bottom: 0.4rem;

        b { color: ${({ theme }) => theme.text}; }
    }

    .sub {
        font-size: 0.78rem;
        padding: 0.4rem 0.5rem;
        border-radius: var(--radius-sm);
        background: ${({ theme }) => theme.body};
    }

    .note {
        font-size: 0.78rem;
        padding-top: 0.6rem;
        border-top: 1px solid ${({ theme }) => theme.cardBorder};
        margin-bottom: 0;
    }
`;

/* 전체 계산식 한 줄 요약 */
const Formula = styled.div`
    padding: 0.5rem 0.6rem;
    margin-bottom: 1rem;
    border-radius: var(--radius-md);
    border: 1px dashed ${({ theme }) => theme.accent};
    font-size: 0.78rem;
    font-weight: 700;
    line-height: 1.6;
    color: ${({ theme }) => theme.text};
    text-align: center;
`;

const Table = styled.table`
    width: 100%;
    border-collapse: collapse;
    font-size: 0.78rem;

    th, td {
        padding: 0.3rem 0.4rem;
        border: 1px solid ${({ theme }) => theme.cardBorder};
        text-align: center;
        color: ${({ theme }) => theme.text};
    }
    th { background: ${({ theme }) => theme.body}; font-size: 0.74rem; }
    .lb { text-align: left; color: ${({ theme }) => theme.placeholder}; white-space: nowrap; }
`;
