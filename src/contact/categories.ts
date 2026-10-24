/* The three kinds of post, and the form each one asks for.

   A post made on github.com through .github/ISSUE_TEMPLATE/ (on `main`) gets
   its label from the template. A post made here cannot set one — GitHub drops
   labels sent by anyone without push access — so its body carries a marker
   instead, and .github/workflows/contact-labels.yml (also on `main`) turns
   the marker into the label. Until that runs the marker is what sorts it, so
   a post shows in its tab the moment it is sent.

   The fields here and the templates' fields are the same questions under the
   same headings, so a post reads alike whichever way it was written. */

export type CategoryId = 'bug' | 'suggestion' | 'request';

export interface Field {
    id: string;
    label: string;
    kind: 'text' | 'textarea' | 'select';
    required?: boolean;
    placeholder?: string;
    hint?: string;
    options?: string[];
}

export interface Category {
    id: CategoryId;
    /** The tab's name. */
    name: string;
    /** One of the post, for buttons ("Write a bug report"). */
    one: string;
    icon: string;
    label: string;
    template: string;
    lede: string;
    titleHint: string;
    fields: Field[];
}

export const PAGES_ASKED = [
    "Trainer's License", 'Pokémon Card', 'GM Screen', 'Map Maker', 'Rolling Table',
    'Contact Center', 'Several / all of them', 'Other',
];

export const CATEGORIES: Category[] = [
    {
        id: 'bug',
        name: 'Bug reports',
        one: 'bug report',
        icon: 'fa-bug',
        label: 'bug',
        template: 'bug.yml',
        lede: 'Something broken, wrong or confusing in the tools.',
        titleHint: 'e.g. "PC box names reset after a reload"',
        fields: [
            { id: 'page', label: 'Page', kind: 'select', required: true, options: PAGES_ASKED },
            {
                id: 'what', label: 'What happened?', kind: 'textarea', required: true,
                placeholder: 'What you saw, and what you expected to see instead.',
            },
            {
                id: 'steps', label: 'Steps to reproduce', kind: 'textarea',
                placeholder: '1. Open the GM Screen\n2. Add a wild Pokémon\n3. …',
            },
            {
                id: 'browser', label: 'Browser and device', kind: 'text',
                placeholder: 'e.g. Chrome on Windows, Safari on an iPhone',
                hint: 'Filled in from this browser; change it if the bug was somewhere else.',
            },
        ],
    },
    {
        id: 'suggestion',
        name: 'Suggestions',
        one: 'suggestion',
        icon: 'fa-lightbulb',
        label: 'suggestion',
        template: 'suggestion.yml',
        lede: 'An idea to make something that exists better.',
        titleHint: 'e.g. "Sort the bag by item type"',
        fields: [
            { id: 'page', label: 'Page', kind: 'select', required: true, options: PAGES_ASKED },
            {
                id: 'idea', label: 'Your idea', kind: 'textarea', required: true,
                placeholder: 'What would change, and how it would work.',
            },
            {
                id: 'why', label: 'Why it would help', kind: 'textarea',
                placeholder: 'The situation at the table where you missed it.',
            },
        ],
    },
    {
        id: 'request',
        name: 'Requests',
        one: 'request',
        icon: 'fa-hand-sparkles',
        label: 'request',
        template: 'request.yml',
        lede: 'Something new: a feature, a page, a homebrew option.',
        titleHint: 'e.g. "A shop page for the GM"',
        fields: [
            {
                id: 'want', label: 'What would you like?', kind: 'textarea', required: true,
                placeholder: 'Describe the feature or the content you are asking for.',
            },
            {
                id: 'details', label: 'Details', kind: 'textarea',
                placeholder: 'Examples, rules from the book, pictures of how you imagine it…',
            },
        ],
    },
];

export const categoryById = (id: string): Category | undefined => CATEGORIES.find((c) => c.id === id);

const MARKER = /<!--\s*pds-contact:(bug|suggestion|request)\s*-->/;

export const markerFor = (id: CategoryId): string => '<!-- pds-contact:' + id + ' -->';

/** Which tab a post belongs in: its label, else the marker this page wrote. */
export function categoryOf(labels: string[], body: string | null | undefined): CategoryId | null {
    for (const c of CATEGORIES) if (labels.includes(c.label)) return c.id;
    const m = MARKER.exec(body ?? '');
    return m ? (m[1] as CategoryId) : null;
}

/** The body GitHub's issue forms would write: a heading per question, and
    "_No response_" for one left empty. The marker goes last. */
export function buildBody(cat: Category, values: Record<string, string>): string {
    const parts = cat.fields.map((f) => {
        const v = (values[f.id] ?? '').trim();
        return '### ' + f.label + '\n\n' + (v || '_No response_');
    });
    return parts.join('\n\n') + '\n\n' + markerFor(cat.id) + '\n';
}

/** The address of GitHub's own form for a category, for a reader who would
    rather write there or cannot sign in here. */
export function templateUrl(repoUrl: string, cat: Category): string {
    return repoUrl + '/issues/new?template=' + encodeURIComponent(cat.template);
}

/** A short guess at the browser, to prefill the bug form. */
export function browserGuess(): string {
    const ua = navigator.userAgent;
    const browser = /Edg\//.test(ua) ? 'Edge'
        : /OPR\//.test(ua) ? 'Opera'
        : /Vivaldi/.test(ua) ? 'Vivaldi'
        : /Firefox\//.test(ua) ? 'Firefox'
        : /Chrome\//.test(ua) ? 'Chrome'
        : /Safari\//.test(ua) ? 'Safari' : 'Unknown browser';
    const os = /iPhone|iPad|iPod/.test(ua) ? 'iOS'
        : /Android/.test(ua) ? 'Android'
        : /Windows/.test(ua) ? 'Windows'
        : /Mac OS X/.test(ua) ? 'macOS'
        : /Linux/.test(ua) ? 'Linux' : 'an unknown system';
    return browser + ' on ' + os;
}

/** Limits GitHub enforces, kept a little under. */
export const MAX_TITLE = 200;
export const MAX_BODY = 60000;
