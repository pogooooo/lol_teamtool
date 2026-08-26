import 'styled-components';

declare module 'styled-components' {
    export interface DefaultTheme {
        mode: 'light' | 'dark';
        body: string;
        text: string;
        card: string;
        cardBorder: string;
        placeholder: string;
        dragOver: string;
        nameBg: string;
        nameText: string;
        white: string;
        contextMenu: string;
        contextMenuBorder: string;
        accent: string;
        accentGradient: string;
        accentText: string;
        teamBlue: string;
        teamRed: string;
        grass1: string;
        grass2: string;
        grass3: string;
    }
}
