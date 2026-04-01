import React, { useState, useEffect } from 'react';
import { useTeamBuilderContext } from '../hooks/useTeamBuilderLogic';
import { ChatSideContainer, ChatBubble } from '../App.styles';

const CHAT_TEMPLATES = [
    "대 {name}",
    "오히려 좋아 {name} 죽어서 상대 현상금 낮춤",
    "이게 다 {name}의 큰 그림임",
    "딸깍의 신 {name}",
    "어이 {name} 믿고 있었다고!",
    "{name}의 스킬 샷은 거의 비폭력주의자 수준임",
    "{name} {name} 강타 싸움 수준 실화냐? 미안하다 이거 보여주려고 어그로 끌었다..",
    "서포터가 {name}이면 지는 게 불가능함",
    "{name} 님 룬 세팅 보니까 천재 아니면 바보임",
    "또 너냐 {name}?!",
    "신은 죽었다. 그리고 {name}이 그 자리를 대신했다.",
    "이게 {name}식 엔딩인가?",
    "와 {name} 님.. 당신은 도대체 어떤 삶을 산 겁니까..",
    "인정협회도 {name}은 인정못함",
    "인정협회가 {name}한테 인정 드립니다",
    "{name}은 느리구나.. 픽하는 것 조차..",
    "{name}그는감히전설이라할수있다",
    "나는 {name} 원딜의 신. 협곡 탈주 메이커",
    "{name}아 걱정마 울어도 돼 사실 산타는 없거든",
    "{name}.. 역시 Chill 하시네요",
    "와 {name} 너 정말 핵심을 찔렀어!",
    "{name}의 정글링이 멈추지 않는 탓일까? ㅜ.ㅜ",
    "{name}을 웍웍웍웍웍질",
    "와! {name}! 무대를 뒤집어놓으셨다!",
    "탑의 신이 되고 싶은자는 {name}에게로..",
    "{name}때문에 가정이 무너지고.. 사회가 무너지고..",
    "어서와 {name}식 운영은 처음이지?",
    "다시는 {name}을 무시하지 마라..",
    "{name}이 왜 거기서 나와..?",
    "왜 나 {name}는 햄보칼수가업서!",
    "{name}도 사람이야 사람!",
    "어차피 우승은 {name}",
    "{name}이 {name}정돈 이기지",
    "{name} 네르지 마세요~~",
    "{name}은 완전히 멘탈이 나가버렸습니다",
    "팩트는 {name}는 {name}가 발라버린다는 거임",
    "{name}는 대학시절 묵찌빠를 전공했다는 사실",
    "나 {name}인데 {name}진다에 개추 눌렀다",
    "{name}.. {name}가 없는 시대에 태어난 범부여..",
    "{name}가 정글링을 하다가 심술두꺼비한테 죽은 건에 대하여",
    "고도로 발전한 {name}는 심술두꺼비와 구분할 수 없다",
    "{name}가... 말대꾸!?",
    "{name}를 죽인 {name}를 15년 후에 죽여주세요",
    "중요한 건 꺽이지 않는 {name}"
];

export const AprilFoolsChat = () => {
    const { allPlayers } = useTeamBuilderContext();
    const [chats, setChats] = useState([]);

    // const isAprilFoolsWeek = () => true;

    const isAprilFoolsWeek = () => {
        const now = new Date();
        const year = now.getFullYear();

        const aprilFirst = new Date(year, 3, 1);

        const startOfWeek = new Date(aprilFirst);
        startOfWeek.setDate(aprilFirst.getDate() - aprilFirst.getDay());
        startOfWeek.setHours(0, 0, 0, 0);

        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59, 999);

        return now >= startOfWeek && now <= endOfWeek;
    };

    const generateChat = () => {
        if (allPlayers.length === 0) return;

        const randomTemplate = CHAT_TEMPLATES[Math.floor(Math.random() * CHAT_TEMPLATES.length)];

        const message = randomTemplate.replace(/{name}/g, () => {
            const randomPlayer = allPlayers[Math.floor(Math.random() * allPlayers.length)].name;
            return randomPlayer;
        });

        const newChat = { id: Date.now() + Math.random(), message };
        setChats(prev => [...prev.slice(-9), newChat]);
    };

    useEffect(() => {
        if (!isAprilFoolsWeek()) return;

        const interval = setInterval(() => {
            generateChat();
        }, Math.random() * 2000 + 800);

        return () => clearInterval(interval);
    }, [allPlayers]);

    if (!isAprilFoolsWeek()) return null;

    return (
        <ChatSideContainer className="right">
            {chats.map(chat => (
                <ChatBubble key={chat.id}>
                    {chat.message}
                </ChatBubble>
            ))}
        </ChatSideContainer>
    );
};
