# Graph Report - hackfinding  (2026-10-23)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 1109 nodes · 2680 edges · 77 communities (47 shown, 30 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 82 edges (avg confidence: 0.9)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `aa308bf5`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10
- Community 11
- Community 12
- Community 13
- Community 14
- Community 15
- Community 16
- Community 17
- Community 18
- Community 19
- Community 20
- Community 21
- Community 22
- Community 23
- Community 24
- Community 25
- Community 26
- Community 27
- Community 28
- Community 29
- Community 30
- Community 31
- Community 32
- Community 33
- Community 34
- Community 35
- Community 36
- Community 37
- Community 38
- Community 39
- Community 40
- Community 41
- Community 42
- Community 43
- Community 44
- Community 45
- Community 46
- Community 47
- Community 48
- Community 49
- Community 50
- Community 51
- Community 52
- Community 53
- Community 72

## God Nodes (most connected - your core abstractions)
1. `registerAuthRoutes()` - 47 edges
2. `query()` - 37 edges
3. `Digest` - 27 edges
4. `PoliteClient` - 27 edges
5. `EventRecord` - 26 edges
6. `vitest` - 24 edges
7. `DigestItem` - 23 edges
8. `react` - 23 edges
9. `AIError` - 22 edges
10. `keyFromEnv()` - 19 edges

## Surprising Connections (you probably didn't know these)
- `Recorder` --uses--> `Digest`  [INFERRED]
  tests/test_user_digest.py → pipeline/digest.py
- `test_failing_sender_logs_no_webhook_token()` --uses--> `Digest`  [INFERRED]
  tests/test_user_digest.py → pipeline/digest.py
- `test_client_error_and_bad_shape_raise()` --uses--> `AIError`  [INFERRED]
  tests/test_ai.py → pipeline/ai/base.py
- `test_gives_up_after_retries()` --uses--> `AIError`  [INFERRED]
  tests/test_ai.py → pipeline/ai/base.py
- `test_missing_key_and_unknown_provider()` --uses--> `AIError`  [INFERRED]
  tests/test_ai.py → pipeline/ai/base.py

## Import Cycles
- None detected.

## Communities (77 total, 30 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (41): AIError, Provider, Groq, get_provider(), build_user_prompt(), clean(), Enriched, EventText (+33 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (32): blind_index(), decrypt(), key_from_env(), EmailError, send_digest(), sender_for(), send(), unsubscribe_token() (+24 more)

### Community 2 - "Community 2"
Cohesion: 0.11
Nodes (28): _deliver(), enabled_kinds(), items_for(), run(), _last_sent_at(), _place_clause(), Recipient, recipients() (+20 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (37): Channel, ContactView, Kind, Level, MessageType, Prefs, gotrue(), Mode (+29 more)

### Community 4 - "Community 4"
Cohesion: 0.11
Nodes (31): checkKey(), decrypt(), encrypt(), keyFromEnv(), isDiscordWebhook(), CHANNELS, ContactInput, DEFAULT_PREFS (+23 more)

### Community 5 - "Community 5"
Cohesion: 0.11
Nodes (23): Candidate, dedupe_events(), find_groups(), is_duplicate(), _load(), merge(), words(), claim_send() (+15 more)

### Community 6 - "Community 6"
Cohesion: 0.10
Nodes (16): apply_schema(), close_past_events(), close_unlisted_events(), connect(), _event_values(), finish_run(), start_run(), main() (+8 more)

### Community 7 - "Community 7"
Cohesion: 0.15
Nodes (21): pg, vitest, activeSchema(), closePool(), getPool(), Q, query(), transaction() (+13 more)

### Community 8 - "Community 8"
Cohesion: 0.13
Nodes (17): EventBase, EventDetail, EventRow, Place, EventsQuery, fetchEvents(), fetchPlaces(), get() (+9 more)

### Community 9 - "Community 9"
Cohesion: 0.17
Nodes (26): deleteAccount(), revokeSessions(), errTag(), isJson(), originFor(), readBody(), redirect(), registerAuthRoutes() (+18 more)

### Community 10 - "Community 10"
Cohesion: 0.11
Nodes (14): load(), distance_km(), geocode_events(), _key(), near_cities(), resolve(), sync_places(), _table() (+6 more)

### Community 11 - "Community 11"
Cohesion: 0.13
Nodes (7): EventRecord, team_size_text(), Source, parse(), _ts(), test_content_hash_ignores_raw(), test_content_hash_ignores_registration_count()

### Community 12 - "Community 12"
Cohesion: 0.16
Nodes (18): buildPrompt(), chatgptUrl(), claudeUrl(), clean(), KIND_LABEL, KIND_WORD, MAX_URL_LEN, MODE_LABEL (+10 more)

### Community 13 - "Community 13"
Cohesion: 0.12
Nodes (12): DigestItem, format_deadline(), _item_block(), CapReached, _item_line(), short_text(), WhatsAppError, WhatsAppSender (+4 more)

### Community 14 - "Community 14"
Cohesion: 0.09
Nodes (13): react, AccountActions(), run(), call(), IconName, IconProps, PATHS, TEXT_FACES (+5 more)

### Community 15 - "Community 15"
Cohesion: 0.18
Nodes (20): cleanDisplayName(), finishEmailLogin(), grantAdminIfListed(), MAX_TOKENS_PER_IP_PER_HOUR, normaliseEmail(), peekEmailToken(), PublicUser, recordLogin() (+12 more)

### Community 16 - "Community 16"
Cohesion: 0.19
Nodes (14): registerAdminRoutes(), findUser(), sessionFromRequest(), sessionSecret(), addRoute(), error(), Handler, json() (+6 more)

### Community 17 - "Community 17"
Cohesion: 0.18
Nodes (20): event_sources, event_sources_event_idx, events, events_reg_deadline_idx, events_status_idx, events_title_trgm_idx, login_tokens, login_tokens_ip_idx (+12 more)

### Community 18 - "Community 18"
Cohesion: 0.22
Nodes (18): format_item(), render(), _section(), trust_flags(), digest(), item(), test_deadline_shows_time_only_when_known(), test_format_item_escapes_markdown_and_shows_details() (+10 more)

### Community 19 - "Community 19"
Cohesion: 0.16
Nodes (8): react-router, NavProps, RequireMe(), Me, MeState, signInHref(), useMe(), Admin()

### Community 20 - "Community 20"
Cohesion: 0.18
Nodes (10): Digest, escape(), build_message(), _meta(), render_body(), render_html(), _row(), _safe_url() (+2 more)

### Community 21 - "Community 21"
Cohesion: 0.18
Nodes (8): clean_prize(), ist_day_start(), parse_date_range(), parse(), test_clean_prize(), test_ist_day_start(), test_parse_date_range(), test_parse_date_range_unknown()

### Community 22 - "Community 22"
Cohesion: 0.18
Nodes (13): clearSessionCookie(), readSession(), sessionCookie(), sign(), signSession(), cookie(), ENV, newUser() (+5 more)

### Community 23 - "Community 23"
Cohesion: 0.24
Nodes (11): RobotsDisallowed, Devpost, load_fixture(), make_client(), test_paginates_until_total_count(), test_parses_real_fixture(), handler(), test_respects_robots_disallow() (+3 more)

### Community 24 - "Community 24"
Cohesion: 0.24
Nodes (15): upsert_events(), _assert_new_shape(), _columns(), rec(), status(), test_close_past_events_keeps_today_open(), test_close_unlisted_waits_for_grace_and_ignores_unhealthy_sources(), test_dedupe_merges_across_sources_and_keeps_both_urls() (+7 more)

### Community 25 - "Community 25"
Cohesion: 0.18
Nodes (9): entry_fee(), parse(), prize_total(), _ts(), Unstop, fetch_with(), test_paginates_by_last_page_and_dedupes(), test_parses_real_fixture() (+1 more)

### Community 26 - "Community 26"
Cohesion: 0.12
Nodes (3): lenis, App(), raf()

### Community 27 - "Community 27"
Cohesion: 0.25
Nodes (14): base(), escapeLike(), EventFilter, getEvent(), getPlace(), iso(), Kind, listEvents() (+6 more)

### Community 29 - "Community 29"
Cohesion: 0.22
Nodes (8): is_discord_webhook(), redact(), test_accepts_discord_webhooks(), test_redact_handles_case_and_encoding(), test_redact_hides_callmebot_key(), test_redact_hides_token_in_text(), test_rejects_anything_else(), test_rejects_non_canonical_forms()

### Community 30 - "Community 30"
Cohesion: 0.22
Nodes (8): _sender(), test_http_error_raises_without_phone_or_key(), test_per_run_cap_stops_sends_without_a_request(), test_sends_one_get_with_phone_key_and_text(), handler(), test_short_text_when_nothing_is_new_says_so(), test_text_is_truncated_to_the_limit(), test_transport_error_raises_without_phone_or_key()

### Community 31 - "Community 31"
Cohesion: 0.13
Nodes (14): canvas-confetti, @types/canvas-confetti, @types/node, @types/nodemailer, @types/pg, @types/react, @types/react-dom, typescript (+6 more)

### Community 32 - "Community 32"
Cohesion: 0.27
Nodes (14): event_sources, event_sources_event_idx, events, events_reg_deadline_idx, events_status_idx, events_title_trgm_idx, preferences, reminders_sent (+6 more)

### Community 33 - "Community 33"
Cohesion: 0.21
Nodes (5): build(), items(), last_digest_at(), _near_cities(), send_digest()

### Community 34 - "Community 34"
Cohesion: 0.14
Nodes (13): compilerOptions, forceConsistentCasingInFileNames, isolatedModules, jsx, lib, module, moduleResolution, noEmit (+5 more)

### Community 35 - "Community 35"
Cohesion: 0.17
Nodes (4): ConfirmSignIn(), SignIn(), State, Unsubscribe()

### Community 36 - "Community 36"
Cohesion: 0.24
Nodes (10): authorizeUrl(), cleanName(), exchangeCode(), GOOGLE_COOKIE_PATH, googleConfigured(), ENV, fakeGoogle(), jsonRes() (+2 more)

### Community 37 - "Community 37"
Cohesion: 0.38
Nodes (9): barPct(), MONTHS, niceMax(), shortDay(), Dashboard(), Load, SignInChart(), Stats() (+1 more)

### Community 39 - "Community 39"
Cohesion: 0.18
Nodes (11): devDependencies, @types/canvas-confetti, @types/node, @types/nodemailer, @types/pg, @types/react, @types/react-dom, typescript (+3 more)

### Community 40 - "Community 40"
Cohesion: 0.27
Nodes (9): cleanName(), supabaseConfig(), verifySupabaseToken(), ENV, fakeSupabase(), jsonRes(), post(), saved (+1 more)

### Community 41 - "Community 41"
Cohesion: 0.40
Nodes (7): Devfolio, by_slug(), fetch(), test_fetch_follows_pages_and_skips_bad_items(), test_in_person_event_maps_real_registration_deadline(), test_online_event_has_no_place_and_state_is_the_city_fallback(), test_organiser_email_is_never_stored()

### Community 44 - "Community 44"
Cohesion: 0.32
Nodes (4): react-dom, animateFavicon(), FACES, icon()

### Community 45 - "Community 45"
Cohesion: 0.25
Nodes (3): vite, @vitejs/plugin-react, __dirname

### Community 46 - "Community 46"
Cohesion: 0.50
Nodes (7): nodemailer, escapeAttr(), from(), layout(), sendLoginEmail(), sendWelcomeEmail(), transport()

### Community 47 - "Community 47"
Cohesion: 0.25
Nodes (8): dependencies, canvas-confetti, lenis, nodemailer, pg, react, react-dom, react-router

### Community 48 - "Community 48"
Cohesion: 0.38
Nodes (5): login_tokens, logins, logins_at_idx, places, users_email_hash_key

### Community 49 - "Community 49"
Cohesion: 0.60
Nodes (4): mac(), readUnsubscribeToken(), unsubscribeToken(), post()

### Community 50 - "Community 50"
Cohesion: 0.40
Nodes (5): scripts, build, dev, preview, test

## Knowledge Gaps
- **8 isolated node(s):** `@types/canvas-confetti`, `@types/node`, `@types/nodemailer`, `@types/pg`, `@types/react` (+3 more)
  These have ≤1 connection - possible missing edges. (Counts symbols only; 373 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **30 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `Community 7` to `Community 3`, `Community 4`, `Community 37`, `Community 36`, `Community 40`, `Community 9`, `Community 12`, `Community 45`, `Community 15`, `Community 16`, `Community 49`, `Community 19`, `Community 22`, `Community 31`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._
- **Are the 10 inferred relationships involving `Digest` (e.g. with `render()` and `build_message()`) actually correct?**
  _`Digest` has 10 INFERRED edges - model-reasoned connections that need verification._
- **What connects `@types/canvas-confetti`, `@types/node`, `@types/nodemailer` to the rest of the system?**
  _8 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05822784810126582 - nodes in this community are weakly interconnected._
- **Why does `react` connect `Community 14` to `Community 3`, `Community 35`, `Community 37`, `Community 38`, `Community 8`, `Community 44`, `Community 12`, `Community 19`, `Community 26`, `Community 31`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `PoliteClient` (e.g. with `Devfolio` and `Devpost`) actually correct?**
  _`PoliteClient` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.061057692307692306 - nodes in this community are weakly interconnected._