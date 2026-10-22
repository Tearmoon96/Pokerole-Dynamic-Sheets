/* One tab per table in each browser.

   Every tab of a browser profile is the same person at a table: the same keys
   (identity.ts), the same saved session. A second tab at the same table used
   to be a second, complete copy of that person — for the GM, two hosts, each
   blind to what the other did (a page drops what its own key signed) and both
   answering everything: a player's request rolled twice, the Map Maker's
   pictures uploaded twice, two maps and two sets of music fighting over the
   players' screens.

   So a tab at a table holds a Web Lock named after it. The newest tab takes
   it — opening the table again means using it there, and a reload is the
   same thing, asked while the page being reloaded may still hold the lock —
   and the tab it was taken from stands down (`movedAway` in session.ts). */

const PREFIX = 'pds-table-';

export class TabLock {
    private release: (() => void) | null = null;
    /** Bumped by every take and drop, so losing a hold this tab gave up
        itself is not mistaken for another tab taking it. */
    private gen = 0;

    /** Holds the table for this tab, taking it from any other tab of this
        browser. `lost` runs if another tab takes it later. A browser with no
        Web Locks just goes ahead, as every tab did before. */
    take(lobbyId: string, lost: () => void): Promise<void> {
        this.drop();
        const locks = (navigator as Navigator & { locks?: LockManager }).locks;
        if (!locks) return Promise.resolve();
        const my = this.gen;
        let held = false;
        return new Promise<void>((done) => {
            locks.request(PREFIX + lobbyId, { steal: true }, () => new Promise<void>((release) => {
                held = true;
                done();
                if (my === this.gen) this.release = release;
                else release();
            })).catch(() => {
                done();
                /* Rejected after it was held: another tab stole it. Before,
                   there was no lock to be had, which is no reason to stand down. */
                if (!held || my !== this.gen) return;
                this.release = null;
                lost();
            });
        });
    }

    drop(): void {
        this.gen++;
        const release = this.release;
        this.release = null;
        release?.();
    }
}
