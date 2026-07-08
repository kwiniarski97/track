# Changelog

## [1.0.1](https://github.com/kwiniarski97/track/compare/v1.0.0...v1.0.1) (2026-07-08)


### Bug Fixes

* add PNG icon sizes required for Android PWA install ([4de2601](https://github.com/kwiniarski97/track/commit/4de260192847e91b257305011d599b84e3c1dfda))

## 1.0.0 (2026-07-08)


### Features

* add "na później" home section for tracked shows with no episodes watched ([5f164f6](https://github.com/kwiniarski97/track/commit/5f164f66deff68fe8d8e7076064be3782c7e8ddc))
* add "na później" section to the profile page ([b650a60](https://github.com/kwiniarski97/track/commit/b650a60e9ae3e051e7735f50c87a84324f1af488))
* add an episode-progress bar to show cards ([a1cf66b](https://github.com/kwiniarski97/track/commit/a1cf66bd91fae676fc46c764063df3c4deeb5b27))
* add audience score to show and movie pages; enforce lint/typecheck via husky pre-commit ([47d3dc6](https://github.com/kwiniarski97/track/commit/47d3dc683efbc3e1f5c9e2c4a9b29faed21f8702))
* add calendar caching, jellyfin-aware polish, and home page recently-watched/new-episode rows ([53077f2](https://github.com/kwiniarski97/track/commit/53077f24216dca7c274d87f8c4903b2dad8d5cf6))
* add confetti burst animation when marking an episode watched ([a4b0737](https://github.com/kwiniarski97/track/commit/a4b0737d5df3c93b4fa8e0743f5352ba925f6999))
* add profile page with watch-time stats and completed lists ([c6a81c9](https://github.com/kwiniarski97/track/commit/c6a81c949457d46af1abd8326442b9d1236281a9))
* add rainbow shimmer sweep to completed show progress bars ([e4a60bd](https://github.com/kwiniarski97/track/commit/e4a60bdcf586ee7575dc59fea509d5dd056d5fb8))
* add sorting to profile show and movie lists ([b64fe37](https://github.com/kwiniarski97/track/commit/b64fe37dd019fd0d16ed4f2290b5bf48ed789ea8))
* cap recently watched at 90 days since last episode ([3053ee7](https://github.com/kwiniarski97/track/commit/3053ee792e5722a0b4511484b1436dd189d710e4))
* gray out posters for dropped shows in the profile view ([436a79e](https://github.com/kwiniarski97/track/commit/436a79e16839ba07095112076ec88b1e49b5da0e))
* retint the app's accent color to match each show's poster ([9e684c6](https://github.com/kwiniarski97/track/commit/9e684c6daa673f811c7301119a436d190d2987f6))
* rework search with per-type queries, sort, pagination, and year filter ([b34f43e](https://github.com/kwiniarski97/track/commit/b34f43ef38df58330878df84c2795a4088e2d58c))
* show newest season first, add episode still/runtime/vote, fix status i18n and tab drift ([93420a6](https://github.com/kwiniarski97/track/commit/93420a63bc15a835a0799936c0cf07e991e8993e))
* split home page watching list into progress-based categories ([325ccf3](https://github.com/kwiniarski97/track/commit/325ccf3df5287bfa60078c38dc675bbfd7238a8a))


### Bug Fixes

* add missing docker env ([7f09c3c](https://github.com/kwiniarski97/track/commit/7f09c3cfb07bbb1fd41a4fd4d4eee759de384935))
* break mobile search form into stacked rows ([0211d00](https://github.com/kwiniarski97/track/commit/0211d0077b2a2eb3be7c139baaf530cb33c88ba1))
* make show/movie back button return to the previous page ([dbc3be4](https://github.com/kwiniarski97/track/commit/dbc3be425c772b0a63c5ac224161ca2aed815158))
* move watched checkboxes to the right of labels ([42078a7](https://github.com/kwiniarski97/track/commit/42078a7d3271c221ab472122c72aad9a3f69e913))
* re-check show completion for renewed shows, not just watching ones ([f6d7b84](https://github.com/kwiniarski97/track/commit/f6d7b84bf508f50ad15cc4d55de1290953d00b29))
* run db migrations automatically on startup ([50cd367](https://github.com/kwiniarski97/track/commit/50cd36747e52bf4e3da00b7b20e825605640bf1f))
* sync show completion status during periodic metadata refresh ([aba773b](https://github.com/kwiniarski97/track/commit/aba773b224cf0c158c653ab895201f288056dab0))
