-- Seed the global source catalog (owner_id is null).
--
-- 'other' is inserted first: custom user sources reference it via
-- parent_slug, so the FK target must exist before any of them are created.
--
-- Idempotent — safe to re-run and safe on a branch rebase.

insert into public.sources (owner_id, slug, name, base_url, sort_order) values
  (null, 'other',      'Other',          null,                                 999),
  (null, 'webtoon',    'WEBTOON',        'https://www.webtoons.com',            10),
  (null, 'tapas',      'Tapas',          'https://tapas.io',                    20),
  (null, 'mangaplus',  'MANGA Plus',     'https://mangaplus.shueisha.co.jp',    30),
  (null, 'mangadex',   'MangaDex',       'https://mangadex.org',                40),
  (null, 'tappytoon',  'Tappytoon',      'https://www.tappytoon.com',           50),
  (null, 'lezhin',     'Lezhin Comics',  'https://www.lezhinus.com',            60),
  (null, 'manta',      'Manta',          'https://manta.net',                   70),
  (null, 'kakaopage',  'Kakao Page',     'https://page.kakao.com',              80),
  (null, 'viz',        'VIZ Media',      'https://www.viz.com',                 90),
  (null, 'kmanga',     'K MANGA',        'https://kmanga.kodansha.com',        100),
  (null, 'inkr',       'INKR',           'https://comics.inkr.com',            110),
  (null, 'physical',   'Physical Copy',  null,                                 900)
on conflict (slug) do nothing;
