#!/usr/bin/env bash
#
# Build and publish a Pokerole Dynamic Sheets release.
#
# Every release carries two zips:
#
#   Pokerole-Dynamic-Sheets-<tag>.zip            the app — what users want
#   Pokerole-Dynamic-Sheets-<tag>-developer.zip  the app plus the raw dataset
#                                                and the build scripts
#
# Both are built from git refs, never from the working tree. That is the whole
# point: anything gitignored — your own trainer .json files above all — cannot
# reach a release even if it is sitting in the folder while this runs.
#
# Usage:
#   tools/make-release.sh v1.0.8 --notes-file notes.md
#   tools/make-release.sh v1.0.8 --notes "Fixed the thing." --dry-run
#
# Run it from a checkout that has both `main` and `dev-data`.

set -euo pipefail

die() { printf '%s\n' "$*" >&2; exit 1; }

# ---- arguments ------------------------------------------------------------

tag=""; notes=""; notes_file=""; dry_run=0

while [ $# -gt 0 ]; do
    case "$1" in
        --notes)      notes="${2:-}"; shift 2 ;;
        --notes-file) notes_file="${2:-}"; shift 2 ;;
        --dry-run)    dry_run=1; shift ;;
        -h|--help)    sed -n '3,19p' "$0" | sed 's/^#\{1,\} \{0,1\}//'; exit 0 ;;
        -*)           die "unknown option: $1" ;;
        *)            [ -z "$tag" ] || die "tag given twice: $tag and $1"
                      tag="$1"; shift ;;
    esac
done

[ -n "$tag" ] || die "usage: tools/make-release.sh v1.2.3 [--notes-file FILE] [--dry-run]"
case "$tag" in
    v[0-9]*) ;;
    *) die "tag must look like v1.2.3, got: $tag" ;;
esac

cd "$(git rev-parse --show-toplevel)" || die "not inside a git repository"

git rev-parse --verify --quiet main     >/dev/null || die "no 'main' branch here"
git rev-parse --verify --quiet dev-data >/dev/null || die "no 'dev-data' branch here — the developer zip needs it"

# ---- the guard that keeps the update check honest -------------------------
#
# trainer-license.html compares its own APP_VERSION against the newest release
# tag. Ship a tag ahead of APP_VERSION and every single person who downloads
# this release is told, forever, that a newer one exists. Releases v1.0.4,
# v1.0.6 and v1.0.7 all shipped one version behind their tag. Never again.

want="${tag#v}"
have="$(git show main:app-data/version.js \
        | sed -n "s/.*APP_VERSION *= *'\([^']*\)'.*/\1/p")"

[ -n "$have" ] || die "could not read APP_VERSION out of main:app-data/version.js"

if [ "$want" != "$have" ]; then
    die "version mismatch — refusing to publish.

  tag asks for : $want
  main ships   : $have

Bump APP_VERSION in app-data/version.js to $want, commit it to main, push, and
run this again. Publishing as-is would show a permanent false 'update
available' dot to everyone who downloads $tag."
fi

# The release tags main on the remote, so main has to be there already. A dry
# run publishes nothing, so let it build the zips for inspection first — that
# is usually what you want to do *before* pushing.
if [ "$dry_run" -eq 0 ] && git rev-parse --verify --quiet origin/main >/dev/null; then
    if [ "$(git rev-parse main)" != "$(git rev-parse origin/main)" ]; then
        die "main and origin/main differ — push main first, or the release tag
will point at a commit GitHub does not have."
    fi
fi

repo="$(git show main:app-data/version.js \
        | sed -n "s/.*APP_REPO *= *'\([^']*\)'.*/\1/p")"
[ -n "$repo" ] || die "could not read APP_REPO out of main:app-data/version.js"

# ---- build ----------------------------------------------------------------
#
# dist/ lives inside the project on purpose: gh runs on the host through
# host-spawn, and the host cannot see the sandbox's /tmp.

dist="dist"
prefix="Pokerole Dynamic Sheets/"
clean_zip="$dist/Pokerole-Dynamic-Sheets-$tag.zip"
dev_zip="$dist/Pokerole-Dynamic-Sheets-$tag-developer.zip"

rm -rf "$dist"; mkdir -p "$dist"

printf 'Building %s ...\n' "$clean_zip"
git archive --format=zip --prefix="$prefix" -o "$clean_zip" main

# The developer tree is main with dev-data laid over it. Build it as a tree
# object in a scratch index rather than extracting 330 MB to disk twice: read
# main in, then let dev-data's entries add to and overwrite it. The icons both
# branches carry are the same blobs, so the overlap costs nothing.
#
# -z throughout: icon paths contain spaces ("Adventuring Gear/Abacus.svg"), and
# without it git quotes them and update-index reads back the wrong names.
printf 'Building %s ...\n' "$dev_zip"

tmp_index="$(mktemp -u -t pds-index.XXXXXX)"
trap 'rm -f "$tmp_index"' EXIT

dev_tree="$(
    export GIT_INDEX_FILE="$tmp_index"
    git read-tree main
    git ls-tree -r -z dev-data | git update-index -z --index-info
    git write-tree
)"

git archive --format=zip --prefix="$prefix" -o "$dev_zip" "$dev_tree"

printf '\n  %s  %s\n' "$(du -h "$clean_zip" | cut -f1)" "$clean_zip"
printf '  %s  %s\n\n'  "$(du -h "$dev_zip"   | cut -f1)" "$dev_zip"

# ---- release notes --------------------------------------------------------
#
# The "which download?" block is prepended here rather than left to whoever
# writes the notes, so it cannot be forgotten. GitHub also attaches its own
# "Source code" archives, built from main and therefore identical to the clean
# zip — the block says so, so nobody has to guess which of the three to take.

body="$dist/notes.md"
{
    printf '### Which download?\n\n'
    printf '**`Pokerole-Dynamic-Sheets-%s.zip`** — this is the one you want. Unzip it, open `trainer-license.html`, done.\n\n' "$tag"
    printf '`Pokerole-Dynamic-Sheets-%s-developer.zip` additionally contains the raw Pokerole dataset and the Python scripts that compile it into the `app-data/*-db.js` bundles. Nothing in it is needed to use the app.\n\n' "$tag"
    printf 'The "Source code" archives GitHub adds below are built from `main`, so they hold the same files as the clean zip.\n\n'
    printf -- '---\n\n'
    if [ -n "$notes_file" ]; then
        [ -f "$notes_file" ] || die "no such notes file: $notes_file"
        cat "$notes_file"
    elif [ -n "$notes" ]; then
        printf '%s\n' "$notes"
    fi
} > "$body"

# ---- publish --------------------------------------------------------------
#
# The clean zip is listed first so it uploads first, which is the order the
# release page shows assets in.

set -- gh release create "$tag" \
        --repo "$repo" --target main --title "$tag" \
        --notes-file "$body" \
        "$clean_zip" "$dev_zip"

if [ "$dry_run" -eq 1 ]; then
    printf 'Dry run — zips are in %s/, nothing published. Would run:\n\n  /app/bin/host-spawn --no-pty %s\n' "$dist" "$*"
    exit 0
fi

printf 'Publishing %s to %s ...\n' "$tag" "$repo"
/app/bin/host-spawn --no-pty "$@"

printf '\nDone. Fetching the new tag locally:\n'
/app/bin/host-spawn --no-pty git fetch --tags origin
