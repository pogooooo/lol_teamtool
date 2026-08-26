import styled from 'styled-components';
import { Card } from '../../App.styles';

/*
 * 도움말 & 읽을거리 — 내전 기록 탭 하단(스크롤 허용 영역)의 접이식 콘텐츠.
 * 기본은 접혀 있어 화면 디자인에 영향이 없고, 정적 콘텐츠 페이지로 연결된다.
 * (팀 빌딩 탭은 무스크롤 규칙 때문에 배치하지 않는다 — DESIGN.md 2.2)
 */
export const HelpSection = () => (
    <HelpCard>
        <h3>도움말 &amp; 읽을거리</h3>

        <details>
            <summary>팀툴은 어떤 서비스인가요?</summary>
            <p>
                친구·동아리·직장 모임의 리그 오브 레전드 내전을 위한 무료 도구입니다.
                티어별 드래그 앤 드롭으로 5:5 팀 밸런스를 맞추는 팀 빌더와, 그룹 참여 코드로
                모임별 전적을 기록·검색하는 내전 기록 기능을 제공합니다. 회원가입은 없으며,
                롤 계정을 등록하면 랭크·숙련도·최근 픽 경향까지 볼 수 있습니다.
            </p>
        </details>

        <details>
            <summary>내전 운영 꿀팁 요약</summary>
            <ul>
                <li>노쇼 대비로 예비 인원을 1~2명 더 모으고, 시작 시간은 분 단위로 공지하기</li>
                <li>밴픽 방식·닷지 규정·항복 규정·포지션 중복 처리는 시작 전에 합의하기</li>
                <li>연승 팀은 전체를 섞지 말고 한 명만 교체하는 "핀 포인트 교체"로 조정하기</li>
                <li>결과는 그날 바로 기록하기 — 승률이 쌓이면 티어 재평가의 근거가 됩니다</li>
            </ul>
            <p><a href="/tips.html">내전 운영 가이드 전체 보기 →</a></p>
        </details>

        <details>
            <summary>팀 밸런스, 티어만 보면 안 되는 이유</summary>
            <ul>
                <li>양 팀 <strong>정글러</strong> 실력부터 맞추세요 — 격차가 가장 크게 스노우볼로 이어지는 자리입니다</li>
                <li>오프 포지션 배치는 체감 한 티어 하락 — "상" 참가자도 그 판에선 "중"으로 계산</li>
                <li>원딜-서포터, 미드-정글 듀오는 한 묶음의 전력으로 평가하세요</li>
            </ul>
            <p><a href="/positions.html">포지션 이해와 팀 밸런싱 전체 보기 →</a></p>
        </details>

        <details>
            <summary>자주 묻는 질문</summary>
            <ul>
                <li><strong>기록은 어디에 저장되나요?</strong> — 그룹 데이터는 서비스 DB에 저장되며 참여 코드를 아는 사람만 봅니다.</li>
                <li><strong>부계정으로 참여하면?</strong> — 참가자에게 계정을 여러 개 등록하면 같은 사람으로 합산됩니다.</li>
                <li><strong>마지막 멤버가 나가면?</strong> — 그룹의 모든 데이터가 삭제됩니다.</li>
            </ul>
            <p><a href="/faq.html">FAQ 전체 보기 →</a></p>
        </details>

        <Legal>
            팀툴은 라이엇 게임즈(Riot Games)의 공식 제품이 아니며, 라이엇 게임즈의 보증을 받지 않았습니다.
            리그 오브 레전드와 관련 자산은 라이엇 게임즈의 상표 또는 등록 상표입니다.
        </Legal>
    </HelpCard>
);

const HelpCard = styled(Card)`
    display: flex;
    flex-direction: column;
    gap: 0.4rem;

    h3 {
        font-size: 1rem;
        color: ${({ theme }) => theme.text};
        padding-bottom: 0.4rem;
        border-bottom: 1px solid ${({ theme }) => theme.cardBorder};
        margin-bottom: 0.2rem;
    }

    details {
        border: 1px solid ${({ theme }) => theme.cardBorder};
        border-radius: var(--radius-md);
        padding: 0.5rem 0.7rem;

        summary {
            cursor: pointer;
            font-size: 0.85rem;
            font-weight: 700;
            color: ${({ theme }) => theme.text};
        }

        p, ul {
            margin-top: 0.4rem;
            font-size: 0.82rem;
            color: ${({ theme }) => theme.text};
            line-height: 1.65;
        }

        ul { padding-left: 1.1rem; }
        li { margin-bottom: 0.2rem; }

        a {
            color: ${({ theme }) => theme.accent};
            font-weight: 600;
        }
    }
`;

const Legal = styled.p`
    font-size: 0.68rem;
    color: ${({ theme }) => theme.placeholder};
    line-height: 1.5;
    margin-top: 0.2rem;
`;
