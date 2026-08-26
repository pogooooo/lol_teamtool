import { gsap } from 'gsap';

/*
 * 승리 연출 — GSAP로 무대 위에 금화 파티클을 터뜨린다.
 * 배당 배율이 클수록 파티클이 많아진다 (잭팟이면 화면이 반짝인다).
 */
export const winBurst = (host: HTMLElement, multiplier = 2) => {
    const rect = host.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const count = Math.min(36, 10 + Math.round(multiplier * 2.5));

    const cleanup: HTMLElement[] = [];
    for (let i = 0; i < count; i += 1) {
        const p = document.createElement('span');
        const gold = i % 3 !== 0;
        const size = 5 + Math.random() * 6;
        p.style.cssText = `
            position:absolute; left:${cx}px; top:${cy}px; width:${size}px; height:${size}px;
            border-radius:50%; pointer-events:none; z-index:5;
            background: radial-gradient(circle at 32% 28%, ${gold ? '#FFF3C4, #C9A044 75%' : '#FFFFFF, #E08170 75%'});
            box-shadow: 0 1px 2px rgba(60,42,10,0.4);
        `;
        host.appendChild(p);
        cleanup.push(p);

        const angle = Math.random() * Math.PI * 2;
        const dist = 50 + Math.random() * Math.min(150, rect.width / 2.4);
        gsap.fromTo(p,
            { x: 0, y: 0, scale: 0.4, opacity: 1 },
            {
                x: Math.cos(angle) * dist,
                y: Math.sin(angle) * dist * 0.75 - 24,
                scale: 1,
                duration: 0.55 + Math.random() * 0.3,
                ease: 'power2.out',
            });
        // 흩어진 뒤 중력에 이끌려 떨어지며 사라진다
        gsap.to(p, {
            y: `+=${60 + Math.random() * 50}`,
            opacity: 0,
            duration: 0.6,
            delay: 0.5 + Math.random() * 0.25,
            ease: 'power2.in',
            onComplete: () => p.remove(),
        });
    }
    // 혹시 남으면 정리
    setTimeout(() => cleanup.forEach(p => p.parentElement && p.remove()), 2500);
};
