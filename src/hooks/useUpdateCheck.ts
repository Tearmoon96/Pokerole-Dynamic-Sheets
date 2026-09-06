import { useCallback, useEffect, useState } from 'react';
import { checkForUpdate, compareVersions, readUpdateCache, updatesAreManual } from '../lib/updateCheck';
import type { UpdateStamp } from '../lib/updateCheck';

export interface UpdateState {
    /** False on a hosted copy, which updates itself; the UI hides the whole
        update section rather than offering a check that means nothing. */
    enabled: boolean;
    /** The version line in the info modal. */
    current: string;
    /** True when the release on GitHub is strictly newer than this build. */
    newer: boolean;
    latest?: string;
    url: string;
    /** What the "Check now" button shows underneath itself. */
    status: string;
    checking: boolean;
    checkNow: () => Promise<void>;
}

export function useUpdateCheck(appVersion: string, appRepo: string): UpdateState {
    const enabled = updatesAreManual();
    const [stamp, setStamp] = useState<UpdateStamp | null>(() => readUpdateCache());
    const [status, setStatus] = useState('');
    const [checking, setChecking] = useState(false);

    /* Automatic check on load: quiet either way. */
    useEffect(() => {
        if (!enabled || !appVersion || !appRepo) return;
        let live = true;
        checkForUpdate(appVersion, appRepo).then((s) => { if (live && s) setStamp(s); });
        return () => { live = false; };
    }, [enabled, appVersion, appRepo]);

    const newer = enabled && !!(stamp && stamp.latest && appVersion
        && compareVersions(stamp.latest, appVersion) > 0);

    /* The "Check now" button. Unlike the automatic check this one reports
       failure: silence on a button you just pressed reads as broken, not as "no
       news". Disabling the button while the request is in flight is the whole
       rate-limit guard — one click, one request, at human pace. */
    const checkNow = useCallback(async () => {
        setChecking(true);
        setStatus('Checking…');
        let info: UpdateStamp | null = null;
        try {
            info = await checkForUpdate(appVersion, appRepo, true);
            if (info) setStamp(info);
        } finally {
            setChecking(false);
        }
        const isNewer = !!(info && info.latest && appVersion
            && compareVersions(info.latest, appVersion) > 0);
        /* When there's an update the row beside this says so already. */
        setStatus(isNewer ? '' : (info && info.ok) ? 'up-to-date' : "Couldn't reach GitHub");
    }, [appVersion, appRepo]);

    return {
        enabled,
        current: appVersion || '—',
        newer,
        latest: stamp?.latest,
        url: stamp?.url || ('https://github.com/' + appRepo + '/releases/latest'),
        status,
        checking,
        checkNow,
    };
}
