import { useLayoutEffect } from 'react';
import { applyTheme } from '../lib/theme';

/** Paint the theme before the browser shows a frame, so the page never flashes
    the previous palette when a trainer with another theme is opened. */
export function useTheme(themeType: string): void {
    useLayoutEffect(() => { applyTheme(themeType); }, [themeType]);
}
