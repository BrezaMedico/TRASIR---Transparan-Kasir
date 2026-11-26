# TRASIR Principal Code Audit & Refactor Execution Blueprint

**Role:** Principal Code Auditor & Architect (Planner) — **READ-ONLY AUDIT DELIVERABLE**  
**Baseline Static Checks (Verified Pre-Edit):**
- `npx tsc --noEmit` — exit `0`
- `npm run lint` (`next lint`) — exit `0` (no warnings or errors)
- Full-stack test script (`package.json`): `npm test` (`node scripts/setup-test-db.mjs && vitest run`)

---

## Non-Negotiable Execution Guardrails & Architectural Invariants

Every Executor batch MUST preserve these invariants **100% intact**:

1. **ZERO SYSTEM REGRESSION**
   - `POST /api/sales` intentionally allows direct checkout **both with and without an active opened shift** (verified in `tests/api-flow.test.ts` scenarios 10–27). **Never** add a mandatory active-shift blocker to `POST /api/sales`.
   - `PEMILIK` and `MANAJER` share operational parity while enforcing strict `PEMILIK` account protection & promotion prevention via `validateRoleManagementAction` (`src/lib/rbac-shared.ts`). `KASIR_GUDANG` equals the exact permission union of `KASIR` + `GUDANG`, and staff roles remain blocked from dashboard/profit/report financials (`canViewFinancials`).
   - Blind Shift (`POST /api/shifts`, `GET /api/shifts`) MUST NEVER expose expected drawer totals, system cash totals, or closing discrepancies to non-admin roles.
   - Preserve `/pengguna` notification/audit `linkUrl` values and sidebar highlight mapping (`src/components/layout/AppShell.tsx:283`).
   - Keep JSON round-trip serialization in `src/lib/queries/catalog.ts` unless every nested `Date` field is explicitly formatted to ISO string, preventing Next.js Server-to-Client Component serialization errors.
2. **ZERO VISUAL DRIFT**
   - Do **NOT** modify Tailwind utility classes, CSS custom properties (`src/app/globals.css`), spacing, layout grids, responsive breakpoints, animations, or typography scale.
3. **ZERO SECURITY DEGRADATION**
   - Keep fail-closed `AUTH_SECRET` (`>= 32` chars) check in `NODE_ENV=production` (`src/lib/auth.ts`), JWT `purpose` isolation, magic-byte `validateProofAttachment` (`src/lib/attachment.ts`), OTP lockouts/replay tracking (`src/lib/rate-limit.ts`), and `tokenVersion` session invalidation.

---

## Batch Execution Dependency Order

1. **Batch 1 — Low-Risk Cleanup & Deduplication (`B1-01` – `B1-04`)**: Removes dead exports and consolidates duplicated server loops/schemas first so Batch 2 and Batch 3 edit single canonical code paths cleanly.
2. **Batch 2 — Bug & Logic Fixes (`B2-01` – `B2-08`)**: Resolves client state, theme persistence, WIB timezone filtering, file upload handling, inventory transfer stock safety, shift handover lookup truncation, and notification scope bugs.
3. **Batch 3 — Security & Concurrency Hardening (`B3-01` – `B3-05`)**: Fixes multi-tenant full-table queries, atomic concurrency claims, PostgreSQL `Serializable` lock enforcement, login timing enumeration, and CSPRNG IDs.

---

## Batch 1: Low-Risk Cleanup & Deduplication

### `B1-01` — Remove Dead Export `parseRequestInitialStock`
- **ID & Priority:** `B1-01` | **Low**
- **Exact Target:** `src/components/produk/types.ts` line `112` (`export function parseRequestInitialStock`)
- **Root Cause:** Vestigial helper left behind after envelope parsing was consolidated into `parseProductRequestEnvelope` in `src/lib/product-request-batch.ts:101`. Repository-wide grep confirms zero callers in `src/` or `tests/`.
- **Surgical Edit Specification:** Delete `export function parseRequestInitialStock(...) { ... }` cleanly from `src/components/produk/types.ts` without disturbing adjacent exported types or helpers.
- **Blast Radius Check:** `git grep -n "parseRequestInitialStock"` across `src/` and `tests/` returns only `src/components/produk/types.ts:112`. Zero downstream consumers.
- **Guardrail Check:** System/UI/Security completely unchanged (unused symbol removal only).
- **Verification Step:** `npm run typecheck; npm run lint`

---

### `B1-02` — Deduplicate Variant & Recipe-Ingredient Creation Helper Across Product Endpoints
- **ID & Priority:** `B1-02` | **Low**
- **Exact Target:**
  - New shared server helper in `src/lib/inventory.ts` (appended after line `202`) or internal helper module `src/lib/product-variants.ts`
  - `src/app/api/products/route.ts` lines `196–286` (`POST`) & lines `490–582` (`PUT`)
  - `src/app/api/product-requests/[id]/review/route.ts` lines `113–212` (`POST`)
  - `src/app/api/product-requests/batch-review/route.ts` lines `110–211` (`POST`)
- **Root Cause:** Four ~60-line loops duplicate identical logic: validating `ing.materialId` belongs to the caller's `roomId`, mapping batch `clientTempId` via `tempIdToProductId`, computing `recipeCost` per variant from ingredient quantities (`Math.round(ing.quantity * mat.costPrice)`), creating `tx.productVariant` with nested `ingredients`, and updating parent `product.costPrice` when computed cost `> 0`.
- **Surgical Edit Specification:** Extract one shared transactional helper `createProductVariantsWithCost(tx, { roomId, productId, stockMethod, productName, variants, tempIdToProductId? })` supporting optional `tempIdToProductId?: Map<string, string>` and preserving each caller's `"CONFLICT:..."` error prefix on missing/cross-room ingredients. Replace the four duplicated blocks with calls to this helper while retaining the exact `include: { variants: { include: { ingredients: { include: { material: true } } } } }` query shape.
- **Blast Radius Check:** Only `products` (`POST`/`PUT`), `product-requests/[id]/review`, and `product-requests/batch-review` create `ProductVariant` / `RecipeIngredient` rows. `Batch 3` item `B3-01` depends on `[id]/review` and `batch-review` sharing cleanly extracted helpers.
- **Guardrail Check:** Multi-tenant `material.roomId !== roomId` check (`CONFLICT:`), recipe HPP calculation, and returned JSON payloads remain byte-compatible. Zero UI changes.
- **Verification Step:** `npm run typecheck; npm test`

---

### `B1-03` — Deduplicate Purchase Item Mapping & Gemini Schema Definitions
- **ID & Priority:** `B1-03` | **Low**
- **Exact Target:**
  - `src/app/api/purchases/route.ts` lines `183` and `265` (`items.map(...)`)
  - `src/lib/gemini.ts` lines `70–294` (`RECEIPT_GEN_SCHEMA`, `RECEIPT_INTERACTION_SCHEMA`, `PRODUCT_BATCH_GEN_SCHEMA`, `PRODUCT_BATCH_INTERACTION_SCHEMA`)
- **Root Cause:**
  1. `purchases/route.ts` repeats identical `items.map((it) => ({ ... }))` object mapping across its `body.id` update branch (L183) and create branch (L265).
  2. `gemini.ts` repeats nested JSON schema properties between `@google/genai` `Schema` configs (`RECEIPT_GEN_SCHEMA` at L70, `PRODUCT_BATCH_GEN_SCHEMA` at L193) and Interactions JSON-schema plain objects (`RECEIPT_INTERACTION_SCHEMA` at L136, `PRODUCT_BATCH_INTERACTION_SCHEMA` at L249).
- **Surgical Edit Specification:**
  1. Extract `mapPurchaseItemsForWrite(items)` in `src/app/api/purchases/route.ts` and invoke it at L183 and L265.
  2. Extract shared property descriptors in `src/lib/gemini.ts` L70–294 so `RECEIPT_*` and `PRODUCT_BATCH_*` reuse common sub-schemas while producing identical JSON schemas at L576–577 and L906–907.
- **Blast Radius Check:** Both helpers are private to their respective files (`gemini.ts` schemas are not exported).
- **Guardrail Check:** Zero API contract, AI output schema, UI, or security changes.
- **Verification Step:** `npm run typecheck; npm run lint; npm test`

---

### `B1-04` — Remove Unreachable Fallback `INVITE_TTL_MS` in Invitations Route
- **ID & Priority:** `B1-04` | **Low**
- **Exact Target:** `src/app/api/invitations/route.ts` lines `14` and `156–158`
- **Root Cause:** `createInvitationSchema` validates `expiresInDays` with `.int().min(1).max(30).optional()`. Thus `ttlMs` (`(parsed.data.expiresInDays ?? 7) * 24 * 60 * 60 * 1000`) is strictly positive, making `INVITE_TTL_MS` in `(ttlMs || INVITE_TTL_MS)` dead fallback logic.
- **Surgical Edit Specification:** Remove `INVITE_TTL_MS` at line `14` and simplify line `158` to `const expiresAt = new Date(now.getTime() + ttlMs);`.
- **Blast Radius Check:** File-local constant only (`src/app/api/invitations/route.ts`).
- **Guardrail Check:** Preserves exact 7-day default and `1..30` day expiration bounds. Zero UI/security impact.
- **Verification Step:** `npm run typecheck; npm run lint`

---

## Batch 2: Bug & Logic Fixes

### `B2-01` — Fix `"system"` Theme Preference Reverting to `"light"` on Reload
- **ID & Priority:** `B2-01` | **High**
- **Exact Target:**
  - `src/lib/ui-preferences.ts` lines `108–127` (`getUiPreferencesFromStorage`) & lines `156–170` (`saveUiPreferences`)
  - Reference FOUC script: `src/app/layout.tsx` line `57` (`FOUC_PREVENT_SCRIPT`)
- **Root Cause:** `DEFAULT_UI_PREFERENCES.theme` (`ui-preferences.ts:17`) is `"light"`. When the user chooses `"system"` ("Ikuti Perangkat"), `saveUiPreferences` (`ui-preferences.ts:160–164`) executes `window.localStorage.removeItem(THEME_STORAGE_KEY)`. Consequently, `getUiPreferencesFromStorage` (`L113–119`) sees `null` and falls back to `"light"`, and `FOUC_PREVENT_SCRIPT` (`layout.tsx:57`) reads `localStorage.getItem("trasir-theme") || "light"` instead of `"system"`, dropping OS dark-mode tracking on reload.
- **Surgical Edit Specification:** In `src/lib/ui-preferences.ts` lines `160–164`, replace the `if (next.theme === "system") { removeItem(...) } else { setItem(...) }` branch with unconditional `window.localStorage.setItem(THEME_STORAGE_KEY, next.theme);`. Keep `FOUC_PREVENT_SCRIPT` in `src/app/layout.tsx:57` unchanged (it already branches cleanly on `t === "system"` when present in storage).
- **Blast Radius Check:** Consumed only by client appearance settings (`src/app/(workspace)/pengaturan/page.tsx`, `ui-preferences.ts`).
- **Guardrail Check:** Zero CSS/layout drift; existing `"light"` and `"dark"` preferences behave identically while `"system"` persists across navigation and hard reloads.
- **Verification Step:** `npm run typecheck; npm run lint`

---

### `B2-02` — Prevent Negative Warehouse Stock on `PINDAH_GUDANG` & Return HTTP `409` for `CONFLICT:`
- **ID & Priority:** `B2-02` | **High**
- **Exact Target:** `src/app/api/inventory/route.ts` lines `315–383` (`REVIEW_ADJUSTMENT` `DISETUJUI` & `PINDAH_GUDANG` branch) and lines `719–721` (`CONFLICT:` error handler)
- **Root Cause:**
  1. `PINDAH_GUDANG` approval (`inventory/route.ts:335–383`) calls `tx.productStock.upsert({ ..., update: { quantity: { decrement: adj.quantity } }, create: { ..., quantity: 0 } })` without verifying source warehouse stock first, allowing negative `ProductStock.quantity` or silently clamping/creating phantom destination stock from `0` source balance.
  2. Line `719–721` maps `CONFLICT:` errors to `{ status: 400 }` instead of `{ status: 409 }`, breaking consistency with `shifts`, `products`, `purchases/review`, and `sales/amendments`.
- **Surgical Edit Specification:**
  1. Inside `REVIEW_ADJUSTMENT` before executing `tx.productStock.upsert` (`PINDAH_GUDANG`), query `fromStock = await tx.productStock.findUnique({ where: { productId_warehouseId: { productId: adj.productId, warehouseId: adj.fromWarehouseId } } })`; if `!fromStock || fromStock.quantity < adj.quantity`, throw `new Error(\`CONFLICT:Stok di gudang asal tidak mencukupi (tersedia ${fromStock?.quantity ?? 0}).\`)`.
  2. Replace lines `298` / `316` direct update with atomic `tx.stockAdjustment.updateMany({ where: { id: adj.id, roomId: user.roomId, status: "MENUNGGU_PERSETUJUAN" }, ... })` claiming `count === 1` inside a transaction supporting Postgres `Serializable` (matching `sales/amendments/route.ts:390`).
  3. Update line `720` status from `400` to `409`.
- **Blast Radius Check:** `src/app/(workspace)/inventaris/page.tsx` handles `!res.ok` errors generically via `showToast`; `tests/api-flow.test.ts` lines `2499–2533` test `400` validation rejections (non-`CONFLICT:`), so changing `CONFLICT:` to `409` preserves all existing tests.
- **Guardrail Check:** Protects inventory accounting integrity without restricting valid warehouse transfers or changing UI markup.
- **Verification Step:** `npm run typecheck; npm test`

---

### `B2-03` — Align Date Filters & Receipt/Export Dates to `Asia/Jakarta` (WIB)
- **ID & Priority:** `B2-03` | **High**
- **Exact Target:**
  - `src/app/(workspace)/penjualan/page.tsx` line `279` (`!s.createdAt.startsWith(dateFilter)`)
  - `src/app/(workspace)/aktivitas/page.tsx` line `124` (`!log.createdAt.startsWith(dateFilter)`)
  - `src/app/api/sales/route.ts` lines `231–234` (`receiptNumber` date stamp)
  - `src/app/api/purchases/analyze/route.ts` lines `96–97`
  - `src/components/pembelian/PurchaseDetailView.tsx` lines `75` and `147`
  - `src/app/(workspace)/laporan/page.tsx` lines `105`, `107`, `205`
  - `src/app/(workspace)/inventaris/page.tsx` line `136`
  - `src/app/(workspace)/pengaturan/page.tsx` line `304`
- **Root Cause:** ISO strings from `Date.toISOString()` are UTC. Between `00:00` and `06:59 WIB`, `.toISOString().slice(0, 10)` and `.startsWith(dateFilter)` evaluate against UTC yesterday while HTML date inputs and store reporting use Asia/Jakarta (`UTC+7`). `src/lib/date-jakarta.ts` already provides `getJakartaDateKey()`.
- **Surgical Edit Specification:**
  1. Ensure `getJakartaDateKey(date: Date | string | number = new Date())` in `src/lib/date-jakarta.ts` safely handles ISO strings/Dates, then replace `.startsWith(dateFilter)` at `penjualan/page.tsx:279` and `aktivitas/page.tsx:124` with `getJakartaDateKey(item.createdAt) !== dateFilter`.
  2. Replace `.toISOString().slice(0, 10)` default date stamps/filenames/receipt prefixes across `sales/route.ts:231–234`, `purchases/analyze/route.ts:96–97`, `PurchaseDetailView.tsx:75, 147`, `laporan/page.tsx:105, 107, 205`, `inventaris/page.tsx:136`, and `pengaturan/page.tsx:304` with `getJakartaDateKey(...)`.
- **Blast Radius Check:** Keeps exact `"YYYY-MM-DD"` format and `TRX-YYYYMMDD-XXXXXX` structure; `src/lib/date-jakarta.ts` is already tested in `tests/core.test.ts:219`.
- **Guardrail Check:** Zero UI layout or API contract change; fixes early-morning WIB off-by-one-day bugs cleanly.
- **Verification Step:** `npm run typecheck; npm test`

---

### `B2-04` — Eliminate React Render-Time Cache Mutation, Mount Double-Fetch & Stale In-Flight Overwrite
- **ID & Priority:** `B2-04` | **High**
- **Exact Target:**
  - `src/lib/client-cache.ts` lines `24–76` (`setCachedData`, `invalidateCache`, `fetchJsonCached`)
  - `src/components/kasir/KasirClient.tsx` lines `101–103`
  - `src/components/produk/ProdukClient.tsx` lines `53–55`
  - `src/app/(workspace)/inventaris/page.tsx` lines `149–187` (`loadInventory` dependency array `[adjProductId, showToast]`)
- **Root Cause:**
  1. `invalidateCache(prefix)` in `client-cache.ts:28–39` deletes `memoryCache` entries only while leaving active `inflightRequests` promises (`L60–76`) running; an older pre-mutation GET finishing after a POST/PUT + `invalidateCache` writes stale data back into `memoryCache` (`L68`).
  2. `KasirClient.tsx:101–103` and `ProdukClient.tsx:53–55` invoke `setCachedData("/api/products", initialCatalog)` synchronously during render rather than inside `useEffect`.
  3. `inventaris/page.tsx:172, 183` reads/mutates `adjProductId` inside `loadInventory` while declaring `[adjProductId, showToast]` in `loadInventory`'s dependency array, causing `useEffect` to fire two back-to-back `/api/inventory` fetches on mount.
- **Surgical Edit Specification:**
  1. In `src/lib/client-cache.ts`, maintain a per-key monotonic `cacheGeneration = new Map<string, number>()` (incremented inside `invalidateCache` for matching keys, alongside deleting from `inflightRequests`); in `fetchJsonCached`, capture `genAtStart` and skip `setCachedData(url, data)` if `cacheGeneration.get(url) !== genAtStart`.
  2. Move `setCachedData("/api/products", initialCatalog)` in `KasirClient.tsx:101–103` and `ProdukClient.tsx:53–55` into `useEffect(() => { setCachedData("/api/products", initialCatalog); }, [initialCatalog]);` (matching `DashboardClient.tsx:94`).
  3. In `inventaris/page.tsx:172–183`, replace `if (!adjProductId && data.products?.[0]) setAdjProductId(...)` with `setAdjProductId((prev) => prev || data.products?.[0]?.id || "")` and remove `adjProductId` from `loadInventory`'s dependency array.
- **Blast Radius Check:** All pages importing `@/lib/client-cache` (`DashboardClient`, `KasirClient`, `ProdukClient`, `penjualan`, `inventaris`, `laporan`, `pembelian`, `pengaturan`, `aktivitas`, `TeamCollaboratorPanel`).
- **Guardrail Check:** Zero UI/styling changes; eliminates stale post-mutation cache flashes and duplicate network calls.
- **Verification Step:** `npm run typecheck; npm run lint`

---

### `B2-05` — Standardize Client Upload Validation/Compression & Fix `data:` URI Proof Links
- **ID & Priority:** `B2-05` | **Medium**
- **Exact Target:**
  - `src/app/(workspace)/inventaris/page.tsx` lines `189–196` (`handleFileToDataUrl`), `746`, `1200` (`accept="image/*"`)
  - `src/app/(workspace)/penjualan/page.tsx` lines `170–188` (`FileReader`), `667–688` (`href={item.proofImageData} target="_blank"`)
  - `src/components/ui/CameraCaptureModal.tsx` lines `100–110` (`handleFallbackLiveReceipt`) & `167` (`accept="image/*"`)
- **Root Cause:**
  1. `inventaris/page.tsx` (`handleFileToDataUrl`) and `CameraCaptureModal.tsx` (`handleFallbackLiveReceipt`) read raw files with `FileReader` (omitting `onerror`, client MIME filtering, compression, and 2MB size guard), causing modern phone camera uploads to fail at server `validateProofAttachment`. `penjualan/page.tsx:180–187` also omits `reader.onerror`.
  2. `penjualan/page.tsx:673, 687` uses `<a href={item.proofImageData} target="_blank">` for `data:` URIs, which Chromium/Edge/Firefox block from top-frame navigation (`ReceiptViewer.tsx` already uses `dataUrlToBlobUrl` cleanly).
- **Surgical Edit Specification:**
  1. Reuse `compressReceiptFileToDataUrl` (`src/lib/receipt-client.ts:58`) in `inventaris/page.tsx:189–196` and `CameraCaptureModal.tsx:100–110`, adding toast/error handling and restricting `accept` attributes (`L746`, `L1200`, `L167`) to `"image/jpeg,image/png,image/webp"`. In `penjualan/page.tsx:170–188`, compress images with `compressReceiptFileToDataUrl`, add `reader.onerror` for PDF `FileReader`, and surface errors via toast.
  2. In `penjualan/page.tsx:667–688`, open attachments via button/anchor click handler calling `dataUrlToBlobUrl(item.proofImageData)` (`src/lib/receipt-client.ts:108`) + `window.open(blobUrl, "_blank", "noopener,noreferrer")` with delayed `URL.revokeObjectURL`.
- **Blast Radius Check:** `CameraCaptureModal` is reused across `PurchaseDetailView`, `ProposalCartDrawer`, and `ProductBatchReviewDrawer`; callback signature `(dataUrl: string) => void` stays unchanged.
- **Guardrail Check:** Zero CSS/layout drift; enforces server MIME/2MB contract early on client.
- **Verification Step:** `npm run typecheck; npm run lint`

---

### `B2-06` — Fix `BarcodeScannerModal` Multi-Fire Race & `POST /api/shifts` Counter Handover `take: 60` Cliff
- **ID & Priority:** `B2-06` | **Medium**
- **Exact Target:**
  - `src/components/ui/BarcodeScannerModal.tsx` lines `47–58`
  - `src/app/api/shifts/route.ts` lines `333–344` (`OPEN` handover lookup)
- **Root Cause:**
  1. `BarcodeScannerModal.tsx:47` schedules an `async` callback inside `setInterval(..., 500)` without a busy/detected flag; concurrent slow `detector.detect` resolutions can invoke `onDetected(...)` + `onClose()` multiple times for one scan.
  2. `POST /api/shifts` L333–344 loads only `take: 60` closed shifts across the entire room and filters in memory for `targetCounter.id`. If Counter 1 logs >60 shifts between Counter 2 shifts, Counter 2's prior closing shift falls past index 60 and `evaluateHandoverSync` wrongly treats it as `"SHIFT_PERTAMA"`.
- **Surgical Edit Specification:**
  1. In `BarcodeScannerModal.tsx:47–58`, maintain `let detecting = false;` and `let detected = false;` guards (plus cleanup flag `unmounted = true`), skipping overlapping intervals and setting `detected = true` synchronously before invoking `onDetected(rawValue)` + `onClose()`.
  2. In `src/app/api/shifts/route.ts:333–344`, first query the latest closed shift matching the counter envelope tag: `tx.shiftClosing.findFirst({ where: { roomId: user.roomId, status: { not: "AKTIF" }, notes: { contains: \`"counterId":"${targetCounter.id}"\` } }, orderBy: { createdAt: "desc" }, select: { id: true, actualCashTotal: true, notes: true } })`, and ONLY if null AND `targetCounter.id === defaultCounterId`, fallback to iterating bounded cursor pages (`take: 100`) for legacy pre-loket shifts missing `counterId` in `notes`. Verify parsed `cid === targetCounter.id` via `parseShiftEnvelope` cleanly!
- **Blast Radius Check:** `BarcodeScannerModal` (caller: `KasirClient.tsx:944`); `POST /api/shifts` OPEN handover logic (`tests/api-flow.test.ts` scenarios 30–31).
- **Guardrail Check:** Zero visual/API shape change; preserves legacy single-loket shift continuity and multi-loket audit accuracy at scale.
- **Verification Step:** `npm run typecheck; npm test`

---

### `B2-07` — Fix `MARK_ALL_READ` Notification Scope Leakage & Settings Input Validation
- **ID & Priority:** `B2-07` | **Medium**
- **Exact Target:**
  - `src/app/api/audit/route.ts` lines `36–50` (`notifWhere`) & lines `91–122` (`MARK_READ`, `MARK_ALL_READ`)
  - `src/app/api/settings/route.ts` lines `394–455` (`CREATE_UNIT`, `CREATE_CATEGORY`, `CREATE_WAREHOUSE`) & lines `458–496` (`UPDATE_PROFILE`)
- **Root Cause:**
  1. In `audit/route.ts:111–122`, `MARK_ALL_READ` matches `{ userId: null }` broadly for admins (marking staff-targeted notifications like `targetRole: "KASIR"` as read even though admins do not see them in `GET`) and `{ targetRole: user.role }` without `userId: null` for staff.
  2. In `settings/route.ts`, `CREATE_CATEGORY` (L424) and `CREATE_WAREHOUSE` (L450) call `String(body.name).trim()` with zero Zod validation (missing `name` persists `"undefined"`!), `CREATE_UNIT` (L409) lacks `P2002` -> `409` handling, and `UPDATE_PROFILE` (L493) writes a no-op update + audit log if neither `name` (`>=2` chars) nor `newPassword` is provided.
- **Surgical Edit Specification:**
  1. Extract `buildNotificationVisibilityWhere(user)` in `src/app/api/audit/route.ts` returning the exact scope currently used by `GET` (`L36–50`) and `MARK_READ` (`L96–105`), and apply it inside `MARK_ALL_READ` (`L111–122`).
  2. Add Zod `.trim().min(1).max(80)` schemas for `CREATE_CATEGORY` and `CREATE_WAREHOUSE`, catch Prisma `P2002` in `CREATE_UNIT` returning `409`, and reject/no-op empty `UPDATE_PROFILE` changes with `400` (`"Tidak ada perubahan profil untuk disimpan."`) in `src/app/api/settings/route.ts`.
- **Blast Radius Check:** `aktivitas/page.tsx`, `pengaturan/page.tsx`, `tests/api-flow.test.ts` Scenario 33. Verify no existing test submits an empty `UPDATE_PROFILE` payload (`Scenario 33` submits `currentPassword` + `newPassword`).
- **Guardrail Check:** Fixes cross-role `MARK_ALL_READ` interference and malformed master-data insertion without altering valid flows.
- **Verification Step:** `npm run typecheck; npm test`

---

### `B2-08` — Clarify Deprecated Stub Fields in `DashboardClient` / `dashboard.ts` Contract
- **ID & Priority:** `B2-08` | **Low**
- **Exact Target:**
  - `src/lib/queries/dashboard.ts` lines `161`, `165`, `177–179` (`totalPurchases: 0`, `discrepancyItemsCount: 0`, `aiFlaggedPurchases: []`, `exceedingOpnameItems: []`)
  - `src/components/dashboard/DashboardClient.tsx` lines `27`, `31`
- **Root Cause:** Those summary/anomaly fields remain permanently hardcoded to `0`/`[]` after prior dashboard simplification and are unread in `DashboardClient.tsx` JSX (only `anomalies.flaggedShifts` at L336–361 is rendered). Removing JSON properties abruptly could break external API consumers if any script relies on them.
- **Surgical Edit Specification:** Keep runtime response properties intact for 100% backward API compatibility (`ZERO SYSTEM REGRESSION`), and annotate them with `@deprecated` JSDoc comments in `DashboardClient.tsx` (`L27, L31`) and `src/lib/queries/dashboard.ts` (`L161–179`) noting they are retained strictly as compatibility placeholders.
- **Blast Radius Check:** Read-only metadata / comment annotation only.
- **Guardrail Check:** Zero behavioral, visual, API, or test regressions (`tests/api-flow.test.ts` assertions remain untouched).
- **Verification Step:** `npm run typecheck; npm run lint`

---

## Batch 3: Security & Concurrency Hardening

### `B3-01` — Atomic Claim, `Serializable` Lock & Bounded `batchId` Queries in `ProductRequest` Endpoints
- **ID & Priority:** `B3-01` | **Critical**
- **Exact Target:**
  - `src/app/api/product-requests/[id]/review/route.ts` lines `65–71`, `213–221`
  - `src/app/api/product-requests/batch-review/route.ts` lines `51–71`, `215–242`
  - `src/app/api/product-requests/analyze/route.ts` lines `53–69`
  - `src/app/api/product-requests/receipt/route.ts` lines `43–60`
  - `src/app/api/product-requests/route.ts` lines `495–515` (`DELETE`)
- **Root Cause:**
  1. **Concurrency / Double-Approval & Double-Creation Race:** `[id]/review` and `batch-review` check status in read phase and call `tx.productRequest.update({ where: { id } })` *after* creating products without an atomic `updateMany({ where: { id, roomId, status: "MENUNGGU_PERSETUJUAN" } })` claim (contrast with `purchases/review/route.ts:68–83`) and without Postgres `Serializable` isolation (`sales/amendments/route.ts:390`). Concurrent single/batch reviews under Postgres `READ COMMITTED` can both pass status checks and concurrently reject/approve or hit unmapped `P2002` `500` errors.
  2. **Unbounded Full-Room Envelope Scan (DoS):** When `batchId` is sent without `requestIds`, all 4 batch endpoints (`analyze`, `batch-review`, `receipt`, `DELETE`) call `findMany({ where: { roomId } })` with no `take` and parse multi-megabyte base64 receipt envelopes for the room's entire history.
- **Surgical Edit Specification:** *(Runs cleanly after `B1-02`.)*
  1. Wrap `[id]/review` and `batch-review` transactions with conditional Postgres `{ isolationLevel: "Serializable", maxWait: 20000, timeout: 30000 }` (`!isSqlite`, plus `P2034` -> `409 Conflict`).
  2. Inside the transaction before creating `Product` records, execute atomic `const claim = await tx.productRequest.updateMany({ where: { id: { in: targetIds }, roomId: reviewer.roomId, status: "MENUNGGU_PERSETUJUAN" }, data: { status: decision, reviewedById: reviewer.id, reviewedAt: new Date(), rejectionReason: decision === "DITOLAK" ? rejectionReason?.trim() || null : null } })`, throwing `CONFLICT:Sebagian atau seluruh pengajuan pada paket ini sudah diproses.` if `claim.count !== targetIds.length`. Attach `createdProductId` cleanly post-creation.
  3. Narrow `batchId`-only lookups in `analyze`, `batch-review`, `receipt`, and `DELETE` by filtering `where: { roomId, ...(requirePending ? { status: "MENUNGGU_PERSETUJUAN" } : {}), variantsJson: { contains: batchId } }` (`orderBy: { createdAt: "desc" }`) prior to `parseProductRequestEnvelope` exact `batchId` matching.
- **Blast Radius Check:** `ProductBatchReviewDrawer.tsx`, `ProdukClient.tsx`, `tests/api-flow.test.ts` Scenarios 12–15, 27, 29.
- **Guardrail Check:** Zero API contract or UI drift; prevents concurrent double-approval and unbounded memory spikes.
- **Verification Step:** `npm run typecheck; npm test`

---

### `B3-02` — Enforce PostgreSQL `Serializable` Transaction Lock on `POST /api/shifts` `"OPEN"`
- **ID & Priority:** `B3-02` | **Critical**
- **Exact Target:** `src/app/api/shifts/route.ts` lines `305–454` (`prisma.$transaction`) and lines `750–759` (`catch` error mapper)
- **Root Cause:** Counter locking (`1 loket = 1 kasir`) checks active `ShiftClosing` JSON `notes` in memory inside `prisma.$transaction` (`L306–331`, re-check at `L397–410`). Under PostgreSQL/Supabase default `READ COMMITTED`, two simultaneous `"OPEN"` requests on `loket-1` cannot see each other's uncommitted `ShiftClosing` row in `verifyActiveAfter`, allowing both transactions to commit `"AKTIF"` shifts on the same loket concurrently.
- **Surgical Edit Specification:**
  1. Pass conditional transaction options matching `src/app/api/sales/amendments/route.ts:390`: `!isSqlite ? { isolationLevel: "Serializable", maxWait: 20000, timeout: 30000 } : undefined`.
  2. In `catch (err)` (`L750–759`), detect Prisma serialization conflict `err.code === "P2034"` (or Postgres SQLSTATE `40001` message) and return HTTP `409 Conflict`: `{ error: "Loket baru saja dikunci oleh transaksi kasir lain. Silakan muat ulang status loket." }`.
- **Blast Radius Check:** `ShiftWorkflowPanel.tsx` (`POST /api/shifts`), `CounterManagementPanel.tsx` live status, `tests/api-flow.test.ts` Scenarios 30–31.
- **Guardrail Check:** SQLite test execution remains unchanged; production PostgreSQL gains true serializable counter mutual exclusion with zero API schema change.
- **Verification Step:** `npm run typecheck; npm test`

---

### `B3-03` — Atomic Single-Use Invitation Claim & `P2002` Handling on `POST /api/auth/register`
- **ID & Priority:** `B3-03` | **Critical**
- **Exact Target:** `src/app/api/auth/register/route.ts` lines `197–268` (`JOIN_ROOM` transaction) and lines `335–350` (`catch` error mapper)
- **Root Cause:**
  1. In `JOIN_ROOM` (`register/route.ts:197–268`), `tx.storeInvitation.update({ where: { id: invitation.id }, data: { status: "ACCEPTED", ... } })` does not require `status: "PENDING"` in its `WHERE` clause and runs under default `READ COMMITTED`, permitting two concurrent signups with the same invite code to both succeed and create two accounts from one single-use code.
  2. Duplicate username/email pre-check runs outside `$transaction` (`L72–85`), so concurrent duplicate registrations hit Prisma `P2002` inside `tx.user.create` and leak raw `500` Prisma error text at `L349` instead of `409 Conflict`.
- **Surgical Edit Specification:**
  1. Replace `tx.storeInvitation.update` at `L260` with atomic `const claim = await tx.storeInvitation.updateMany({ where: { id: invitation.id, status: "PENDING" }, data: { status: "ACCEPTED", targetUserId: created.id, targetUsername: created.username, respondedAt: now } }); if (claim.count !== 1) { throw new Error("CONFLICT:Kode undangan baru saja digunakan oleh pendaftaran lain."); }` (and wrap `$transaction` with Postgres `Serializable` when `!isSqlite` + handle `P2034` -> `409`).
  2. In `L335–350`, handle `CONFLICT:` -> `409`, Prisma `P2002` -> `409` (`"Username atau email sudah terdaftar pada akun lain."`), and avoid echoing raw SQL/Prisma internals on unexpected `500`.
- **Blast Radius Check:** `RegisterClient.tsx`, `tests/api-flow.test.ts` Scenarios 1–9 & 31–33.
- **Guardrail Check:** Single-use invitation semantics strictly enforced under concurrency; error contract preserves HTTP `400`/`403`/`404`/`409`.
- **Verification Step:** `npm run typecheck; npm test`

---

### `B3-04` — Remove Public Multi-Tenant User Table Dump, Mitigate Login Timing Enumeration & Rate-Limit Password Reset
- **ID & Priority:** `B3-04` | **High**
- **Exact Target:**
  - `src/app/api/auth/forgot-password/route.ts` lines `90–105` (full-table `findMany` fallback)
  - `src/app/api/auth/login/route.ts` lines `50–55` (missing dummy bcrypt comparison)
  - `src/app/api/auth/reset-password/route.ts` lines `16–97` (unthrottled `GET` / `POST`)
- **Root Cause:**
  1. On every unknown email submitted to public `POST /api/auth/forgot-password`, `L90–104` executes `prisma.user.findMany({ where: { isActive: true }, select: { ..., passwordHash: true } })` loading every tenant's active user records and password hashes into memory.
  2. `POST /api/auth/login` (`L50–55`) skips `verifyPassword` when `!user`, enabling timing side-channel user/email enumeration (~2ms vs ~250ms bcrypt).
  3. `GET` / `POST /api/auth/reset-password` lacks IP rate-limiting.
- **Surgical Edit Specification:**
  1. Delete lines `90–105` in `forgot-password/route.ts` (all writes across `register`, `setup`, `settings`, and `change-email` normalize `.trim().toLowerCase()`, and when provider is PostgreSQL we can cleanly support case-insensitive lookup only if needed via `findFirst`, though lowercase normalization is universal).
  2. In `login/route.ts:50–55`, execute `await verifyPassword(parsed.data.password, DUMMY_BCRYPT_HASH)` (valid precomputed 12-round bcrypt hash constant) before returning the identical `401` JSON payload.
  3. Apply `checkRateLimit(\`reset-pwd:\${getClientIpKey(request)}\`, 20, 15 * 60_000)` on `GET` and `POST` in `reset-password/route.ts`.
- **Blast Radius Check:** `ForgotPasswordClient.tsx`, `LoginClient.tsx`, `ResetPasswordClient.tsx`, `tests/api-flow.test.ts` Scenario 28 & 33. Note: `checkRateLimit` bypasses `VITEST=true` automatically unless `{ enforceInTest: true }`, keeping test execution unaffected.
- **Guardrail Check:** Zero auth UX regression; hardens multi-tenant isolation, timing resistance, and brute-force resistance.
- **Verification Step:** `npm run typecheck; npm test`

---

### `B3-05` — Bound `/api/users` Shift/Sales Aggregation & Upgrade Server Receipt/SKU Generation to CSPRNG
- **ID & Priority:** `B3-05` | **Medium**
- **Exact Target:**
  - `src/app/api/users/route.ts` lines `40–73`
  - `src/app/api/sales/route.ts` lines `231–234` (`receiptNumber`)
  - `src/app/api/purchases/review/route.ts` lines `140–143` (auto-SKU generation)
- **Root Cause:**
  1. `GET /api/users` loads **all** historical `shiftClosing` and **all** historical `sale` rows for the room into JS memory merely to derive `hasOpenShift` and `unclosedSalesCount`.
  2. `receiptNumber` (`sales/route.ts:234`) and auto-generated SKU (`purchases/review/route.ts:141`) rely on `Math.random()` in narrow ranges (`100000–999999` / `10–99`), risking collisions on unique DB constraints (`Sale.receiptNumber` `@unique` & `Product.sku` `@unique` per room).
- **Surgical Edit Specification:**
  1. In `src/app/api/users/route.ts:40–73`, replace full-table `findMany` with: (a) `shiftClosing.findMany({ where: { roomId: user.roomId, status: "AKTIF" }, select: { cashierId: true }, distinct: ["cashierId"] })`, (b) `shiftClosing.groupBy({ by: ["cashierId"], where: { roomId: user.roomId, status: { not: "AKTIF" } }, _max: { createdAt: true } })`, and (c) bounded sequential/small-batch `prisma.sale.count` per user constrained by `createdAt: { gt: lastClosingAt }` when present (safe under PgBouncer connection limit `5`).
  2. Replace `Math.random()` in `sales/route.ts:234` (`crypto.randomInt(100000, 1000000)`) and `purchases/review/route.ts:141` (`crypto.randomBytes(3).toString("hex").toUpperCase()` with `tx.product.findFirst` uniqueness check on `sku`).
- **Blast Radius Check:** `TeamCollaboratorPanel.tsx`, `/api/users`, `/api/sales`, `/api/purchases/review`, `tests/api-flow.test.ts` Scenarios 10–32.
- **Guardrail Check:** Preserves exact `hasOpenShift` & `unclosedSalesCount` values, `TRX-YYYYMMDD-XXXXXX` receipt format (`B2-03` aligns the date to WIB), and PgBouncer pool stability.
- **Verification Step:** `npm run typecheck; npm test`

---

## Global Verification Checklist (Post-Executor Final Gate)

After all batches (`Batch 1` -> `Batch 2` -> `Batch 3`) are complete, Executor runs in sequence:
1. `npm run typecheck` (`tsc --noEmit`) — must exit `0`
2. `npm run lint` (`next lint`) — must exit `0` with zero warnings
3. `npm test` (`node scripts/setup-test-db.mjs && vitest run`) — must pass 100% of unit & 33-scenario API integration tests (`tests/core.test.ts`, `tests/api-flow.test.ts`)
4. `npm run build` (`next build`) — verify zero production bundling or RSC boundary regressions

