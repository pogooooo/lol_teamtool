import { useState } from 'react';
import styled from 'styled-components';
import { PrimaryButton, SecondaryButton, TextField } from '../App.styles';
import * as api from '../services/api';

/*
 * 문의/건의 모달 — mailto 대신 앱에서 바로 전송한다.
 * 1) 서버(/api/feedback)에 저장 (유실 방지)  2) Web3Forms로 운영자 메일 발송.
 * Web3Forms 무료 플랜은 서버 호출을 막으므로 반드시 브라우저에서 호출해야 한다.
 * (액세스 키는 공개용으로 설계된 값 — 수신 주소가 고정돼 있어 노출돼도 안전)
 */
const WEB3FORMS_KEY = '015425fe-3e1b-4e9e-a369-a573e2b3e653';

const sendMail = async (message: string, contact: string): Promise<boolean> => {
    try {
        const res = await fetch('https://api.web3forms.com/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
                access_key: WEB3FORMS_KEY,
                subject: '[팀툴] 문의/건의',
                from_name: '팀툴 문의',
                message: `${message}\n\n— 답장 연락처: ${contact || '(미기재)'}`,
            }),
        });
        const data: { success?: boolean } | null = await res.json().catch(() => null);
        return Boolean(res.ok && data?.success);
    } catch {
        return false;
    }
};

export const FeedbackModal = ({ onClose }: { onClose: () => void }) => {
    const [message, setMessage] = useState('');
    const [contact, setContact] = useState('');
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState(false);
    const [error, setError] = useState('');

    const handleSend = async () => {
        if (busy || !message.trim()) return;
        setBusy(true);
        setError('');
        // 메일 발송과 서버 저장을 병행 — 메일이 실패해도 서버 저장만 되면 성공으로 처리
        const [saved] = await Promise.allSettled([
            api.sendFeedback(message.trim(), contact.trim()),
            sendMail(message.trim(), contact.trim()),
        ]);
        if (saved.status === 'fulfilled') {
            setDone(true);
            setTimeout(onClose, 1500);
        } else {
            setError(api.errorMessage(saved.reason));
        }
        setBusy(false);
    };

    return (
        <Overlay onClick={onClose}>
            <Box onClick={e => e.stopPropagation()}>
                <h3>문의 · 건의</h3>
                {done ? (
                    <Done>전달되었습니다. 소중한 의견 감사합니다!</Done>
                ) : (
                    <>
                        <MessageArea
                            autoFocus
                            placeholder="불편한 점, 바라는 기능, 오류 제보 등 무엇이든 적어주세요."
                            value={message}
                            maxLength={2000}
                            onChange={e => setMessage(e.target.value)}
                        />
                        <TextField
                            placeholder="답장 받을 연락처 (선택 — 이메일 등)"
                            value={contact}
                            maxLength={200}
                            onChange={e => setContact(e.target.value)}
                        />
                        {error && <ErrorText>{error}</ErrorText>}
                        <ButtonRow>
                            <SecondaryButton onClick={onClose}>닫기</SecondaryButton>
                            <PrimaryButton onClick={handleSend} disabled={busy || !message.trim()}>
                                {busy ? '보내는 중...' : '보내기'}
                            </PrimaryButton>
                        </ButtonRow>
                    </>
                )}
            </Box>
        </Overlay>
    );
};

const Overlay = styled.div`
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    justify-content: center;
    align-items: center;
    background-color: rgba(0, 0, 0, 0.6);
    padding: 1rem;
`;

const Box = styled.div`
    width: min(440px, 100%);
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1.25rem;
    border-radius: var(--radius-lg);
    background: ${({ theme }) => theme.card};
    border: 1px solid ${({ theme }) => theme.cardBorder};

    h3 { font-size: 1.1rem; color: ${({ theme }) => theme.text}; }
`;

const MessageArea = styled.textarea`
    min-height: 120px;
    resize: vertical;
    padding: 0.6rem 0.75rem;
    font-size: 0.9rem;
    font-family: inherit;
    line-height: 1.5;
    color: ${({ theme }) => theme.text};
    background: ${({ theme }) => theme.body};
    border: 1px solid ${({ theme }) => theme.cardBorder};
    border-radius: var(--radius-md);

    &::placeholder { color: ${({ theme }) => theme.placeholder}; }
    &:focus { outline: 1px solid ${({ theme }) => theme.accent}; }
`;

const ButtonRow = styled.div`
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
`;

const Done = styled.p`
    padding: 1.5rem 0;
    text-align: center;
    font-size: 0.95rem;
    color: ${({ theme }) => theme.text};
`;

const ErrorText = styled.p`
    font-size: 0.8rem;
    color: ${({ theme }) => theme.teamRed};
`;
