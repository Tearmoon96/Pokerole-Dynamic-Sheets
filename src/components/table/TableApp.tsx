/* The page. Three gates, then the table. */

import { useTable } from '../../table/TableContext';
import { isHostedOrigin } from '../../data/paths';
import { cryptoAvailable } from '../../table/crypto';
import { JoinScreen } from './JoinScreen';
import { OfflineNotice } from './OfflineNotice';
import { TableView } from './TableView';

export function TableApp() {
    const { state } = useTable();

    /* Opened from the disk: say so, rather than fail inside a socket. */
    if (!isHostedOrigin()) return <OfflineNotice />;

    /* WebCrypto only exists in a secure context. https and localhost qualify;
       plain http from another machine on the network does not, and every
       derivation on this page would throw on an undefined `crypto.subtle`. */
    if (!cryptoAvailable()) {
        return (
            <OfflineNotice reason={
                'This page needs a secure connection (https) for the encryption the '
                + 'table is built on, and this one is plain http.'
            } />
        );
    }

    return state.phase === 'live' ? <TableView /> : <JoinScreen />;
}
