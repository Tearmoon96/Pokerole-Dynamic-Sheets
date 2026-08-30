# Media

Screen recordings used by the README on `main`, and nothing else.

Orphan on purpose, the same way `dev-data` is. Both release zips are built from
git refs — the clean one from `main`, the developer one from `main` with
`dev-data` laid over it — so nothing kept on this branch can reach a download of
the app, and a normal clone of `main` never pulls it either.

`main`'s README links these as

    https://raw.githubusercontent.com/Tearmoon96/Pokerole-Dynamic-Sheets/media/<file>

so renaming a file here breaks the link that points at it.
