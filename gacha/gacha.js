document.addEventListener("DOMContentLoaded", () => {
    const scene = document.getElementById("machineScene");
    const machine = document.getElementById("gachaMachine");
    const machineDome = document.getElementById("machineDome");
    const chuteTarget = document.getElementById("chuteTarget");
    const dropLayer = document.getElementById("dropLayer");
    const revealStage = document.getElementById("revealStage");
    const fxBurstStage = document.getElementById("fxBurstStage");
    const burstCore = document.getElementById("burstCore");
    const statusLine = document.getElementById("gachaStatus");
    const prizeModal = document.getElementById("prizeModal");
    const modalPrizeGrid = document.getElementById("modalPrizeGrid");
    const controls = Array.from(document.querySelectorAll(".draw-control"));
    const modalClosers = Array.from(document.querySelectorAll("[data-close-modal]"));
    const settingsPanel = document.querySelector(".settings-panel");
    const prizeSettingsList = document.getElementById("prizeSettingsList");
    const addPrizeButton = document.getElementById("addPrizeBtn");
    const settingsLockButton = document.getElementById("settingsLockBtn");
    const settingsLockText = document.getElementById("settingsLockText");
    const settingsCount = document.getElementById("settingsCount");
    const prizeInventoryList = document.getElementById("prizeInventoryList");
    const inventoryTotalRemaining = document.getElementById("inventoryTotalRemaining");
    const twitchIdInput = document.getElementById("twitchIdInput");
    const drawHistoryTableBody = document.getElementById("drawHistoryTableBody");
    const copyDrawHistoryButton = document.getElementById("copyDrawHistoryBtn");
    const sfxVolumeRange = document.getElementById("sfxVolumeRange");
    const sfxVolumeValue = document.getElementById("sfxVolumeValue");
    const audio = createSynthAudioManager();

    if (!window.gsap) {
        statusLine.textContent = "GSAP 未載入";
        controls.forEach((control) => {
            control.disabled = true;
        });
        return;
    }

    const prizes = [
        { name: "惡魔帽", rarity: "SSR", symbol: "✦" },
        { name: "黑蝴蝶", rarity: "SR", symbol: "◆" },
        { name: "星月杖", rarity: "SR", symbol: "★" },
        { name: "紫莓糖", rarity: "R", symbol: "●" },
        { name: "午夜票", rarity: "R", symbol: "✧" },
        { name: "暗夜弓", rarity: "SSR", symbol: "✶" },
        { name: "魔法瓶", rarity: "R", symbol: "✚" },
        { name: "月影石", rarity: "SR", symbol: "◇" }
    ];

    const capsuleThemes = [
        ["#ef8bb6", "#8580c4"],
        ["#fffaf7", "#5f4f3a"],
        ["#f4a3c8", "#746faf"],
        ["#fff2f8", "#ef8bb6"],
        ["#6862a8", "#c4aa8a"]
    ];
    const prizeTonePalette = [
        "#f0c27b", "#ef8bb6", "#8580c4", "#9db7e8",
        "#93cfc6", "#bca38f", "#b6cfaa", "#d798c4"
    ];
    const prizeSettingsStorageKey = "kuromi-gacha-prize-settings-v1";
    const sfxVolumeStorageKey = "kuromi-gacha-sfx-volume-v1";
    const domeCapsuleSize = 38;
    const maxVisibleDomeCapsules = 40;

    let isDrawing = false;
    let areSettingsLocked = false;
    let innerCapsuleIdleTween;
    let nextPrizeId = 1;
    let drawRecordSerial = 1;
    const drawHistoryRecords = [];
    const prizeInventory = new Map();

    setupPrizeSettings();
    setupSettingsLock();
    setupAudioControls();
    setupLeaveGuard();

    gsap.set(".ear-left", { transformOrigin: "88% 96%", rotation: -34 });
    gsap.set(".ear-right", { transformOrigin: "12% 96%", rotation: 34 });

    const machineIdleTimeline = gsap.timeline({ repeat: -1, yoyo: true });
    machineIdleTimeline.to(machine, {
        y: -3,
        duration: 1.8,
        ease: "sine.inOut"
    });

    const earIdleTimeline = gsap.timeline({ repeat: -1, yoyo: true });
    earIdleTimeline
        .to(".ear-left", { rotation: -29, duration: 1.65, ease: "sine.inOut" }, 0)
        .to(".ear-right", { rotation: 29, duration: 1.65, ease: "sine.inOut" }, 0);

    restartInnerCapsuleIdleTween();

    controls.forEach((control) => {
        control.addEventListener("click", () => {
            audio.unlock();
            runDraw(Number(control.dataset.draw), control);
        });
    });

    modalClosers.forEach((closer) => {
        closer.addEventListener("click", () => {
            audio.play("ui-click");
            closePrizeModal();
        });
    });

    if (twitchIdInput) {
        twitchIdInput.addEventListener("input", () => {
            setControlsDisabled(isDrawing);
        });
    }

    if (copyDrawHistoryButton) {
        copyDrawHistoryButton.addEventListener("click", () => {
            audio.play("ui-click");
            copyDrawHistoryTable();
        });
    }

    function setupAudioControls() {
        if (!sfxVolumeRange) {
            return;
        }

        const savedVolume = loadSfxVolume();

        if (savedVolume !== null) {
            audio.setVolume(savedVolume);
        }

        const updateVolumeDisplay = () => {
            const percentage = Math.round(audio.getVolume() * 100);

            sfxVolumeRange.value = String(percentage);
            sfxVolumeRange.style.setProperty("--volume-level", `${percentage}%`);
            sfxVolumeRange.setAttribute("aria-valuetext", `${percentage}%`);

            if (sfxVolumeValue) {
                sfxVolumeValue.textContent = `${percentage}%`;
            }
        };

        const syncAudioVolume = (options = {}) => {
            const value = Number.parseInt(sfxVolumeRange.value, 10);
            const percentage = Number.isFinite(value) ? Math.max(0, Math.min(value, 100)) : 42;

            audio.setVolume(percentage / 100);
            updateVolumeDisplay();

            if (options.persist !== false) {
                saveSfxVolume(audio.getVolume());
            }
        };

        sfxVolumeRange.value = String(Math.round(audio.getVolume() * 100));
        syncAudioVolume({ persist: false });
        sfxVolumeRange.addEventListener("input", syncAudioVolume);
        sfxVolumeRange.addEventListener("change", () => {
            syncAudioVolume();
            audio.play("ui-click", { volume: 0.55 });
        });
    }

    function setupLeaveGuard() {
        window.addEventListener("beforeunload", (event) => {
            event.preventDefault();
            event.returnValue = "";
        });
    }

    function setupPrizeSettings() {
        if (!prizeSettingsList || !addPrizeButton) {
            return;
        }

        restoreSavedPrizeSettings();
        relabelPrizeSettings();

        addPrizeButton.addEventListener("click", () => {
            if (areSettingsLocked) {
                return;
            }

            audio.play("ui-click");
            const row = createPrizeSettingRow(prizeSettingsList.querySelectorAll("[data-prize-row]").length);
            prizeSettingsList.appendChild(row);
            relabelPrizeSettings();
            savePrizeSettings();
            row.querySelector("[data-prize-name]").focus();
        });

        prizeSettingsList.addEventListener("click", (event) => {
            const removeButton = event.target.closest("[data-remove-prize]");

            if (!removeButton) {
                return;
            }

            if (areSettingsLocked) {
                return;
            }

            const rows = Array.from(prizeSettingsList.querySelectorAll("[data-prize-row]"));

            if (rows.length <= 1) {
                return;
            }

            removeButton.closest("[data-prize-row]").remove();
            relabelPrizeSettings();
            savePrizeSettings();
        });

        prizeSettingsList.addEventListener("input", (event) => {
            if (areSettingsLocked) {
                return;
            }

            if (!event.target.matches("[data-prize-name], [data-prize-quantity]")) {
                return;
            }

            if (event.target.matches("[data-prize-quantity]") && Number(event.target.value) < 0) {
                event.target.value = 0;
            }

            updateSettingsCount();
            syncPrizeInventoryFromSettings();
            renderDomeCapsules();
            setControlsDisabled(isDrawing);
            savePrizeSettings();
        });
    }

    function createPrizeSettingRow(index) {
        const row = document.createElement("div");
        const rank = prizeRankLabel(index);
        const defaultName = defaultPrizeName(index);
        row.className = "prize-setting-row";
        row.setAttribute("data-prize-row", "");
        row.innerHTML = `
            <span class="prize-rank" data-prize-rank>${rank}</span>
            <input class="prize-input" type="text" value="${defaultName}" data-prize-name aria-label="${rank}獎項" />
            <input class="prize-input prize-quantity" type="number" value="1" min="0" max="999" step="1" data-prize-quantity aria-label="${rank}初始數量" />
            <button class="prize-remove-button" type="button" data-remove-prize aria-label="移除${rank}">&times;</button>
        `;
        return row;
    }

    function restoreSavedPrizeSettings() {
        const savedSettings = loadPrizeSettings();

        if (!savedSettings || savedSettings.length < 1) {
            return;
        }

        const fragment = document.createDocumentFragment();

        savedSettings.forEach((item, index) => {
            const row = createPrizeSettingRow(index);

            row.querySelector("[data-prize-name]").value = item.name;
            row.querySelector("[data-prize-quantity]").value = item.quantity;
            fragment.appendChild(row);
        });

        prizeSettingsList.replaceChildren(fragment);
    }

    function loadPrizeSettings() {
        try {
            const rawValue = window.localStorage?.getItem(prizeSettingsStorageKey);

            if (!rawValue) {
                return null;
            }

            const parsed = JSON.parse(rawValue);
            const savedPrizes = Array.isArray(parsed?.prizes) ? parsed.prizes : [];
            const normalizedPrizes = savedPrizes.map((item) => ({
                name: typeof item?.name === "string" ? item.name : "",
                quantity: normalizePrizeQuantity(item?.quantity)
            }));

            return normalizedPrizes.length > 0 ? normalizedPrizes : null;
        } catch {
            return null;
        }
    }

    function savePrizeSettings() {
        if (!prizeSettingsList) {
            return;
        }

        const rows = Array.from(prizeSettingsList.querySelectorAll("[data-prize-row]"));
        const prizesToSave = rows.map((row) => ({
            name: row.querySelector("[data-prize-name]")?.value || "",
            quantity: normalizePrizeQuantity(row.querySelector("[data-prize-quantity]")?.value)
        }));

        try {
            window.localStorage?.setItem(prizeSettingsStorageKey, JSON.stringify({
                version: 1,
                prizes: prizesToSave
            }));
        } catch {
            // Storage may be unavailable in private mode; the app should keep working without persistence.
        }
    }

    function loadSfxVolume() {
        try {
            const rawValue = window.localStorage?.getItem(sfxVolumeStorageKey);

            if (rawValue === null || rawValue === undefined) {
                return null;
            }

            return normalizeAudioVolume(rawValue);
        } catch {
            return null;
        }
    }

    function saveSfxVolume(value) {
        try {
            window.localStorage?.setItem(sfxVolumeStorageKey, String(normalizeAudioVolume(value)));
        } catch {
            // Storage may be unavailable in private mode; audio controls should still work.
        }
    }

    function normalizeAudioVolume(value) {
        const volume = Number.parseFloat(value);

        return Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 0.42;
    }

    function normalizePrizeQuantity(value) {
        const quantity = Number.parseInt(value, 10);

        return Number.isFinite(quantity) ? Math.max(0, Math.min(quantity, 999)) : 0;
    }

    function relabelPrizeSettings() {
        if (!prizeSettingsList) {
            return;
        }

        const rows = Array.from(prizeSettingsList.querySelectorAll("[data-prize-row]"));
        rows.forEach((row, index) => {
            const rank = prizeRankLabel(index);
            const defaultName = defaultPrizeName(index);
            const tone = getPrizeTone(index, row);
            ensurePrizeRowId(row);
            const rankNode = row.querySelector("[data-prize-rank]");
            const nameInput = row.querySelector("[data-prize-name]");
            const quantityInput = row.querySelector("[data-prize-quantity]");
            const removeButton = row.querySelector("[data-remove-prize]");

            row.style.setProperty("--rank-tone", tone);

            if (rankNode) {
                rankNode.textContent = rank;
            }

            if (nameInput) {
                const currentName = nameInput.value.trim();

                if (isGeneratedPrizeName(currentName)) {
                    nameInput.value = defaultName;
                }

                nameInput.setAttribute("aria-label", `${rank}獎項`);
            }

            if (quantityInput) {
                quantityInput.setAttribute("aria-label", `${rank}初始數量`);
                quantityInput.min = "0";
            }

            if (removeButton) {
                removeButton.setAttribute("aria-label", `移除${rank}`);
                removeButton.disabled = areSettingsLocked || rows.length <= 1;
            }
        });

        updateSettingsCount(rows);
        syncPrizeInventoryFromSettings();

        renderDomeCapsules();
        setControlsDisabled(isDrawing);
    }

    function setupSettingsLock() {
        if (!settingsLockButton) {
            return;
        }

        settingsLockButton.addEventListener("click", () => {
            audio.play("lock-toggle");
            setSettingsLocked(!areSettingsLocked);
        });

        setSettingsLocked(false);
    }

    function setSettingsLocked(locked) {
        areSettingsLocked = Boolean(locked);

        settingsPanel?.classList.toggle("is-settings-locked", areSettingsLocked);

        const label = areSettingsLocked ? "解鎖獎項設定" : "鎖定獎項設定";

        if (settingsLockButton) {
            settingsLockButton.setAttribute("aria-label", label);
            settingsLockButton.setAttribute("aria-pressed", String(areSettingsLocked));
            settingsLockButton.setAttribute("title", label);
        }

        if (settingsLockText) {
            settingsLockText.textContent = label;
        }

        if (addPrizeButton) {
            addPrizeButton.disabled = areSettingsLocked;
        }

        if (!prizeSettingsList) {
            return;
        }

        const rows = Array.from(prizeSettingsList.querySelectorAll("[data-prize-row]"));
        rows.forEach((row) => {
            row.querySelectorAll("[data-prize-name], [data-prize-quantity]").forEach((input) => {
                input.disabled = areSettingsLocked;
            });

            const removeButton = row.querySelector("[data-remove-prize]");

            if (removeButton) {
                removeButton.disabled = areSettingsLocked || rows.length <= 1;
            }
        });
    }

    function ensurePrizeRowId(row) {
        if (!row.dataset.prizeId) {
            row.dataset.prizeId = `prize-${nextPrizeId}`;
            nextPrizeId += 1;
        }

        return row.dataset.prizeId;
    }

    function updateSettingsCount(rows = Array.from(prizeSettingsList.querySelectorAll("[data-prize-row]"))) {
        if (!settingsCount) {
            return;
        }

        const totalQuantity = rows.reduce((total, row) => {
            const quantity = Number.parseInt(row.querySelector("[data-prize-quantity]")?.value, 10);
            return total + (Number.isFinite(quantity) ? Math.max(0, Math.min(quantity, 999)) : 0);
        }, 0);

        settingsCount.textContent = `${rows.length} 項 / ${totalQuantity} 個`;
    }

    function prizeRankLabel(index) {
        let value = index;
        let label = "";

        do {
            label = String.fromCharCode(65 + (value % 26)) + label;
            value = Math.floor(value / 26) - 1;
        } while (value >= 0);

        return `${label}賞`;
    }

    function defaultPrizeName(index) {
        return `${prizeRankLabel(index)}品項`;
    }

    function isGeneratedPrizeName(value) {
        return /^[A-Z]+賞品項$/.test(value);
    }

    function getPrizeTone(index, row) {
        const tone = prizeTonePalette[index % prizeTonePalette.length];

        if (row) {
            row.dataset.prizeTone = tone;
        }

        return tone;
    }

    function getConfiguredPrizeRows() {
        if (!prizeSettingsList) {
            return prizes.map((prize, index) => ({
                ...prize,
                id: `fallback-${index}`,
                rowIndex: index,
                quantity: 1,
                tone: getPrizeTone(index)
            }));
        }

        return Array.from(prizeSettingsList.querySelectorAll("[data-prize-row]")).map((row, index) => {
            const rank = prizeRankLabel(index);
            const name = row.querySelector("[data-prize-name]")?.value.trim();
            const quantity = Number.parseInt(row.querySelector("[data-prize-quantity]")?.value, 10);

            return {
                id: ensurePrizeRowId(row),
                row,
                rowIndex: index,
                name,
                quantity: Number.isFinite(quantity) ? Math.max(0, Math.min(quantity, 999)) : 0,
                rarity: rank,
                symbol: rank.replace("賞", ""),
                tone: getPrizeTone(index, row)
            };
        });
    }

    function syncPrizeInventoryFromSettings() {
        const configuredRows = getConfiguredPrizeRows();
        const activePrizeIds = new Set(configuredRows.map((item) => item.id));

        Array.from(prizeInventory.keys()).forEach((prizeId) => {
            if (!activePrizeIds.has(prizeId)) {
                prizeInventory.delete(prizeId);
            }
        });

        configuredRows.forEach((item) => {
            const existing = prizeInventory.get(item.id);
            const remainingQuantity = existing && existing.configuredQuantity === item.quantity
                ? Math.min(existing.remainingQuantity, item.quantity)
                : item.quantity;

            prizeInventory.set(item.id, {
                ...item,
                configuredQuantity: item.quantity,
                remainingQuantity: Math.max(0, remainingQuantity)
            });
        });

        renderPrizeInventoryList();
    }

    function getPrizeInventoryRows() {
        return getConfiguredPrizeRows()
            .map((item) => prizeInventory.get(item.id))
            .filter(Boolean);
    }

    function renderPrizeInventoryList() {
        if (!prizeInventoryList) {
            return;
        }

        const fragment = document.createDocumentFragment();
        const items = getPrizeInventoryRows();

        items.forEach((item) => {
            const card = document.createElement("article");
            const detail = document.createElement("div");
            const rank = document.createElement("span");
            const name = document.createElement("div");
            const remaining = document.createElement("div");
            const remainingLabel = document.createElement("span");
            const remainingValue = document.createElement("strong");
            const remainingUnit = document.createElement("span");

            card.className = "inventory-prize-card";
            card.style.setProperty("--inventory-tone", item.tone);
            card.dataset.prizeId = item.id;

            if (item.remainingQuantity < 1) {
                card.classList.add("is-empty");
            }

            detail.className = "inventory-prize-detail";
            rank.className = "inventory-rank";
            rank.textContent = item.rarity;
            name.className = "inventory-name";
            name.textContent = item.name || "未命名獎項";

            remaining.className = "inventory-remaining";
            remainingLabel.className = "inventory-remaining-label";
            remainingLabel.textContent = "剩餘";
            remainingValue.className = "inventory-remaining-value";
            remainingValue.textContent = item.remainingQuantity;
            remainingUnit.className = "inventory-remaining-unit";
            remainingUnit.textContent = "件";

            detail.append(rank, name);
            remaining.append(remainingLabel, remainingValue, remainingUnit);
            card.append(detail, remaining);
            fragment.appendChild(card);
        });

        prizeInventoryList.replaceChildren(fragment);
        updateInventorySummary(items);
    }

    function updateInventorySummary(items = getPrizeInventoryRows()) {
        if (!inventoryTotalRemaining) {
            return;
        }

        const totalRemaining = items.reduce((total, item) => total + (item.name ? item.remainingQuantity : 0), 0);
        inventoryTotalRemaining.textContent = totalRemaining;
    }

    function getConfiguredPrizePool() {
        const configured = [];

        getPrizeInventoryRows().forEach((item) => {
            if (!item.name || item.remainingQuantity < 1) {
                return;
            }

            for (let count = 0; count < item.remainingQuantity; count += 1) {
                configured.push({
                    id: item.id,
                    name: item.name,
                    rarity: item.rarity,
                    symbol: item.symbol,
                    tone: item.tone,
                    rowIndex: item.rowIndex
                });
            }
        });

        return configured.length > 0 ? configured : [];
    }

    function getTotalPrizeQuantity() {
        return getPrizeInventoryRows().reduce((total, item) => total + (item.name ? item.remainingQuantity : 0), 0);
    }

    function renderDomeCapsules() {
        if (!machineDome) {
            return;
        }

        machineDome.querySelectorAll(".inner-capsule").forEach((capsule) => capsule.remove());

        const capsuleItems = getVisibleDomeCapsuleItems();

        const mixedCapsules = shuffleArray(capsuleItems);
        const total = mixedCapsules.length;
        const capsuleSize = domeCapsuleSize;
        const capsulePoints = createDomeCapsulePoints(total, capsuleSize);

        mixedCapsules.forEach((item, capsuleIndex) => {
            const capsule = document.createElement("span");
            const point = capsulePoints[capsuleIndex];

            capsule.className = "inner-capsule";
            capsule.style.left = `${point.x}%`;
            capsule.style.top = `${point.y}%`;
            capsule.style.zIndex = String(point.z);
            capsule.style.setProperty("--cap-size", `${capsuleSize}px`);
            capsule.style.setProperty("--cap-a", item.tone);
            capsule.style.setProperty("--cap-b", item.tone);
            machineDome.appendChild(capsule);
        });

        restartInnerCapsuleIdleTween();
    }

    function getVisibleDomeCapsuleItems() {
        const prizeRows = getPrizeInventoryRows().filter((item) => item.name && item.remainingQuantity > 0);
        const totalRemaining = prizeRows.reduce((total, item) => total + item.remainingQuantity, 0);

        if (totalRemaining <= maxVisibleDomeCapsules) {
            return expandDomeCapsuleItems(prizeRows);
        }

        const visibleCounts = distributeVisibleCapsuleCounts(prizeRows, totalRemaining);

        return prizeRows.flatMap((item) => Array.from({ length: visibleCounts.get(item.id) || 0 }, () => item));
    }

    function expandDomeCapsuleItems(items) {
        return items.flatMap((item) => Array.from({ length: item.remainingQuantity }, () => item));
    }

    function distributeVisibleCapsuleCounts(items, totalRemaining) {
        const visibleTotal = Math.min(maxVisibleDomeCapsules, totalRemaining);
        const counts = new Map();
        const visibleItems = items.length > visibleTotal
            ? [...items].sort((a, b) => b.remainingQuantity - a.remainingQuantity).slice(0, visibleTotal)
            : items;
        const weightedItems = visibleItems.map((item) => {
            const exact = (item.remainingQuantity / totalRemaining) * visibleTotal;
            const base = Math.floor(exact);

            return {
                item,
                exact,
                remainder: exact - base,
                count: Math.max(1, base)
            };
        });

        let assigned = weightedItems.reduce((total, entry) => total + entry.count, 0);

        while (assigned > visibleTotal) {
            const target = weightedItems
                .filter((entry) => entry.count > 1)
                .sort((a, b) => a.remainder - b.remainder || b.count - a.count)[0];

            if (!target) {
                break;
            }

            target.count -= 1;
            assigned -= 1;
        }

        while (assigned < visibleTotal) {
            const target = weightedItems
                .sort((a, b) => b.remainder - a.remainder || b.item.remainingQuantity - a.item.remainingQuantity)[0];

            if (!target) {
                break;
            }

            target.count += 1;
            target.remainder = 0;
            assigned += 1;
        }

        weightedItems.forEach((entry) => {
            counts.set(entry.item.id, entry.count);
        });

        return counts;
    }

    function shuffleArray(items) {
        const shuffled = [...items];

        for (let index = shuffled.length - 1; index > 0; index -= 1) {
            const targetIndex = getRandomIndex(index + 1);
            [shuffled[index], shuffled[targetIndex]] = [shuffled[targetIndex], shuffled[index]];
        }

        return shuffled;
    }

    function getRandomIndex(maxExclusive) {
        if (maxExclusive <= 1) {
            return 0;
        }

        const cryptoSource = window.crypto || window.msCrypto;
        const maxUint32 = 0x100000000;

        if (cryptoSource?.getRandomValues && maxExclusive <= maxUint32) {
            const values = new Uint32Array(1);
            const limit = Math.floor(maxUint32 / maxExclusive) * maxExclusive;

            let value = 0;

            do {
                cryptoSource.getRandomValues(values);
                value = values[0];
            } while (value >= limit);

            return value % maxExclusive;
        }

        return Math.floor(Math.random() * maxExclusive);
    }

    function createDomeCapsulePoints(total, capsuleSize) {
        const metrics = getDomeCapsuleLayoutMetrics(capsuleSize);
        const centers = [];
        const attemptsPerCapsule = total > 36 ? 12 : 22;

        for (let index = 0; index < total; index += 1) {
            let bestCenter = null;
            let bestScore = Number.NEGATIVE_INFINITY;

            for (let attempt = 0; attempt < attemptsPerCapsule; attempt += 1) {
                const center = getRandomDomeCapsuleCenter(metrics);
                const distanceScore = getNearestCapsuleDistance(center, centers, metrics);
                const lowerAreaNudge = ((center.y - metrics.minCenterY) / (metrics.maxCenterY - metrics.minCenterY)) * 5;
                const score = Math.min(distanceScore, capsuleSize * 1.4) + lowerAreaNudge + Math.random() * capsuleSize * 0.45;

                if (score > bestScore) {
                    bestScore = score;
                    bestCenter = center;
                }
            }

            centers.push(bestCenter);
        }

        return centers.map((center) => domeCenterToTopLeft(center.x, center.y, capsuleSize, metrics.domeWidth, metrics.domeHeight));
    }

    function getDomeCapsuleLayoutMetrics(capsuleSize) {
        const domeWidth = machineDome.clientWidth || 250;
        const domeHeight = machineDome.clientHeight || 178;
        const motionSafeMargin = 2;
        const halfX = ((capsuleSize / 2 + motionSafeMargin) / domeWidth) * 100;
        const halfY = ((capsuleSize / 2 + motionSafeMargin) / domeHeight) * 100;

        return {
            domeWidth,
            domeHeight,
            halfX,
            halfY,
            minCenterY: Math.max(27, halfY + 1),
            maxCenterY: Math.min(91, 100 - halfY - 1)
        };
    }

    function getRandomDomeCapsuleCenter(metrics) {
        const yProgress = Math.random() < 0.58 ? Math.pow(Math.random(), 0.55) : Math.random();
        const centerY = metrics.minCenterY + yProgress * (metrics.maxCenterY - metrics.minCenterY);
        const xRange = getDomeSafeCenterXRange(centerY, metrics.halfX);

        return {
            x: xRange.min + Math.random() * (xRange.max - xRange.min),
            y: centerY
        };
    }

    function getNearestCapsuleDistance(center, centers, metrics) {
        if (centers.length < 1) {
            return 100;
        }

        return Math.min(...centers.map((item) => {
            const deltaX = ((center.x - item.x) / 100) * metrics.domeWidth;
            const deltaY = ((center.y - item.y) / 100) * metrics.domeHeight;

            return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        }));
    }

    function getDomeSafeCenterXRange(centerY, halfX) {
        const domeCenterX = 50;
        const domeSideHalfWidth = 43;
        const domeArcCenterY = 56;
        const domeArcRadiusY = 46;
        const arcRatio = (centerY - domeArcCenterY) / domeArcRadiusY;
        const safeHalfWidth = centerY < domeArcCenterY
            ? domeSideHalfWidth * Math.sqrt(Math.max(0.18, 1 - arcRatio * arcRatio))
            : domeSideHalfWidth;
        const min = domeCenterX - safeHalfWidth + halfX;
        const max = domeCenterX + safeHalfWidth - halfX;

        if (min > max) {
            return { min: domeCenterX, max: domeCenterX };
        }

        return { min, max };
    }

    function domeCenterToTopLeft(centerX, centerY, capsuleSize, domeWidth, domeHeight) {
        const halfWidth = (capsuleSize / 2 / domeWidth) * 100;
        const halfHeight = (capsuleSize / 2 / domeHeight) * 100;

        return {
            x: centerX - halfWidth,
            y: centerY - halfHeight,
            z: 2 + Math.round(centerY)
        };
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function restartInnerCapsuleIdleTween() {
        if (!window.gsap) {
            return;
        }

        if (innerCapsuleIdleTween) {
            innerCapsuleIdleTween.kill();
        }

        innerCapsuleIdleTween = gsap.to(".inner-capsule", {
            y: () => gsap.utils.random(-7, 7),
            x: () => gsap.utils.random(-5, 5),
            rotation: () => gsap.utils.random(-18, 18),
            duration: () => gsap.utils.random(1.0, 1.7),
            repeat: -1,
            yoyo: true,
            ease: "sine.inOut",
            stagger: 0.06
        });
    }

    function consumeSelectedPrizes(items) {
        const consumedByPrize = new Map();

        items.forEach((item) => {
            if (!item.id) {
                return;
            }

            consumedByPrize.set(item.id, (consumedByPrize.get(item.id) || 0) + 1);
        });

        consumedByPrize.forEach((amount, prizeId) => {
            const item = prizeInventory.get(prizeId);

            if (item) {
                item.remainingQuantity = Math.max(0, item.remainingQuantity - amount);
            }
        });

        renderPrizeInventoryList();
        renderDomeCapsules();
        setControlsDisabled(isDrawing);
    }

    function runDraw(count, trigger) {
        if (isDrawing) {
            return;
        }

        const participantId = getParticipantId();

        if (!participantId) {
            statusLine.textContent = "請先輸入抽獎者圖奇ID";
            audio.play("error");
            twitchIdInput?.focus();
            setControlsDisabled(false);
            return;
        }

        isDrawing = true;
        setControlsDisabled(true);
        closePrizeModal({ immediate: true });
        clearRound();

        const selectedPrizes = pickPrizes(count);

        if (selectedPrizes.length < 1) {
            statusLine.textContent = "獎項已抽完";
            audio.play("error");
            isDrawing = false;
            setControlsDisabled(false);
            return;
        }

        setSettingsLocked(true);
        count = selectedPrizes.length;

        const capsules = Array.from({ length: count }, (_, index) => createDropCapsule(index, selectedPrizes[index]?.tone));
        const burst = createBurstParts(count);
        const flight = calculateFlight(count);
        const burstHost = fxBurstStage || revealStage;

        positionFxBurstStage();

        capsules.forEach((capsule, index) => {
            capsule.style.left = `${flight.starts[index].x}px`;
            capsule.style.top = `${flight.starts[index].y}px`;
            dropLayer.appendChild(capsule);
            gsap.set(capsule, { autoAlpha: 0, scale: 0.82 });
        });

        burstHost.appendChild(burstCore);
        burst.all.forEach((part) => burstHost.appendChild(part));
        statusLine.textContent = count === 1 ? "單抽啟動" : `${count}連抽啟動`;

        const knob = trigger.querySelector(".knob-face");
        const capsuleTops = capsules.map((capsule) => capsule.querySelector(".drop-capsule-top"));
        const capsuleBottoms = capsules.map((capsule) => capsule.querySelector(".drop-capsule-bottom"));
        const capsuleBands = capsules.map((capsule) => capsule.querySelector(".drop-capsule-band"));
        const revealStart = count === 1 ? 1.78 : 1.98;
        const openStart = revealStart + 0.34;
        const burstStart = openStart + 0.02;
        const resultStart = burstStart + 0.62;
        let hasPresentedResults = false;
        const presentResults = () => {
            if (hasPresentedResults) {
                return;
            }

            hasPresentedResults = true;
            audio.stopLoop("machine-spin");
            showPrizeModal(selectedPrizes);
            consumeSelectedPrizes(selectedPrizes);
            addDrawHistoryRecords(selectedPrizes, participantId);
            statusLine.textContent = "開獎完成";
            isDrawing = false;
            setControlsDisabled(false);
            machineIdleTimeline.timeScale(1);
            earIdleTimeline.timeScale(1);
            innerCapsuleIdleTween?.timeScale(1);
        };

        const tl = gsap.timeline({
            defaults: { ease: "power2.out" },
            onComplete: presentResults
        });

        machineIdleTimeline.pause();
        gsap.set(machine, { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
        earIdleTimeline.timeScale(1.25);
        innerCapsuleIdleTween.timeScale(count === 1 ? 2.2 : 3.2);
        audio.play("draw-start");

        tl
            .add(() => {
                audio.startLoop("machine-spin");
            }, 0.12)
            .add(() => {
                audio.stopLoop("machine-spin");
            }, count === 1 ? 0.96 : 1.16)
            .to(knob, {
                rotation: count === 1 ? "+=360" : "+=720",
                duration: count === 1 ? 0.58 : 0.82,
                ease: "back.inOut(1.7)"
            }, 0)
            .to(machineDome, {
                y: -3,
                rotation: () => gsap.utils.random(-0.8, 0.8),
                scaleX: 1.004,
                scaleY: 0.996,
                transformOrigin: "50% 86%",
                duration: 0.08,
                repeat: count === 1 ? 7 : 12,
                yoyo: true,
                ease: "power1.inOut"
            }, 0.16)
            .to(".inner-capsule", {
                x: () => gsap.utils.random(-15, 15),
                y: () => gsap.utils.random(-14, 8),
                rotation: () => gsap.utils.random(-48, 48),
                duration: 0.08,
                repeat: count === 1 ? 7 : 12,
                yoyo: true,
                stagger: {
                    each: 0.006,
                    from: "random"
                },
                ease: "power1.inOut"
            }, 0.16)
            .to(machine, {
                y: 7,
                scaleX: 1.01,
                scaleY: 0.985,
                duration: 0.13,
                ease: "power2.in"
            }, 0.14)
            .to(machine, {
                x: -5,
                rotation: count === 1 ? -0.7 : -1,
                duration: 0.048,
                repeat: count === 1 ? 8 : 14,
                yoyo: true,
                ease: "power1.inOut"
            }, 0.28)
            .to(machine, {
                x: 0,
                y: 0,
                rotation: 0,
                scaleX: 1,
                scaleY: 1,
                duration: 0.32,
                ease: "elastic.out(1, 0.58)"
            }, count === 1 ? 0.78 : 0.98)
            .to(machineDome, {
                x: 0,
                y: 0,
                rotation: 0,
                scaleX: 1,
                scaleY: 1,
                duration: 0.2,
                ease: "power2.out"
            }, count === 1 ? 0.84 : 1.08)
            .add(() => {
                machineIdleTimeline.restart();
            }, count === 1 ? 1.18 : 1.38)
            .to(capsules, {
                autoAlpha: 1,
                scale: 1,
                duration: 0.08,
                stagger: count === 1 ? 0 : 0.05
            }, 0.68);

        capsules.forEach((capsule, index) => {
            const start = flight.starts[index];
            const end = flight.ends[index];
            const sidePush = (index - (count - 1) / 2) * 8;
            const dropSoundTime = 1.03 + (count === 1 ? 0 : index * 0.08);

            tl.add(() => {
                audio.play("capsule-drop", {
                    rate: 0.94 + index * 0.035,
                    volume: count === 1 ? 1 : 0.72
                });
            }, dropSoundTime);

            tl.to(capsule, {
                keyframes: [
                    {
                        x: sidePush,
                        y: 44,
                        rotation: 0,
                        duration: 0.22,
                        ease: "power1.in"
                    },
                    {
                        x: end.x - start.x + sidePush,
                        y: end.y - start.y - 34,
                        rotation: 0,
                        duration: 0.42,
                        ease: "power1.out"
                    },
                    {
                        x: end.x - start.x,
                        y: end.y - start.y,
                        rotation: 0,
                        duration: 0.36,
                        ease: "bounce.out"
                    }
                ]
            }, 0.76 + (count === 1 ? 0 : index * 0.05));
        });

        tl
            .add(() => {
                statusLine.textContent = "轉蛋開啟中";
            }, revealStart)
            .to(capsules, {
                x: (index) => flight.center.x - flight.starts[index].x + flight.cluster[index].x,
                y: (index) => flight.center.y - flight.starts[index].y + flight.cluster[index].y - 42,
                rotation: 0,
                scale: 1,
                duration: 0.34,
                stagger: 0,
                ease: "power2.out"
            }, revealStart)
            .to(capsuleBands, {
                autoAlpha: 0,
                duration: 0.06
            }, openStart)
            .add(() => {
                audio.play("capsule-open", { volume: 0.94 });
            }, openStart)
            .to(capsuleTops, {
                y: -34,
                x: -12,
                rotation: -34,
                duration: 0.36,
                stagger: 0,
                ease: "back.out(2.2)"
            }, openStart + 0.02)
            .to(capsuleBottoms, {
                y: 24,
                x: 10,
                rotation: 26,
                duration: 0.36,
                stagger: 0,
                ease: "back.out(2.2)"
            }, openStart + 0.02)
            .to(burstCore, {
                autoAlpha: 1,
                scale: count === 1 ? 7.2 : 8.8,
                duration: 0.22,
                ease: "power3.out"
            }, openStart)
            .add(() => {
                audio.play("burst", { volume: 0.92 });
                audio.stopLoop("machine-spin");
            }, burstStart)
            .to(burst.rings, {
                autoAlpha: 1,
                scale: (index) => 1.15 + index * 0.5,
                duration: 0.52,
                stagger: 0.06,
                ease: "power2.out"
            }, burstStart)
            .to(burst.rings, {
                autoAlpha: 0,
                duration: 0.28,
                stagger: 0.04
            }, burstStart + 0.35)
            .to(burst.rays, {
                autoAlpha: 0.96,
                scaleY: 1.18,
                duration: 0.14,
                stagger: 0.01,
                ease: "power2.out"
            }, burstStart)
            .to(burst.rays, {
                autoAlpha: 0,
                scaleY: 0.08,
                duration: 0.34,
                stagger: 0.006,
                ease: "power2.in"
            }, burstStart + 0.22)
            .to(burst.stars.map((star) => star.element), {
                autoAlpha: 1,
                scale: 1,
                duration: 0.08,
                stagger: 0.008,
                ease: "power1.out"
            }, burstStart + 0.03)
            .to(burst.stars.map((star) => star.element), {
                x: (index) => burst.stars[index].x,
                y: (index) => burst.stars[index].y,
                rotation: (index) => burst.stars[index].rotation,
                autoAlpha: 0,
                scale: 0.2,
                duration: 0.62,
                stagger: 0.008,
                ease: "power3.out"
            }, burstStart + 0.06)
            .to(capsules, {
                autoAlpha: 0,
                scale: 0.2,
                duration: 0.24,
                stagger: 0
            }, burstStart + 0.34)
            .add(presentResults, resultStart)
            .to(burstCore, {
                autoAlpha: 0,
                scale: 0.4,
                duration: 0.34,
                ease: "power2.in"
            }, burstStart + 0.56);
    }

    function setControlsDisabled(disabled) {
        const hasNoPrize = getTotalPrizeQuantity() < 1;
        const hasNoParticipant = !getParticipantId();
        const shouldDisable = disabled || hasNoPrize || hasNoParticipant;
        const disabledReason = disabled ? "drawing" : (shouldDisable ? "unavailable" : "");

        controls.forEach((control) => {
            control.disabled = shouldDisable;
            control.setAttribute("aria-disabled", String(shouldDisable));
            if (disabledReason) {
                control.dataset.disabledReason = disabledReason;
            } else {
                delete control.dataset.disabledReason;
            }
        });
    }

    function getParticipantId() {
        return twitchIdInput?.value.trim() || "";
    }

    function addDrawHistoryRecords(items, participantId) {
        if (!drawHistoryTableBody) {
            return;
        }

        const drawTime = formatDrawTime(new Date());

        items.forEach((item) => {
            const record = {
                serial: drawRecordSerial,
                rarity: item.rarity,
                prizeName: item.name,
                tone: item.tone,
                participantId,
                drawTime
            };
            const row = document.createElement("tr");
            const serialCell = document.createElement("td");
            const prizeCell = document.createElement("td");
            const rarityNode = document.createElement("span");
            const prizeNameNode = document.createElement("span");
            const idCell = document.createElement("td");

            serialCell.textContent = String(record.serial);
            prizeCell.className = "draw-history-prize";
            prizeCell.style.setProperty("--history-tone", record.tone);
            rarityNode.className = "draw-history-rarity";
            rarityNode.textContent = record.rarity;
            prizeNameNode.className = "draw-history-prize-name";
            prizeNameNode.textContent = record.prizeName;
            prizeCell.append(rarityNode, prizeNameNode);
            idCell.textContent = participantId;

            drawHistoryRecords.unshift(record);
            row.append(serialCell, prizeCell, idCell);
            drawHistoryTableBody.prepend(row);
            drawRecordSerial += 1;
        });

        updateCopyHistoryButtonState();
    }

    async function copyDrawHistoryTable() {
        if (drawHistoryRecords.length < 1) {
            return;
        }

        const rows = [
            ["序號", "賞別", "獎品", "ID", "時間"],
            ...drawHistoryRecords.map((record) => [
                record.serial,
                record.rarity,
                record.prizeName,
                record.participantId,
                record.drawTime
            ])
        ];
        const text = rows
            .map((row) => row.map(formatTableCopyCell).join("\t"))
            .join("\n");

        try {
            await copyTextToClipboard(text);
            statusLine.textContent = "抽獎紀錄已複製";
            copyDrawHistoryButton.textContent = "已複製";
            window.setTimeout(() => {
                copyDrawHistoryButton.textContent = "複製表格";
            }, 1200);
        } catch {
            statusLine.textContent = "複製失敗";
        }
    }

    function updateCopyHistoryButtonState() {
        if (copyDrawHistoryButton) {
            copyDrawHistoryButton.disabled = drawHistoryRecords.length < 1;
        }
    }

    function formatTableCopyCell(value) {
        return String(value).replace(/[\t\r\n]+/g, " ").trim();
    }

    async function copyTextToClipboard(text) {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return;
        }

        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.setAttribute("readonly", "");
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        document.body.appendChild(textArea);
        textArea.select();

        try {
            const copied = document.execCommand("copy");

            if (!copied) {
                throw new Error("Copy command failed");
            }
        } finally {
            textArea.remove();
        }
    }

    function formatDrawTime(date) {
        const pad = (value) => String(value).padStart(2, "0");

        return [
            `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`,
            `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
        ].join(" ");
    }

    function clearRound() {
        audio.stopLoop("machine-spin");
        dropLayer.innerHTML = "";
        modalPrizeGrid.innerHTML = "";
        const burstHost = fxBurstStage || revealStage;

        burstHost.querySelectorAll(".burst-ring, .burst-ray, .burst-star").forEach((node) => node.remove());
        positionFxBurstStage();
        gsap.set(burstCore, { clearProps: "all" });
    }

    function positionFxBurstStage() {
        if (!fxBurstStage || !revealStage) {
            return;
        }

        const rect = revealStage.getBoundingClientRect();
        fxBurstStage.style.left = `${rect.left + rect.width / 2}px`;
        fxBurstStage.style.top = `${rect.top + rect.height / 2}px`;
        fxBurstStage.style.width = `${rect.width}px`;
        fxBurstStage.style.height = `${rect.height}px`;
    }

    function pickPrizes(count) {
        const pool = getConfiguredPrizePool();
        const shuffled = shuffleArray(pool);

        return shuffled.slice(0, Math.min(count, shuffled.length));
    }

    function renderPrizeCards(items) {
        const fragment = document.createDocumentFragment();
        modalPrizeGrid.dataset.count = String(items.length);

        items.forEach((item) => {
            const card = document.createElement("article");
            card.className = "prize-card";
            card.dataset.rarity = item.rarity;
            card.style.setProperty("--card-tone", item.tone);
            card.innerHTML = `
                <span class="prize-symbol">${item.symbol}</span>
                <span class="prize-name">${item.name}</span>
                <span class="prize-rarity">${item.rarity}</span>
            `;
            fragment.appendChild(card);
        });

        modalPrizeGrid.appendChild(fragment);
    }

    function showPrizeModal(items) {
        renderPrizeCards(items);
        prizeModal.dataset.count = String(items.length);
        prizeModal.classList.add("is-open");
        prizeModal.setAttribute("aria-hidden", "false");
        document.body.classList.add("modal-open");
        audio.play("reward", { volume: items.length === 1 ? 0.86 : 1 });

        gsap.timeline()
            .set(prizeModal, { autoAlpha: 1 })
            .fromTo(".prize-dialog", {
                autoAlpha: 0,
                y: 24,
                scale: 0.82,
                rotation: -2
            }, {
                autoAlpha: 1,
                y: 0,
                scale: 1,
                rotation: 0,
                duration: 0.42,
                ease: "back.out(1.7)"
            }, 0)
            .fromTo(".prize-card", {
                autoAlpha: 0,
                y: 20,
                rotationX: 70,
                scale: 0.84
            }, {
                autoAlpha: 1,
                y: 0,
                rotationX: 0,
                scale: 1,
                duration: 0.38,
                stagger: items.length === 1 ? 0 : 0.035,
                ease: "back.out(1.7)"
            }, 0.12);
    }

    function closePrizeModal(options = {}) {
        if (!prizeModal.classList.contains("is-open") && !options.immediate) {
            return;
        }

        const finishClose = () => {
            prizeModal.classList.remove("is-open");
            prizeModal.setAttribute("aria-hidden", "true");
            document.body.classList.remove("modal-open");
            delete prizeModal.dataset.count;
            modalPrizeGrid.innerHTML = "";
        };

        if (options.immediate) {
            gsap.set(prizeModal, { autoAlpha: 0 });
            finishClose();
            return;
        }

        gsap.to(prizeModal, {
            autoAlpha: 0,
            duration: 0.22,
            ease: "power2.in",
            onComplete: finishClose
        });
    }

    function createDropCapsule(index, tone) {
        const capsule = document.createElement("span");
        const theme = tone ? [tone, tone] : capsuleThemes[index % capsuleThemes.length];
        capsule.className = "drop-capsule";
        capsule.style.setProperty("--cap-top", theme[0]);
        capsule.style.setProperty("--cap-bottom", theme[1]);
        capsule.innerHTML = `
            <span class="drop-capsule-top"></span>
            <span class="drop-capsule-bottom"></span>
            <span class="drop-capsule-band"></span>
            <span class="drop-capsule-shine"></span>
        `;
        return capsule;
    }

    function createBurstParts(count) {
        const rings = [];
        const rays = [];
        const stars = [];
        const ringColors = ["#fffaf7", "#ef8bb6", "#8580c4"];
        const rayCount = count === 1 ? 14 : 22;
        const starCount = count === 1 ? 14 : 24;
        const starColors = ["#fffaf7", "#ef8bb6", "#8580c4", "#f4a3c8", "#c4aa8a"];

        ringColors.forEach((color) => {
            const ring = document.createElement("span");
            ring.className = "burst-ring";
            ring.style.setProperty("--ring-color", color);
            rings.push(ring);
        });

        for (let index = 0; index < rayCount; index += 1) {
            const ray = document.createElement("span");
            ray.className = "burst-ray";
            ray.style.setProperty("--ray-angle", `${index * (360 / rayCount)}deg`);
            rays.push(ray);
        }

        for (let index = 0; index < starCount; index += 1) {
            const angle = index * ((Math.PI * 2) / starCount) + gsap.utils.random(-0.12, 0.12);
            const distance = gsap.utils.random(count === 1 ? 58 : 68, count === 1 ? 116 : 142);
            const star = document.createElement("span");
            star.className = "burst-star";
            star.style.setProperty("--star-color", starColors[index % starColors.length]);
            stars.push({
                element: star,
                x: Math.cos(angle) * distance,
                y: Math.sin(angle) * distance,
                rotation: gsap.utils.random(160, 520)
            });
        }

        return {
            all: [...rings, ...rays, ...stars.map((star) => star.element)],
            rings,
            rays,
            stars
        };
    }

    function createSynthAudioManager() {
        const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
        let context = null;
        let masterGain = null;
        let noiseBuffer = null;
        let masterVolume = 0.42;
        const activeLoops = new Map();

        function getContext() {
            if (!AudioContextConstructor) {
                return null;
            }

            if (!context) {
                context = new AudioContextConstructor();
                masterGain = context.createGain();
                masterGain.gain.value = masterVolume;
                masterGain.connect(context.destination);
            }

            return context;
        }

        function unlock() {
            const ctx = getContext();

            if (ctx?.state === "suspended") {
                ctx.resume().catch(() => {});
            }
        }

        function play(name, options = {}) {
            unlock();

            const players = {
                "ui-click": playUiClick,
                "lock-toggle": playLockToggle,
                "draw-start": playDrawStart,
                "capsule-drop": playCapsuleDrop,
                "capsule-open": playCapsuleOpen,
                burst: playBurst,
                reward: playReward,
                error: playError
            };

            players[name]?.(options);
        }

        function setVolume(value) {
            const normalized = Number(value);

            if (!Number.isFinite(normalized)) {
                return;
            }

            masterVolume = Math.max(0, Math.min(1, normalized));

            if (!context || !masterGain) {
                return;
            }

            const now = context.currentTime;
            masterGain.gain.cancelScheduledValues(now);
            masterGain.gain.setTargetAtTime(masterVolume, now, 0.02);
        }

        function getVolume() {
            return masterVolume;
        }

        function playTone({ frequency, type = "sine", duration = 0.12, volume = 0.12, start = 0, attack = 0.006, release = 0.04, slideTo = null, detune = 0 }) {
            const ctx = getContext();

            if (!ctx || !masterGain) {
                return;
            }

            const startTime = ctx.currentTime + start;
            const endTime = startTime + duration;
            const oscillator = ctx.createOscillator();
            const gain = ctx.createGain();

            oscillator.type = type;
            oscillator.frequency.setValueAtTime(frequency, startTime);
            oscillator.detune.setValueAtTime(detune, startTime);

            if (slideTo) {
                oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), endTime);
            }

            gain.gain.setValueAtTime(0.0001, startTime);
            gain.gain.linearRampToValueAtTime(volume, startTime + attack);
            gain.gain.exponentialRampToValueAtTime(0.0001, endTime + release);

            oscillator.connect(gain);
            gain.connect(masterGain);
            oscillator.start(startTime);
            oscillator.stop(endTime + release + 0.03);
        }

        function playNoise({ duration = 0.14, volume = 0.08, start = 0, filterType = "lowpass", frequency = 900, endFrequency = null }) {
            const ctx = getContext();

            if (!ctx || !masterGain) {
                return;
            }

            const startTime = ctx.currentTime + start;
            const endTime = startTime + duration;
            const source = ctx.createBufferSource();
            const filter = ctx.createBiquadFilter();
            const gain = ctx.createGain();

            source.buffer = getNoiseBuffer(ctx);
            filter.type = filterType;
            filter.frequency.setValueAtTime(frequency, startTime);

            if (endFrequency) {
                filter.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), endTime);
            }

            gain.gain.setValueAtTime(0.0001, startTime);
            gain.gain.linearRampToValueAtTime(volume, startTime + 0.008);
            gain.gain.exponentialRampToValueAtTime(0.0001, endTime + 0.04);

            source.connect(filter);
            filter.connect(gain);
            gain.connect(masterGain);
            source.start(startTime);
            source.stop(endTime + 0.06);
        }

        function getNoiseBuffer(ctx) {
            if (noiseBuffer) {
                return noiseBuffer;
            }

            const length = ctx.sampleRate;
            noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
            const data = noiseBuffer.getChannelData(0);

            for (let index = 0; index < length; index += 1) {
                data[index] = Math.random() * 2 - 1;
            }

            return noiseBuffer;
        }

        function playUiClick(options = {}) {
            const volume = 0.08 * (options.volume ?? 1);
            playTone({ frequency: 720, type: "triangle", duration: 0.035, volume });
            playTone({ frequency: 1040, type: "sine", duration: 0.045, volume: volume * 0.7, start: 0.028 });
        }

        function playLockToggle() {
            playTone({ frequency: 420, type: "triangle", duration: 0.06, volume: 0.08, slideTo: 620 });
            playTone({ frequency: 830, type: "sine", duration: 0.045, volume: 0.06, start: 0.055 });
        }

        function playDrawStart() {
            playTone({ frequency: 240, type: "triangle", duration: 0.12, volume: 0.055, slideTo: 380 });
            playTone({ frequency: 620, type: "sine", duration: 0.075, volume: 0.06, start: 0.08 });
            playNoise({ duration: 0.1, volume: 0.018, filterType: "bandpass", frequency: 980, endFrequency: 1480 });
        }

        function playCapsuleDrop(options = {}) {
            const rate = options.rate ?? 1;
            const volume = (options.volume ?? 1) * 0.085;
            playTone({ frequency: 260 * rate, type: "triangle", duration: 0.12, volume, slideTo: 120 * rate });
            playNoise({ duration: 0.08, volume: volume * 0.52, filterType: "lowpass", frequency: 520, endFrequency: 180 });
        }

        function playCapsuleOpen(options = {}) {
            const volume = (options.volume ?? 1) * 0.09;
            playNoise({ duration: 0.11, volume: volume * 0.72, filterType: "highpass", frequency: 900, endFrequency: 1600 });
            playTone({ frequency: 520, type: "triangle", duration: 0.09, volume, slideTo: 920 });
            playTone({ frequency: 1080, type: "sine", duration: 0.06, volume: volume * 0.62, start: 0.055 });
        }

        function playBurst(options = {}) {
            const volume = options.volume ?? 1;
            playNoise({ duration: 0.22, volume: 0.07 * volume, filterType: "bandpass", frequency: 900, endFrequency: 2400 });
            playTone({ frequency: 720, type: "sine", duration: 0.22, volume: 0.08 * volume, slideTo: 1440 });
            playTone({ frequency: 1080, type: "triangle", duration: 0.18, volume: 0.055 * volume, start: 0.04, slideTo: 1720 });
        }

        function playReward(options = {}) {
            const volume = options.volume ?? 1;
            [660, 880, 1175, 1568].forEach((frequency, index) => {
                playTone({
                    frequency,
                    type: "sine",
                    duration: 0.16,
                    volume: 0.055 * volume,
                    start: index * 0.07
                });
            });
            playNoise({ duration: 0.24, volume: 0.025 * volume, start: 0.08, filterType: "highpass", frequency: 2200, endFrequency: 3800 });
        }

        function playError() {
            playTone({ frequency: 220, type: "triangle", duration: 0.1, volume: 0.08, slideTo: 150 });
            playTone({ frequency: 150, type: "triangle", duration: 0.12, volume: 0.07, start: 0.09, slideTo: 120 });
        }

        function startLoop(name) {
            unlock();

            if (name !== "machine-spin" || activeLoops.has(name)) {
                return;
            }

            const ctx = getContext();

            if (!ctx || !masterGain) {
                return;
            }

            const gain = ctx.createGain();
            const filter = ctx.createBiquadFilter();
            const oscillator = ctx.createOscillator();
            const subOscillator = ctx.createOscillator();
            const lfo = ctx.createOscillator();
            const lfoGain = ctx.createGain();
            const startTime = ctx.currentTime;

            oscillator.type = "triangle";
            oscillator.frequency.value = 164;
            subOscillator.type = "sine";
            subOscillator.frequency.value = 246;
            lfo.type = "sine";
            lfo.frequency.value = 10.5;
            lfoGain.gain.value = 0.006;
            filter.type = "lowpass";
            filter.frequency.value = 820;

            gain.gain.setValueAtTime(0.0001, startTime);
            gain.gain.linearRampToValueAtTime(0.018, startTime + 0.08);

            lfo.connect(lfoGain);
            lfoGain.connect(gain.gain);
            oscillator.connect(filter);
            subOscillator.connect(filter);
            filter.connect(gain);
            gain.connect(masterGain);

            oscillator.start(startTime);
            subOscillator.start(startTime);
            lfo.start(startTime);

            activeLoops.set(name, {
                gain,
                nodes: [oscillator, subOscillator, lfo]
            });
        }

        function stopLoop(name) {
            const ctx = getContext();
            const loop = activeLoops.get(name);

            if (!ctx || !loop) {
                return;
            }

            const stopTime = ctx.currentTime + 0.18;
            loop.gain.gain.cancelScheduledValues(ctx.currentTime);
            loop.gain.gain.setValueAtTime(Math.max(loop.gain.gain.value, 0.0001), ctx.currentTime);
            loop.gain.gain.exponentialRampToValueAtTime(0.0001, stopTime);
            loop.nodes.forEach((node) => {
                node.stop(stopTime + 0.04);
            });
            activeLoops.delete(name);
        }

        return {
            unlock,
            play,
            setVolume,
            getVolume,
            startLoop,
            stopLoop
        };
    }

    function calculateFlight(count) {
        const sceneRect = scene.getBoundingClientRect();
        const chuteRect = chuteTarget.getBoundingClientRect();
        const stageRect = revealStage.getBoundingClientRect();
        const starts = [];
        const ends = [];
        const cluster = [];
        const chute = {
            x: chuteRect.left - sceneRect.left + chuteRect.width / 2 - 19,
            y: chuteRect.top - sceneRect.top + chuteRect.height / 2 - 19
        };
        const center = {
            x: stageRect.left - sceneRect.left + stageRect.width / 2 - 19,
            y: stageRect.top - sceneRect.top + stageRect.height / 2 - 19
        };
        const startOffsetY = 10;

        for (let index = 0; index < count; index += 1) {
            const angle = -Math.PI / 2 + index * ((Math.PI * 2) / Math.max(count, 1));
            const radiusX = count === 1 ? 0 : 48;
            const radiusY = count === 1 ? 0 : 34;

            starts.push({
                x: chute.x + (index - (count - 1) / 2) * 2,
                y: chute.y + startOffsetY
            });
            ends.push({
                x: center.x + Math.cos(angle) * radiusX,
                y: center.y + Math.sin(angle) * radiusY
            });
            cluster.push({
                x: Math.cos(angle) * radiusX,
                y: Math.sin(angle) * radiusY
            });
        }

        return {
            starts,
            ends,
            center,
            cluster,
            chute
        };
    }
});
