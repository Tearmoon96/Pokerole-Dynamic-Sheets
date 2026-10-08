import { useEffect, useMemo, useState } from 'react';
import { useAppData } from '../../data/AppDataContext';
import { copyText } from '../table/copy';
import { issuesForAssistant, parseRecipe, recipeSummary, speciesFinder } from '../../map/recipe';
import type { ParseResult, RecipeMap } from '../../map/recipe';

/** A pasted reply, parsed as it is typed. `base` is what the recipe does not
    say for itself: the form's settings for a new map, the map itself to add to. */
export function useParsedRecipe(reply: string, mode: 'new' | 'add', base: RecipeMap) {
    const { data } = useAppData();
    const finder = useMemo(() => (data.pokemon.length ? speciesFinder(data.pokemon) : undefined), [data.pokemon]);
    const parsed = useMemo(
        () => (reply.trim() ? parseRecipe(reply, { mode, base, species: finder }) : null),
        /* `base` is rebuilt every render; its content is what matters. */
        [reply, mode, finder, JSON.stringify(base)],
    );
    const errors = parsed?.issues.filter((i) => i.level === 'error').length ?? 0;
    const recipe = parsed?.recipe ?? null;
    const empty = !!recipe && !recipe.terrain.length && !recipe.paths.length && !recipe.landmarks.length
        && !recipe.labels.length && !recipe.tokens.length;
    return { parsed, recipe, errors, empty };
}

/** What a pasted reply came to: its size and contents, and what cannot be
    used, which copies back to the assistant as a request for a corrected one. */
export function RecipeCheck({ parsed, errors }: { parsed: ParseResult; errors: number }) {
    const [copied, setCopied] = useState<'' | 'ok' | 'failed'>('');
    useEffect(() => setCopied(''), [parsed]);
    const recipe = parsed.recipe;
    return (
        <div className="map-recipe-check">
            {recipe && (
                <p className={'map-recipe-note ' + (errors ? 'warn' : 'ok')}>
                    <i className={'fa-solid ' + (errors ? 'fa-triangle-exclamation' : 'fa-check')}></i>{' '}
                    {recipe.map.cols}×{recipe.map.rows} · {recipeSummary(recipe)}
                    {errors ? ` · ${errors} item${errors === 1 ? '' : 's'} cannot be used` : ''}
                </p>
            )}
            {parsed.issues.length > 0 && (
                <>
                    <ul className="map-recipe-issues">
                        {parsed.issues.map((i, k) => (
                            <li key={k} className={i.level}>
                                <code>{i.where}</code> {i.message}
                            </li>
                        ))}
                    </ul>
                    <button
                        className="map-recipe-copy-issues"
                        onClick={async () => setCopied((await copyText(issuesForAssistant(parsed.issues))) ? 'ok' : 'failed')}
                    >
                        <i className="fa-solid fa-reply"></i> Copy these for the assistant
                    </button>
                    {copied === 'ok' && <span className="map-recipe-note ok inline"> Copied. Paste it into the same chat for a corrected recipe.</span>}
                    {copied === 'failed' && <span className="map-recipe-note bad inline"> Could not reach the clipboard.</span>}
                </>
            )}
        </div>
    );
}
