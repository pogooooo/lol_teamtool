/*
 * 기능 스위치 — 배포 없이 코드 한 줄로 켜고 끄는 곳.
 *
 * MINIGAMES_ENABLED
 *   포인트 미니게임(동전·룰렛·주사위·강타·펜타킬·슬롯) 공개 여부.
 *   라이엇 프로덕션 키 심사 중에는 도박성으로 오인될 수 있어 false로 두고,
 *   "준비 중" 안내만 보여 준다. 승인 후 true로 되돌리면 그대로 복구된다.
 */
export const MINIGAMES_ENABLED = false;

/**
 * 관전자 베팅 공개 여부.
 * 미니게임과 같은 이유로 나중에 꺼야 할 수 있어 별도 스위치로 둔다.
 */
export const BETTING_ENABLED = true;
